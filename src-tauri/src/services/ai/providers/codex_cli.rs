use async_trait::async_trait;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use crate::services::ai::{AiProvider, AiProviderInfo, AiRequest, AiResponse, AiEvent, AiEventSender, ProviderType};

pub struct CodexCliProvider {
    info: AiProviderInfo,
}

impl CodexCliProvider {
    pub fn new() -> Self {
        Self {
            info: AiProviderInfo {
                id: "codex-cli".to_string(),
                name: "Codex CLI".to_string(),
                provider_type: ProviderType::Cli,
                enabled: false,
            },
        }
    }
}

#[async_trait]
impl AiProvider for CodexCliProvider {
    fn info(&self) -> &AiProviderInfo { &self.info }

    async fn call_streaming(&self, request: AiRequest, tx: AiEventSender) -> Result<AiResponse, String> {
        let cmd_str = if request.provider_config.command.is_empty() {
            "codex".to_string()
        } else {
            request.provider_config.command.clone()
        };

        // Codex CLI takes prompt directly as a positional argument, not via -p.
        // It does not support --output-format or --verbose flags.
        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.arg("/C").arg(&cmd_str);
            c
        } else {
            Command::new(&cmd_str)
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

        while let Ok(Some(line)) = reader.next_line().await {
            if !final_text.is_empty() { final_text.push('\n'); }
            final_text.push_str(&line);
            let _ = tx.send(AiEvent::TextDelta { text: line });
        }
        let _ = tx.send(AiEvent::Done);

        let status = child.wait().await.map_err(|e| format!("CLI wait error: {}", e))?;
        if !status.success() {
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
        let cmd_str = if request.provider_config.command.is_empty() {
            "codex".to_string()
        } else {
            request.provider_config.command.clone()
        };

        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.arg("/C").arg(&cmd_str);
            c
        } else {
            Command::new(&cmd_str)
        };

        cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
        let mut child = cmd.spawn().map_err(|e| format!("CLI exec error: {}", e))?;
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(request.prompt.as_bytes()).await;
        }
        let output = child.wait_with_output().await.map_err(|e| format!("CLI wait error: {}", e))?;
        if output.status.success() {
            Ok(AiResponse { output: String::from_utf8_lossy(&output.stdout).to_string(), token_count: None })
        } else {
            Err(format!("CLI error: {}", String::from_utf8_lossy(&output.stderr)))
        }
    }
}
