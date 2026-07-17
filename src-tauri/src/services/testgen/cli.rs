use std::path::Path;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

/// Fixed args: print mode, stream-json, auto-approve edits, deny Bash.
pub fn claude_args() -> Vec<&'static str> {
    vec![
        "-p", "--output-format", "stream-json", "--verbose",
        "--permission-mode", "acceptEdits",
        "--disallowedTools", "Bash",
    ]
}

/// Run `claude -p` in `cwd` with the prompt on stdin, streaming progress to the
/// frontend via the `testgen-stream` event. Returns the final result text.
pub async fn run_claude_streaming(
    command: &str,
    prompt: &str,
    cwd: &Path,
    app: &AppHandle,
) -> Result<String, String> {
    let args = claude_args();
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(command);
        for a in &args { c.arg(a); }
        c
    } else {
        let mut c = Command::new(command);
        for a in &args { c.arg(a); }
        c
    };
    cmd.current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd.spawn().map_err(|e| format!("CLI execution error: {}", e))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(prompt.as_bytes()).await;
    }

    let stdout = child.stdout.take().ok_or("no stdout handle")?;
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
                        let _ = app.emit("testgen-stream", serde_json::json!({"kind":"thinking","tokens":n}));
                    }
                }
            }
            "assistant" => {
                if let Some(content) = val.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
                    for block in content {
                        if block.get("type").and_then(|v| v.as_str()) == Some("text") {
                            if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                                let _ = app.emit("testgen-stream", serde_json::json!({"kind":"text","text":text}));
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
                let _ = app.emit("testgen-stream", serde_json::json!({"kind":"done"}));
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
    Ok(final_text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_args_auto_approve_edits_and_deny_bash() {
        let a = claude_args();
        assert!(a.windows(2).any(|w| w[0] == "--permission-mode" && w[1] == "acceptEdits"));
        assert!(a.windows(2).any(|w| w[0] == "--disallowedTools" && w[1] == "Bash"));
        assert!(a.contains(&"-p"));
    }
}
