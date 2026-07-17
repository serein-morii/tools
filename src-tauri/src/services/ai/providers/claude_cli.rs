use async_trait::async_trait;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use crate::services::ai::{AiProvider, AiProviderInfo, AiRequest, AiResponse, AiEvent, AiEventSender, ProviderType};

pub struct ClaudeCliProvider {
    info: AiProviderInfo,
}

impl ClaudeCliProvider {
    pub fn new() -> Self {
        Self {
            info: AiProviderInfo {
                id: "claude-cli".to_string(),
                name: "Claude Code CLI".to_string(),
                provider_type: ProviderType::Cli,
                enabled: true,
            },
        }
    }

    fn build_args(continue_session: bool, extra_args: &[String]) -> Vec<String> {
        let mut args = vec![
            "-p".to_string(),
            "--output-format".to_string(), "stream-json".to_string(),
            "--verbose".to_string(),
        ];
        if continue_session {
            args.push("--continue".to_string());
        }
        args.extend(extra_args.iter().cloned());
        args
    }
}

#[async_trait]
impl AiProvider for ClaudeCliProvider {
    fn info(&self) -> &AiProviderInfo {
        &self.info
    }

    async fn call_streaming(&self, request: AiRequest, tx: AiEventSender) -> Result<AiResponse, String> {
        let cmd_str = if request.provider_config.command.is_empty() {
            "claude".to_string()
        } else {
            request.provider_config.command.clone()
        };
        let args = Self::build_args(request.continue_session, &request.provider_config.extra_args);

        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.arg("/C").arg(&cmd_str);
            for a in &args { c.arg(a); }
            c
        } else {
            let mut c = Command::new(&cmd_str);
            for a in &args { c.arg(a); }
            c
        };

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let mut child = cmd.spawn().map_err(|e| format!("CLI exec error: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(request.prompt.as_bytes()).await;
        }

        let stdout = child.stdout.take().ok_or("no stdout")?;
        let stderr = child.stderr.take();
        let mut reader = BufReader::new(stdout).lines();
        let mut final_text = String::new();
        let mut had_error = false;
        let mut last_thinking = 0i64;

        while let Ok(Some(line)) = reader.next_line().await {
            let val: serde_json::Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let t = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
            match t {
                "system" => {
                    if val.get("subtype").and_then(|v| v.as_str()) == Some("thinking_tokens") {
                        let n = val.get("estimated_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                        if n - last_thinking >= 10 || n < last_thinking {
                            last_thinking = n;
                            let _ = tx.send(AiEvent::Thinking { tokens: n });
                        }
                    }
                }
                "assistant" => {
                    if let Some(content) = val.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
                        for block in content {
                            if block.get("type").and_then(|v| v.as_str()) == Some("text") {
                                if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                                    let _ = tx.send(AiEvent::TextDelta { text: text.to_string() });
                                }
                            }
                        }
                    }
                }
                "result" => {
                    if val.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false) {
                        had_error = true;
                    }
                    if let Some(r) = val.get("result").and_then(|v| v.as_str()) {
                        final_text = r.to_string();
                    }
                    let _ = tx.send(AiEvent::Done);
                }
                _ => {}
            }
        }

        let status = child.wait().await.map_err(|e| format!("CLI wait error: {}", e))?;
        if !status.success() || had_error {
            let mut err_text = String::new();
            if let Some(mut se) = stderr {
                let _ = se.read_to_string(&mut err_text).await;
            }
            return Err(if err_text.trim().is_empty() {
                format!("CLI exited with status {}", status)
            } else {
                format!("CLI error: {}", err_text)
            });
        }
        if final_text.trim().is_empty() {
            return Err("CLI returned no result text".to_string());
        }
        Ok(AiResponse { output: final_text, token_count: None })
    }

    async fn call(&self, request: AiRequest) -> Result<AiResponse, String> {
        // Non-streaming: simplify by using streaming internally, but don't emit events
        let cmd_str = if request.provider_config.command.is_empty() {
            "claude".to_string()
        } else {
            request.provider_config.command.clone()
        };
        let args = Self::build_args(request.continue_session, &request.provider_config.extra_args);

        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.arg("/C").arg(&cmd_str);
            for a in &args { c.arg(a); }
            c
        } else {
            let mut c = Command::new(&cmd_str);
            for a in &args { c.arg(a); }
            c
        };

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let mut child = cmd.spawn().map_err(|e| format!("CLI exec error: {}", e))?;
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(request.prompt.as_bytes()).await;
        }
        let output = child.wait_with_output().await.map_err(|e| format!("CLI wait error: {}", e))?;
        if output.status.success() {
            Ok(AiResponse {
                output: String::from_utf8_lossy(&output.stdout).to_string(),
                token_count: None,
            })
        } else {
            Err(format!("CLI error: {}", String::from_utf8_lossy(&output.stderr)))
        }
    }
}
