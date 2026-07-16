use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

pub enum SummaryMethod {
    #[allow(dead_code)]
    Cli { command: String },
    Api { provider: String, api_key: String, model: String },
    #[allow(dead_code)]
    Manual,
}

pub struct Summarizer;

impl Summarizer {
    /// Summarize using the given method. Returns the summary text.
    pub async fn summarize(prompt: &str, method: &SummaryMethod) -> Result<String, String> {
        match method {
            SummaryMethod::Cli { command } => {
                Self::summarize_via_cli(command, prompt).await
            }
            SummaryMethod::Api { provider, api_key, model } => {
                Self::summarize_via_api(provider, api_key, model, prompt).await
            }
            SummaryMethod::Manual => {
                Ok(format!("[MANUAL_PROMPT]{}", prompt))
            }
        }
    }

    /// Like `summarize_via_cli` but uses `--output-format stream-json --verbose`
    /// and streams live progress to the frontend:
    ///   - thinking-token counts as Claude thinks (throttled)
    ///   - the assistant text block when it arrives
    ///   - a `done` marker when the result event lands
    /// Returns the final result text.
    pub async fn summarize_cli_streaming(
        command: &str,
        prompt: &str,
        app: &AppHandle,
    ) -> Result<String, String> {
        use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};

        let result = async {
            let mut cmd = if cfg!(target_os = "windows") {
                let mut c = Command::new("cmd");
                c.arg("/C").arg(command).arg("-p")
                    .arg("--output-format").arg("stream-json").arg("--verbose");
                c
            } else {
                let mut c = Command::new(command);
                c.arg("-p").arg("--output-format").arg("stream-json").arg("--verbose");
                c
            };
            cmd.stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true);

            let mut child = cmd
                .spawn()
                .map_err(|e| format!("CLI execution error: {}", e))?;

            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(prompt.as_bytes()).await;
            }

            let stdout = child.stdout.take().ok_or("no stdout handle")?;
            let stderr = child.stderr.take();

            let mut reader = BufReader::new(stdout).lines();
            let mut final_text = String::new();
            let mut last_thinking_emit = 0i64;
            let mut had_error = false;

            while let Ok(Some(line)) = reader.next_line().await {
                let val: serde_json::Value = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let t = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
                match t {
                    "system" => {
                        let sub = val.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
                        if sub == "thinking_tokens" {
                            let n = val.get("estimated_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                            // Throttle: emit every ~10 tokens to avoid IPC spam.
                            if n - last_thinking_emit >= 10 || n < last_thinking_emit {
                                last_thinking_emit = n;
                                let _ = app.emit(
                                    "report-gen-stream",
                                    serde_json::json!({ "kind": "thinking", "tokens": n }),
                                );
                            }
                        }
                        // Ignore hook_started / hook_response / init noise.
                    }
                    "assistant" => {
                        if let Some(content) = val
                            .get("message")
                            .and_then(|m| m.get("content"))
                            .and_then(|c| c.as_array())
                        {
                            for block in content {
                                let bt = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                                if bt == "text" {
                                    if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                                        let _ = app.emit(
                                            "report-gen-stream",
                                            serde_json::json!({ "kind": "text", "text": text }),
                                        );
                                    }
                                }
                            }
                        }
                    }
                    "result" => {
                        let is_error = val.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false);
                        if is_error {
                            had_error = true;
                        }
                        if let Some(r) = val.get("result").and_then(|v| v.as_str()) {
                            final_text = r.to_string();
                        }
                        let _ = app.emit("report-gen-stream", serde_json::json!({ "kind": "done" }));
                    }
                    _ => {}
                }
            }

            let status = child
                .wait()
                .await
                .map_err(|e| format!("CLI wait error: {}", e))?;

            if !status.success() || had_error {
                let mut err_text = String::new();
                if let Some(mut se) = stderr {
                    let _ = se.read_to_string(&mut err_text).await;
                }
                let msg = if err_text.trim().is_empty() {
                    format!("CLI exited with status {}", status)
                } else {
                    format!("CLI error: {}", err_text)
                };
                return Err(msg);
            }

            if final_text.trim().is_empty() {
                return Err("CLI returned no result text".to_string());
            }
            Ok(final_text)
        }
        .await;

        match result {
            Ok(text) => Ok(text),
            Err(e) => Err(e),
        }
    }

    async fn summarize_via_cli(command: &str, prompt: &str) -> Result<String, String> {
        let result = async {
            // On Windows the CLI is installed as a `.cmd` shim (e.g. claude.cmd) which
            // CreateProcess can't launch directly; invoke via `cmd /C` so PATHEXT
            // resolves it. Pass the prompt via stdin to avoid shell escaping and the
            // 8191-char Windows command-line limit. Assumes a `claude -p`-style
            // interface that reads the prompt from stdin.
            let mut cmd = if cfg!(target_os = "windows") {
                let mut c = Command::new("cmd");
                c.arg("/C").arg(command).arg("-p");
                c
            } else {
                let mut c = Command::new(command);
                c.arg("-p");
                c
            };
            cmd.stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

            let mut child = cmd
                .spawn()
                .map_err(|e| format!("CLI execution error: {}", e))?;

            // Write the prompt to stdin, then close it so the CLI sees EOF.
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(prompt.as_bytes()).await;
            }

            let output = child
                .wait_with_output()
                .await
                .map_err(|e| format!("CLI wait error: {}", e))?;

            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).to_string())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("CLI error: {}", stderr))
            }
        }
        .await;

        match result {
            Ok(text) => Ok(text),
            Err(e) => Err(e),
        }
    }

    async fn summarize_via_api(
        provider: &str,
        api_key: &str,
        model: &str,
        prompt: &str,
    ) -> Result<String, String> {
        let client = reqwest::Client::new();

        match provider {
            "anthropic" => {
                let resp = client
                    .post("https://api.anthropic.com/v1/messages")
                    .header("x-api-key", api_key)
                    .header("anthropic-version", "2023-06-01")
                    .json(&serde_json::json!({
                        "model": model,
                        "max_tokens": 4096,
                        "messages": [{"role": "user", "content": prompt}]
                    }))
                    .send()
                    .await
                    .map_err(|e| format!("API request error: {}", e))?;

                if !resp.status().is_success() {
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_default();
                    return Err(format!("API error {}: {}", status, body));
                }

                let body: serde_json::Value = resp
                    .json()
                    .await
                    .map_err(|e| format!("Parse response error: {}", e))?;

                body.get("content")
                    .and_then(|c| c.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|b| b.get("text"))
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string())
                    .ok_or_else(|| "Unexpected Anthropic API response format".to_string())
            }
            "openai" => {
                let resp = client
                    .post("https://api.openai.com/v1/chat/completions")
                    .header("Authorization", format!("Bearer {}", api_key))
                    .json(&serde_json::json!({
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}]
                    }))
                    .send()
                    .await
                    .map_err(|e| format!("API request error: {}", e))?;

                if !resp.status().is_success() {
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_default();
                    return Err(format!("API error {}: {}", status, body));
                }

                let body: serde_json::Value = resp
                    .json()
                    .await
                    .map_err(|e| format!("Parse response error: {}", e))?;

                body.get("choices")
                    .and_then(|c| c.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|c| c.get("message"))
                    .and_then(|m| m.get("content"))
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string())
                    .ok_or_else(|| "Unexpected OpenAI API response format".to_string())
            }
            _ => Err(format!("Unsupported API provider: {}", provider)),
        }
    }
}
