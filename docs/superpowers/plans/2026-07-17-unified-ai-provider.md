# Unified AI Provider 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 TestGen 和 Activity Reporter 的 AI 调用统一为可扩展的 AI Provider 模块，支持 CLI/API 双模式，全局默认 AI 设置，全局面板展示执行过程。

**Architecture:** Rust 侧定义 `AiProvider` trait + `ProviderRegistry`，4 个内置 provider（claude-cli、codex-cli、anthropic-api、openai-api）通过 Tauri command 暴露给前端。前端新增 `AiContext` 全局面板 + `AiSelector` 组件 + SettingsPage AI 设置区。

**Tech Stack:** Rust (async-trait, reqwest, tokio), TypeScript (React 19, Tauri 2 event), 复用现有 settings 持久化

**Spec:** `docs/superpowers/specs/2026-07-17-unified-ai-provider-design.md`

## Global Constraints

- Rust trait 用 `async_trait` crate（已有依赖）
- 配置通过现有 `settings` 表的 key-value 方式存储
- Tauri 事件命名：`ai-stream`（流式输出）、`ai-progress`（阶段日志）
- CLI provider 全平台支持（Windows 用 `cmd /C` 包装）
- API provider 的 base_url 可自定义
- 前端组件风格遵循项目现有 Tailwind + Radix UI 规范

---

### Task 1: Rust AI 模块基础 - trait + types + registry

**Files:**
- Create: `src-tauri/src/services/ai/mod.rs`
- Create: `src-tauri/src/services/ai/types.rs`
- Modify: `src-tauri/src/services/mod.rs`

**Interfaces:**
- Produces: `AiProviderInfo`, `AiProviderConfig`, `AiRequest`, `AiEvent`, `AiResponse`, `ProviderType`, `AiProvider` trait, `ProviderRegistry`

- [ ] **Step 1: Create `src-tauri/src/services/ai/types.rs`**

```rust
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProviderType {
    #[serde(rename = "cli")]
    Cli,
    #[serde(rename = "api")]
    Api,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProviderInfo {
    pub id: String,
    pub name: String,
    pub provider_type: ProviderType,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProviderConfig {
    pub id: String,
    pub enabled: bool,
    /// CLI: command path (default "claude" / "codex")
    #[serde(default)]
    pub command: String,
    /// CLI: default model name
    #[serde(default)]
    pub default_model: String,
    /// API: api key
    #[serde(default)]
    pub api_key: String,
    /// API: base url
    #[serde(default)]
    pub base_url: String,
    /// API: max tokens
    #[serde(default)]
    pub max_tokens: u32,
    /// Extra args for CLI
    #[serde(default)]
    pub extra_args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProvidersConfig {
    pub providers: Vec<AiProviderConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiRequest {
    pub prompt: String,
    pub provider_config: AiProviderConfig,
    pub continue_session: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind")]
pub enum AiEvent {
    #[serde(rename = "progress")]
    Progress { stage: String, message: String },
    #[serde(rename = "thinking")]
    Thinking { tokens: i64 },
    #[serde(rename = "text")]
    TextDelta { text: String },
    #[serde(rename = "done")]
    Done,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub output: String,
    pub token_count: Option<u32>,
}

/// Channel sender for streaming AI events
pub type AiEventSender = mpsc::UnboundedSender<AiEvent>;
pub type AiEventReceiver = mpsc::UnboundedReceiver<AiEvent>;
```

- [ ] **Step 2: Create `src-tauri/src/services/ai/mod.rs`**

```rust
pub mod types;
pub mod providers;

use std::collections::HashMap;
use std::sync::Arc;
use async_trait::async_trait;
pub use types::*;
use providers::{ClaudeCliProvider, CodexCliProvider, AnthropicApiProvider, OpenAiApiProvider};

#[async_trait]
pub trait AiProvider: Send + Sync {
    fn info(&self) -> &AiProviderInfo;
    /// Streaming call: sends events via `tx`, returns final output
    async fn call_streaming(&self, request: AiRequest, tx: AiEventSender) -> Result<AiResponse, String>;
    /// Non-streaming call: returns output directly
    async fn call(&self, request: AiRequest) -> Result<AiResponse, String>;
}

pub struct ProviderRegistry {
    providers: HashMap<String, Arc<dyn AiProvider>>,
}

impl ProviderRegistry {
    pub fn new() -> Self {
        let mut providers: HashMap<String, Arc<dyn AiProvider>> = HashMap::new();
        let claude_cli = Arc::new(ClaudeCliProvider::new());
        let codex_cli = Arc::new(CodexCliProvider::new());
        let anthropic_api = Arc::new(AnthropicApiProvider::new());
        let openai_api = Arc::new(OpenAiApiProvider::new());

        providers.insert(claude_cli.info().id.clone(), claude_cli);
        providers.insert(codex_cli.info().id.clone(), codex_cli);
        providers.insert(anthropic_api.info().id.clone(), anthropic_api);
        providers.insert(openai_api.info().id.clone(), openai_api);

        Self { providers }
    }

    pub fn list(&self) -> Vec<&AiProviderInfo> {
        self.providers.values().map(|p| p.info()).collect()
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn AiProvider>> {
        self.providers.get(id).cloned()
    }
}
```

- [ ] **Step 3: Modify `src-tauri/src/services/mod.rs`**

Add after line 7 (`pub mod testgen;`):
```rust
pub mod ai;
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1`
Expected: errors are only about missing provider files (created in next tasks)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services/ai/mod.rs src-tauri/src/services/ai/types.rs src-tauri/src/services/mod.rs
git commit -m "feat(ai): add AiProvider trait + types + registry skeleton"
```

---

### Task 2: Rust CLI providers (claude-cli + codex-cli)

**Files:**
- Create: `src-tauri/src/services/ai/providers/mod.rs`
- Create: `src-tauri/src/services/ai/providers/claude_cli.rs`
- Create: `src-tauri/src/services/ai/providers/codex_cli.rs`

**Interfaces:**
- Consumes: `AiProvider` trait, `AiRequest`, `AiEvent`, `AiResponse`, `AiProviderInfo` from Task 1
- Produces: `ClaudeCliProvider`, `CodexCliProvider` implementing `AiProvider`

- [ ] **Step 1: Create `src-tauri/src/services/ai/providers/mod.rs`**

```rust
pub mod claude_cli;
pub mod codex_cli;
pub mod anthropic_api;
pub mod openai_api;

pub use claude_cli::ClaudeCliProvider;
pub use codex_cli::CodexCliProvider;
pub use anthropic_api::AnthropicApiProvider;
pub use openai_api::OpenAiApiProvider;
```

- [ ] **Step 2: Create `src-tauri/src/services/ai/providers/claude_cli.rs`**

```rust
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
```

- [ ] **Step 3: Create `src-tauri/src/services/ai/providers/codex_cli.rs`**

Same structure as `claude_cli.rs` but with:
- `id: "codex-cli"`, `name: "Codex CLI"`, `enabled: false`
- Default command: `"codex"`
- Uses same `--output-format stream-json` parsing (compatible format)

```rust
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
impl AiProvider for CodexCliProvider {
    fn info(&self) -> &AiProviderInfo { &self.info }

    async fn call_streaming(&self, request: AiRequest, tx: AiEventSender) -> Result<AiResponse, String> {
        let cmd_str = if request.provider_config.command.is_empty() {
            "codex".to_string()
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
        let cmd_str = if request.provider_config.command.is_empty() {
            "codex".to_string()
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
```

- [ ] **Step 4: Add `async-trait` dependency if missing**

Run: `grep -n "async-trait" src-tauri/Cargo.toml`
If not found, add to `[dependencies]`:
```toml
async-trait = "0.1"
```

- [ ] **Step 5: Verify compilation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1`
Expected: errors only about missing API providers

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/services/ai/providers/ src-tauri/Cargo.toml
git commit -m "feat(ai): add CLI providers (claude-cli, codex-cli)"
```

---

### Task 3: Rust API providers (anthropic-api + openai-api)

**Files:**
- Create: `src-tauri/src/services/ai/providers/anthropic_api.rs`
- Create: `src-tauri/src/services/ai/providers/openai_api.rs`

**Interfaces:**
- Consumes: `AiProvider` trait, `AiRequest`, `AiResponse`, `AiProviderInfo` from Task 1
- Produces: `AnthropicApiProvider`, `OpenAiApiProvider` implementing `AiProvider`

- [ ] **Step 1: Create `src-tauri/src/services/ai/providers/anthropic_api.rs`**

```rust
use async_trait::async_trait;
use crate::services::ai::{AiProvider, AiProviderInfo, AiRequest, AiResponse, AiEvent, AiEventSender, ProviderType};

pub struct AnthropicApiProvider {
    info: AiProviderInfo,
}

impl AnthropicApiProvider {
    pub fn new() -> Self {
        Self {
            info: AiProviderInfo {
                id: "anthropic-api".to_string(),
                name: "Anthropic API".to_string(),
                provider_type: ProviderType::Api,
                enabled: false,
            },
        }
    }
}

#[async_trait]
impl AiProvider for AnthropicApiProvider {
    fn info(&self) -> &AiProviderInfo { &self.info }

    async fn call_streaming(&self, request: AiRequest, tx: AiEventSender) -> Result<AiResponse, String> {
        let cfg = &request.provider_config;
        let base = if cfg.base_url.is_empty() { "https://api.anthropic.com".to_string() } else { cfg.base_url.clone() };
        let model = if cfg.default_model.is_empty() { "claude-sonnet-4-20250514".to_string() } else { cfg.default_model.clone() };
        let max_tokens = if cfg.max_tokens == 0 { 4096 } else { cfg.max_tokens };

        let client = reqwest::Client::new();
        let resp = client
            .post(format!("{}/v1/messages", base))
            .header("x-api-key", &cfg.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&serde_json::json!({
                "model": model,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": request.prompt}]
            }))
            .send()
            .await
            .map_err(|e| format!("API request error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, body));
        }

        let body: serde_json::Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
        let text = body.get("content")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|b| b.get("text"))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "Unexpected Anthropic API response format".to_string())?;

        let tokens = body.get("usage").and_then(|u| u.get("input_tokens")).and_then(|t| t.as_u64()).map(|t| t as u32);

        // For API, we send the full text as one delta (no true streaming yet)
        let _ = tx.send(AiEvent::TextDelta { text: text.clone() });
        let _ = tx.send(AiEvent::Done);

        Ok(AiResponse { output: text, token_count: tokens })
    }

    async fn call(&self, request: AiRequest) -> Result<AiResponse, String> {
        let cfg = &request.provider_config;
        let base = if cfg.base_url.is_empty() { "https://api.anthropic.com".to_string() } else { cfg.base_url.clone() };
        let model = if cfg.default_model.is_empty() { "claude-sonnet-4-20250514".to_string() } else { cfg.default_model.clone() };
        let max_tokens = if cfg.max_tokens == 0 { 4096 } else { cfg.max_tokens };

        let client = reqwest::Client::new();
        let resp = client
            .post(format!("{}/v1/messages", base))
            .header("x-api-key", &cfg.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&serde_json::json!({
                "model": model,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": request.prompt}]
            }))
            .send()
            .await
            .map_err(|e| format!("API request error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, body));
        }

        let body: serde_json::Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
        let text = body.get("content")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|b| b.get("text"))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "Unexpected Anthropic API response format".to_string())?;

        let tokens = body.get("usage").and_then(|u| u.get("input_tokens")).and_then(|t| t.as_u64()).map(|t| t as u32);
        Ok(AiResponse { output: text, token_count: tokens })
    }
}
```

- [ ] **Step 2: Create `src-tauri/src/services/ai/providers/openai_api.rs`**

```rust
use async_trait::async_trait;
use crate::services::ai::{AiProvider, AiProviderInfo, AiRequest, AiResponse, AiEvent, AiEventSender, ProviderType};

pub struct OpenAiApiProvider {
    info: AiProviderInfo,
}

impl OpenAiApiProvider {
    pub fn new() -> Self {
        Self {
            info: AiProviderInfo {
                id: "openai-api".to_string(),
                name: "OpenAI API".to_string(),
                provider_type: ProviderType::Api,
                enabled: false,
            },
        }
    }
}

#[async_trait]
impl AiProvider for OpenAiApiProvider {
    fn info(&self) -> &AiProviderInfo { &self.info }

    async fn call_streaming(&self, request: AiRequest, tx: AiEventSender) -> Result<AiResponse, String> {
        let cfg = &request.provider_config;
        let base = if cfg.base_url.is_empty() { "https://api.openai.com".to_string() } else { cfg.base_url.clone() };
        let model = if cfg.default_model.is_empty() { "gpt-4o".to_string() } else { cfg.default_model.clone() };

        let client = reqwest::Client::new();
        let resp = client
            .post(format!("{}/v1/chat/completions", base))
            .header("Authorization", format!("Bearer {}", cfg.api_key))
            .json(&serde_json::json!({
                "model": model,
                "messages": [{"role": "user", "content": request.prompt}]
            }))
            .send()
            .await
            .map_err(|e| format!("API request error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, body));
        }

        let body: serde_json::Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
        let text = body.get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "Unexpected OpenAI API response format".to_string())?;

        let tokens = body.get("usage").and_then(|u| u.get("total_tokens")).and_then(|t| t.as_u64()).map(|t| t as u32);

        let _ = tx.send(AiEvent::TextDelta { text: text.clone() });
        let _ = tx.send(AiEvent::Done);

        Ok(AiResponse { output: text, token_count: tokens })
    }

    async fn call(&self, request: AiRequest) -> Result<AiResponse, String> {
        let cfg = &request.provider_config;
        let base = if cfg.base_url.is_empty() { "https://api.openai.com".to_string() } else { cfg.base_url.clone() };
        let model = if cfg.default_model.is_empty() { "gpt-4o".to_string() } else { cfg.default_model.clone() };

        let client = reqwest::Client::new();
        let resp = client
            .post(format!("{}/v1/chat/completions", base))
            .header("Authorization", format!("Bearer {}", cfg.api_key))
            .json(&serde_json::json!({
                "model": model,
                "messages": [{"role": "user", "content": request.prompt}]
            }))
            .send()
            .await
            .map_err(|e| format!("API request error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, body));
        }

        let body: serde_json::Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
        let text = body.get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "Unexpected OpenAI API response format".to_string())?;

        let tokens = body.get("usage").and_then(|u| u.get("total_tokens")).and_then(|t| t.as_u64()).map(|t| t as u32);
        Ok(AiResponse { output: text, token_count: tokens })
    }
}
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/ai/providers/anthropic_api.rs src-tauri/src/services/ai/providers/openai_api.rs
git commit -m "feat(ai): add API providers (anthropic-api, openai-api)"
```

---

### Task 4: Rust Tauri command + registration

**Files:**
- Create: `src-tauri/src/commands/ai.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `ProviderRegistry`, `AiProviderConfig`, `AiRequest` from Tasks 1-3
- Produces: `list_ai_providers`, `call_ai` Tauri commands

- [ ] **Step 1: Create `src-tauri/src/commands/ai.rs`**

```rust
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::services::ai::{
    AiEvent, AiEventSender, AiProviderConfig, AiProvidersConfig, AiRequest, ProviderRegistry,
};

#[tauri::command]
pub async fn list_ai_providers(
    registry: State<'_, Arc<ProviderRegistry>>,
) -> Result<Vec<crate::services::ai::AiProviderInfo>, String> {
    Ok(registry.list().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn call_ai(
    app: AppHandle,
    registry: State<'_, Arc<ProviderRegistry>>,
    provider_id: String,
    prompt: String,
    config_json: String,
    continue_session: bool,
) -> Result<crate::services::ai::AiResponse, String> {
    let config: AiProviderConfig = serde_json::from_str(&config_json)
        .map_err(|e| format!("Invalid config JSON: {}", e))?;

    let provider = registry
        .get(&provider_id)
        .ok_or_else(|| format!("Unknown AI provider: {}", provider_id))?;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<AiEvent>();

    let request = AiRequest {
        prompt,
        provider_config: config,
        continue_session,
    };

    // Spawn the AI call, forwarding events to frontend
    let app_handle = app.clone();
    let provider_clone = provider.clone();

    let handle = tokio::spawn(async move {
        provider_clone.call_streaming(request, tx).await
    });

    // Forward events to frontend
    while let Some(event) = rx.recv().await {
        let serialized = serde_json::to_value(&event).unwrap_or_default();
        let _ = app_handle.emit("ai-stream", serialized);
    }

    handle.await.map_err(|e| format!("Task join error: {}", e))?
}
```

- [ ] **Step 2: Modify `src-tauri/src/commands/mod.rs`**

Add:
```rust
pub mod ai;
```
And:
```rust
pub use ai::*;
```

- [ ] **Step 3: Modify `src-tauri/src/lib.rs`**

Add the registry to the app state and register commands:

Find the `.manage()` calls (around line 68-70) and add:
```rust
.manage(Arc::new(services::ai::ProviderRegistry::new()))
```

Find the `tauri::generate_handler![]` block and add:
```rust
commands::list_ai_providers,
commands::call_ai,
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/ai.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(ai): add list_ai_providers + call_ai Tauri commands"
```

---

### Task 5: Frontend AI API + React Query hooks

**Files:**
- Create: `src/lib/api/ai.ts`
- Create: `src/lib/query/aiQueries.ts`

**Interfaces:**
- Consumes: Tauri `invoke`, settings from existing `settingsQueries`
- Produces: `listAiProviders()`, `callAi()`, `useAiProviders()`, `useAiConfig()`, `useUpdateAiConfig()`

- [ ] **Step 1: Create `src/lib/api/ai.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";

export interface AiProviderInfo {
  id: string;
  name: string;
  provider_type: "cli" | "api";
  enabled: boolean;
}

export interface AiProviderConfig {
  id: string;
  enabled: boolean;
  command: string;
  default_model: string;
  api_key: string;
  base_url: string;
  max_tokens: number;
  extra_args: string[];
}

export interface AiProvidersConfig {
  providers: AiProviderConfig[];
}

export interface AiResponse {
  output: string;
  token_count: number | null;
}

export async function listAiProviders(): Promise<AiProviderInfo[]> {
  return invoke<AiProviderInfo[]>("list_ai_providers");
}

export async function callAi(params: {
  providerId: string;
  prompt: string;
  configJson: string;
  continueSession: boolean;
}): Promise<AiResponse> {
  return invoke<AiResponse>("call_ai", {
    providerId: params.providerId,
    prompt: params.prompt,
    configJson: params.configJson,
    continueSession: params.continueSession,
  });
}

export function getDefaultProvidersConfig(): AiProvidersConfig {
  return {
    providers: [
      {
        id: "claude-cli", enabled: true,
        command: "", default_model: "",
        api_key: "", base_url: "", max_tokens: 0, extra_args: ["--permission-mode", "acceptEdits", "--disallowedTools", "Bash"],
      },
      {
        id: "codex-cli", enabled: false,
        command: "", default_model: "",
        api_key: "", base_url: "", max_tokens: 0, extra_args: [],
      },
      {
        id: "anthropic-api", enabled: false,
        command: "", default_model: "claude-sonnet-4-20250514",
        api_key: "", base_url: "https://api.anthropic.com", max_tokens: 4096, extra_args: [],
      },
      {
        id: "openai-api", enabled: false,
        command: "", default_model: "gpt-4o",
        api_key: "", base_url: "https://api.openai.com", max_tokens: 4096, extra_args: [],
      },
    ],
  };
}
```

- [ ] **Step 2: Create `src/lib/query/aiQueries.ts`**

```typescript
import { useQuery } from "@tanstack/react-query";
import { listAiProviders, getDefaultProvidersConfig, type AiProvidersConfig, type AiProviderConfig } from "@/lib/api/ai";
import { useSettings, getSettingValue, useUpdateSetting } from "@/lib/query/settingsQueries";

export function useAiProviders() {
  return useQuery({
    queryKey: ["ai-providers"],
    queryFn: listAiProviders,
    staleTime: 60_000,
  });
}

export function useAiProvidersConfig(): AiProvidersConfig {
  const { data: settings } = useSettings();
  const raw = getSettingValue(settings, "ai_providers_config", "");
  if (!raw) return getDefaultProvidersConfig();
  try {
    return JSON.parse(raw) as AiProvidersConfig;
  } catch {
    return getDefaultProvidersConfig();
  }
}

export function getProviderConfig(config: AiProvidersConfig, providerId: string): AiProviderConfig | undefined {
  return config.providers.find((p) => p.id === providerId);
}

export function getEnabledProviders(config: AiProvidersConfig): AiProviderConfig[] {
  return config.providers.filter((p) => p.enabled);
}

export function useDefaultProviderId(): string {
  const { data: settings } = useSettings();
  return getSettingValue(settings, "ai_default_provider", "claude-cli");
}

export function useSaveAiProvidersConfig() {
  const updateSetting = useUpdateSetting();
  return (config: AiProvidersConfig) => {
    updateSetting.mutate({ key: "ai_providers_config", value: JSON.stringify(config) });
  };
}

export function useSaveDefaultProvider() {
  const updateSetting = useUpdateSetting();
  return (providerId: string) => {
    updateSetting.mutate({ key: "ai_default_provider", value: providerId });
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/api/ai.ts src/lib/query/aiQueries.ts
git commit -m "feat(ai): add frontend AI API + React Query hooks"
```

---

### Task 6: Frontend AiContext (global AI execution panel)

**Files:**
- Create: `src/lib/AiContext.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `callAi()` from Task 5, `AiProviderConfig` from Task 5
- Produces: `AiProvider` wrapping app, `useAi()` hook, global floating panel

- [ ] **Step 1: Create `src/lib/AiContext.tsx`**

```tsx
import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { RefreshCw, Minus, X } from "lucide-react";
import { callAi, type AiProviderConfig, type AiResponse } from "./api/ai";

export type RunStatus = "idle" | "running" | "done" | "error";

export interface AiLog {
  time: number;
  stage: string;
  text: string;
}

export interface AiCallRequest {
  providerId: string;
  providerConfig: AiProviderConfig;
  prompt: string;
  continueSession?: boolean;
  onDone?: (result: AiResponse) => void;
  onError?: (error: string) => void;
}

interface AiContextValue {
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  panelMinimized: boolean;
  setPanelMinimized: (v: boolean) => void;
  status: RunStatus;
  logs: AiLog[];
  appendLog: (stage: string, text: string) => void;
  thinkingTokens: number | null;
  streamText: string;
  displayedText: string;
  currentProviderName: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  startRun: (req: AiCallRequest) => Promise<void>;
  runId: number;
}

const AiContext = createContext<AiContextValue | null>(null);

export function useAi() {
  const ctx = useContext(AiContext);
  if (!ctx) throw new Error("useAi must be used within AiProvider");
  return ctx;
}

export function AiProvider({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [logs, setLogs] = useState<AiLog[]>([]);
  const [thinkingTokens, setThinkingTokens] = useState<number | null>(null);
  const [streamText, setStreamText] = useState("");
  const [displayedText, setDisplayedText] = useState("");
  const [currentProviderName, setCurrentProviderName] = useState("");
  const [runId, setRunId] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const appendLog = useCallback((stage: string, text: string) => {
    setLogs((p) => [...p, { time: Date.now(), stage, text }]);
  }, []);

  // Typewriter effect
  useEffect(() => {
    if (!streamText) { setDisplayedText(""); return; }
    setDisplayedText("");
    let i = 0;
    const total = streamText.length;
    const step = Math.max(2, Math.ceil(total / 240));
    const id = setInterval(() => {
      i += step;
      if (i >= total) { setDisplayedText(streamText); clearInterval(id); }
      else setDisplayedText(streamText.slice(0, i));
    }, 16);
    return () => clearInterval(id);
  }, [streamText]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs, displayedText, thinkingTokens]);

  const startRun = useCallback(async (req: AiCallRequest) => {
    setLogs([]);
    setStreamText("");
    setThinkingTokens(null);
    setStatus("running");
    setPanelOpen(true);
    setPanelMinimized(false);
    setCurrentProviderName(req.providerConfig.id);

    appendLog("start", `AI Provider: ${req.providerConfig.id}`);
    appendLog("prompt", `Prompt length: ${req.prompt.length} chars`);

    const unlisten = await listen<{ kind: string; stage?: string; message?: string; tokens?: number; text?: string }>(
      "ai-stream",
      (e) => {
        switch (e.payload.kind) {
          case "progress":
            appendLog(e.payload.stage ?? "info", e.payload.message ?? "");
            break;
          case "thinking":
            setThinkingTokens(e.payload.tokens ?? 0);
            break;
          case "text":
            setStreamText(e.payload.text ?? "");
            break;
          case "done":
            break;
        }
      }
    );

    try {
      const result = await callAi({
        providerId: req.providerId,
        prompt: req.prompt,
        configJson: JSON.stringify(req.providerConfig),
        continueSession: req.continueSession ?? false,
      });
      setStatus("done");
      appendLog("done", "AI 调用完成");
      req.onDone?.(result);
    } catch (e) {
      setStatus("error");
      const msg = String(e);
      appendLog("error", msg);
      req.onError?.(msg);
    } finally {
      unlisten();
      setRunId((n) => n + 1);
    }
  }, [appendLog]);

  const value: AiContextValue = {
    panelOpen, setPanelOpen,
    panelMinimized, setPanelMinimized,
    status, logs, appendLog,
    thinkingTokens, streamText, displayedText,
    currentProviderName,
    scrollRef,
    startRun, runId,
  };

  return (
    <AiContext.Provider value={value}>
      {children}
      <AiPanel />
    </AiContext.Provider>
  );
}

function AiPanel() {
  const ctx = useContext(AiContext)!;
  const { panelOpen, setPanelOpen, panelMinimized, setPanelMinimized, status, logs, thinkingTokens, streamText, displayedText, currentProviderName, scrollRef } = ctx;

  return (
    <>
      {panelOpen && !panelMinimized && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background border border-border rounded-lg w-[620px] max-w-[92vw] h-[460px] max-h-[82vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <RefreshCw className={`w-3.5 h-3.5 ${status === "running" ? "animate-spin" : ""} text-primary`} />
                <span className="text-sm font-medium">AI 执行过程</span>
                {currentProviderName && (
                  <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{currentProviderName}</span>
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setPanelMinimized(true)} className="p-1.5 rounded hover:bg-secondary"><Minus className="w-3.5 h-3.5" /></button>
                {status !== "running" && (
                  <button onClick={() => setPanelOpen(false)} className="p-1.5 rounded hover:bg-secondary"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-2 space-y-1 text-xs">
              {logs.map((l, i) => (
                <div key={i} className="break-words">
                  <span className="text-[10px] text-muted-foreground/70 mr-1">[{l.stage}]</span>
                  {l.text}
                </div>
              ))}
              {thinkingTokens !== null && !streamText && (
                <div className="text-amber-500">思考中... {thinkingTokens} tokens</div>
              )}
              {displayedText && (
                <div className="whitespace-pre-wrap break-words border-t border-border/40 pt-1">
                  {displayedText}
                  {displayedText.length < (streamText?.length ?? 0) && <span className="animate-pulse">|</span>}
                </div>
              )}
              {status === "error" && (
                <div className="mt-2 pt-2 border-t border-red-500/30 text-red-500">执行失败，详见上方错误日志</div>
              )}
            </div>
          </div>
        </div>
      )}
      {panelMinimized && (
        <button
          onClick={() => setPanelMinimized(false)}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-full shadow-lg"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${status === "running" ? "animate-spin" : ""}`} />
          <span className="text-xs">
            {status === "running" ? "AI 执行中..."
              : status === "done" ? "AI 完成（点击查看）"
              : status === "error" ? "AI 失败（点击查看）"
              : "AI 面板"}
          </span>
        </button>
      )}
    </>
  );
}
```

- [ ] **Step 2: Modify `src/App.tsx` to wrap with AiProvider**

Add import:
```typescript
import { AiProvider } from "@/lib/AiContext";
```

Wrap existing providers with `AiProvider`. Update both the setup wizard and main app branches:

In the setup wizard branch (~line 76-83), change:
```tsx
<TestGenProvider>
<SetupWizard onComplete={handleSetupComplete} />
</TestGenProvider>
```
to:
```tsx
<AiProvider>
<TestGenProvider>
<SetupWizard onComplete={handleSetupComplete} />
</TestGenProvider>
</AiProvider>
```

In the main app branch (~line 86-131), change:
```tsx
<TestGenProvider>
<Suspense ...>
  <Routes>...</Routes>
</Suspense>
</TestGenProvider>
```
to:
```tsx
<AiProvider>
<TestGenProvider>
<Suspense ...>
  <Routes>...</Routes>
</Suspense>
</TestGenProvider>
</AiProvider>
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/AiContext.tsx src/App.tsx
git commit -m "feat(ai): add AiContext global execution panel"
```

---

### Task 7: Frontend AiSelector component

**Files:**
- Create: `src/components/modules/ai/AiSelector.tsx`

**Interfaces:**
- Consumes: `useAiProvidersConfig`, `useDefaultProviderId`, `getEnabledProviders`, `getProviderConfig` from Task 5
- Produces: `<AiSelector>` component with dropdown for provider + model

- [ ] **Step 1: Create `src/components/modules/ai/AiSelector.tsx`**

```tsx
import { useEffect, useState, type FC } from "react";
import {
  useAiProvidersConfig,
  useDefaultProviderId,
  getEnabledProviders,
  getProviderConfig,
} from "@/lib/query/aiQueries";
import type { AiProviderConfig } from "@/lib/api/ai";

interface AiSelectorProps {
  value: AiProviderConfig;
  onChange: (config: AiProviderConfig) => void;
  showModel?: boolean;
}

export const AiSelector: FC<AiSelectorProps> = ({ value, onChange, showModel = true }) => {
  const config = useAiProvidersConfig();
  const defaultId = useDefaultProviderId();
  const providers = getEnabledProviders(config);

  // Initialize from default if no value set
  useEffect(() => {
    if (!value?.id) {
      const def = getProviderConfig(config, defaultId) || providers[0];
      if (def) onChange(def);
    }
  }, []);

  const handleProviderChange = (id: string) => {
    const p = getProviderConfig(config, id);
    if (p) onChange(p);
  };

  const handleModelChange = (model: string) => {
    onChange({ ...value, default_model: model });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={value?.id || ""}
        onChange={(e) => handleProviderChange(e.target.value)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs min-w-[140px]"
      >
        {providers.length === 0 && <option value="">无可用 AI</option>}
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id === defaultId ? "★ " : ""}{p.id}
          </option>
        ))}
      </select>
      {showModel && value.provider_type === "api" && (
        <input
          type="text"
          placeholder="模型名"
          value={value.default_model || ""}
          onChange={(e) => handleModelChange(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs w-[160px]"
        />
      )}
      {showModel && value.provider_type === "cli" && value.id !== "claude-cli" && (
        <input
          type="text"
          placeholder="模型名 (可选)"
          value={value.default_model || ""}
          onChange={(e) => handleModelChange(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs w-[140px]"
        />
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/ai/AiSelector.tsx
git commit -m "feat(ai): add AiSelector component"
```

---

### Task 8: SettingsPage AI settings section

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `useAiProvidersConfig`, `useSaveAiProvidersConfig`, `useDefaultProviderId`, `useSaveDefaultProvider`, `getEnabledProviders` from Task 5
- Produces: New "AI 设置" section in Settings page

- [ ] **Step 1: Add AI settings section to SettingsPage**

Add imports at the top of `src/pages/SettingsPage.tsx`:
```typescript
import { AiSelector } from "@/components/modules/ai/AiSelector";
import {
  useAiProvidersConfig,
  useSaveAiProvidersConfig,
  useDefaultProviderId,
  useSaveDefaultProvider,
  getEnabledProviders,
  getProviderConfig,
} from "@/lib/query/aiQueries";
import type { AiProviderConfig, AiProvidersConfig } from "@/lib/api/ai";
import { getDefaultProvidersConfig } from "@/lib/api/ai";
```

Inside `SettingsPage`, add the AI settings card:

```tsx
<AISettingsCard />
```

Create `AISettingsCard` and `AiProviderRow` (module-level components, outside SettingsPage function) that use hooks properly:

```tsx
function AISettingsCard() {
  const providersConfig = useAiProvidersConfig();
  const defaultProviderId = useDefaultProviderId();
  const saveDefault = useSaveDefaultProvider();
  const saveConfig = useSaveAiProvidersConfig();
  const enabledProviders = getEnabledProviders(providersConfig);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Brain className="w-4 h-4" /> AI 设置
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">默认 AI Provider</span>
          <select
            className="w-full h-8 rounded-md border border-border bg-background px-3 text-sm"
            value={defaultProviderId}
            onChange={(e) => saveDefault(e.target.value)}
          >
            {enabledProviders.length === 0 && <option value="">无可用 AI</option>}
            {enabledProviders.map((p) => (
              <option key={p.id} value={p.id}>{p.id}</option>
            ))}
          </select>
        </div>
        <div className="space-y-3">
          <span className="text-xs text-muted-foreground">Provider 配置</span>
          {providersConfig.providers.map((provider) => (
            <AiProviderRow
              key={provider.id}
              provider={provider}
              onUpdate={(updated) => {
                const idx = providersConfig.providers.findIndex((p) => p.id === updated.id);
                if (idx >= 0) {
                  const newConfig = { ...providersConfig };
                  newConfig.providers[idx] = updated;
                  saveConfig(newConfig);
                }
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AiProviderRow({ provider, onUpdate }: { provider: AiProviderConfig; onUpdate: (p: AiProviderConfig) => void }) {
  const [expanded, setExpanded] = useState(false);
  const providersConfig = useAiProvidersConfig();
  const save = useSaveAiProvidersConfig();

  const update = (partial: Partial<AiProviderConfig>) => {
    const updated = { ...provider, ...partial };
    const idx = providersConfig.providers.findIndex((p) => p.id === updated.id);
    if (idx >= 0) {
      const newConfig = { ...providersConfig };
      newConfig.providers[idx] = updated;
      save(newConfig);
    }
  };

  return (
    <div className="border border-border rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <span className="text-sm font-medium">{provider.id}</span>
          <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{provider.provider_type}</span>
        </div>
        <Switch checked={provider.enabled} onCheckedChange={(v) => update({ enabled: v })} />
      </div>
      {expanded && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          {provider.provider_type === "cli" ? (
            <>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">命令路径（空则用默认）</span>
                <Input
                  value={provider.command}
                  onChange={(e) => update({ command: e.target.value })}
                  placeholder="claude"
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">额外参数（逗号分隔）</span>
                <Input
                  value={provider.extra_args?.join(", ") || ""}
                  onChange={(e) => update({ extra_args: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                  placeholder="--permission-mode, acceptEdits"
                  className="h-7 text-xs"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">Base URL</span>
                <Input
                  value={provider.base_url}
                  onChange={(e) => update({ base_url: e.target.value })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">API Key</span>
                <Input
                  type="password"
                  value={provider.api_key}
                  onChange={(e) => update({ api_key: e.target.value })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">默认模型</span>
                <Input
                  value={provider.default_model}
                  onChange={(e) => update({ default_model: e.target.value })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">Max Tokens</span>
                <Input
                  type="number"
                  value={String(provider.max_tokens || 4096)}
                  onChange={(e) => update({ max_tokens: parseInt(e.target.value) || 0 })}
                  className="h-7 text-xs w-24"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

Add required imports at top:
```typescript
import { ChevronUp, ChevronDown } from "lucide-react";
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat(ai): add AI settings section to SettingsPage"
```

---

### Task 9: Integrate TestGen with new AI module

**Files:**
- Modify: `src-tauri/src/commands/testgen.rs`
- Modify: `src-tauri/src/services/testgen/runner.rs`
- Modify: `src/pages/TestGenPage.tsx`

**Interfaces:**
- Consumes: AI module from Tasks 1-4, `AiSelector` from Task 7, `useAi()` from Task 6
- Produces: TestGen uses unified AI call

- [ ] **Step 1: Modify `src-tauri/src/services/testgen/runner.rs`**

Change the AI calling section. Replace lines 197-203 that hardcode `claude` CLI:

Old code (line 197-203):
```rust
let claude_cmd = req.claude_command.clone().unwrap_or_else(|| "claude".to_string());
let ai_output = cli::run_claude_streaming(&claude_cmd, &prompt, dir, app, cancel_flag, req.continue_session)
    .await
    .map_err(|e| {
        emit("error", format!("AI 失败: {}", e));
        e
    })?;
```

New code:
```rust
// Use AI provider if configured, fall back to direct CLI
let ai_output = if let Some(ref provider_config_json) = req.ai_provider_json {
    use crate::services::ai::{AiProviderConfig, AiRequest, AiEvent};
    use crate::services::ai::ProviderRegistry;
    let config: AiProviderConfig = serde_json::from_str(provider_config_json)
        .map_err(|e| format!("Invalid AI config: {}", e))?;
    let provider_id = config.id.clone();
    let registry = ProviderRegistry::new();
    let provider = registry.get(&provider_id)
        .ok_or_else(|| format!("Unknown AI provider: {}", provider_id))?;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<AiEvent>();
    let request = AiRequest {
        prompt: prompt.clone(),
        provider_config: config,
        continue_session: req.continue_session,
    };
    let handle = tokio::spawn(async move { provider.call_streaming(request, tx).await });
    while let Some(event) = rx.recv().await {
        match event {
            AiEvent::Progress { stage, message } => {
                let _ = app.emit("testgen-progress", serde_json::json!({"stage": stage, "message": message}));
            }
            AiEvent::Thinking { tokens } => {
                let _ = app.emit("testgen-stream", serde_json::json!({"kind": "thinking", "tokens": tokens}));
            }
            AiEvent::TextDelta { text } => {
                let _ = app.emit("testgen-stream", serde_json::json!({"kind": "text", "text": text}));
            }
            AiEvent::Done => {
                let _ = app.emit("testgen-stream", serde_json::json!({"kind": "done"}));
            }
        }
        if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("已取消".to_string());
        }
    }
    handle.await.map_err(|e| format!("AI task error: {}", e))?
        .map(|r| r.output)
        .map_err(|e| { emit("error", format!("AI 失败: {}", e)); e })?
} else {
    let claude_cmd = req.claude_command.clone().unwrap_or_else(|| "claude".to_string());
    cli::run_claude_streaming(&claude_cmd, &prompt, dir, app, cancel_flag, req.continue_session)
        .await
        .map_err(|e| { emit("error", format!("AI 失败: {}", e)); e })?
};
```

- [ ] **Step 2: Modify `src-tauri/src/services/testgen/runner.rs` TestGenRequest**

Add new field to `TestGenRequest`:
```rust
#[serde(default)]
pub ai_provider_json: Option<String>,
```

- [ ] **Step 3: Modify `src/pages/TestGenPage.tsx`**

Add imports:
```typescript
import { AiSelector } from "@/components/modules/ai/AiSelector";
import { useAiProvidersConfig, getProviderConfig, useDefaultProviderId } from "@/lib/query/aiQueries";
import { useAi } from "@/lib/AiContext";
import type { AiProviderConfig } from "@/lib/api/ai";
```

Add AI provider state in TestGenPage component:
```typescript
const providersConfig = useAiProvidersConfig();
const defaultProviderId = useDefaultProviderId();
const [aiProvider, setAiProvider] = useState<AiProviderConfig>(
  () => getProviderConfig(providersConfig, defaultProviderId) || providersConfig.providers[0]
);
```

In the config builder (the `buildConfig()` or similar function that creates the TestGenRequest), add:
```typescript
ai_provider_json: JSON.stringify(aiProvider),
```

Add `<AiSelector>` in the toolbar area (near the existing "AI 命令" input):
```tsx
<AiSelector value={aiProvider} onChange={setAiProvider} />
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1` and `npx tsc --noEmit 2>&1`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/testgen.rs src-tauri/src/services/testgen/runner.rs src/pages/TestGenPage.tsx
git commit -m "feat(ai): integrate TestGen with unified AI module"
```

---

### Task 10: Integrate Activity Reporter with new AI module

**Files:**
- Modify: `src-tauri/src/commands/activity_tracker.rs`
- Modify: `src/pages/ActivityTrackerPage.tsx`
- Modify: `src/lib/api/activity.ts`

**Interfaces:**
- Consumes: AI module from Tasks 1-4, `AiSelector` from Task 7
- Produces: Activity reports use unified AI call instead of hardcoded CLI/API dispatch

- [ ] **Step 1: Modify `src-tauri/src/commands/activity_tracker.rs`**

First, add `use` imports:
```rust
use crate::services::ai::{AiProviderConfig, AiRequest, AiEvent, ProviderRegistry};
```

Change the `generate_report` command's AI calling section (lines 358-380). Replace the `match summary_method` block that calls CLI/API directly:

Old (lines 365-380):
```rust
    let summary_result = match summary_method.as_str() {
        "cli" => {
            let cmd = summary_tool.clone().unwrap_or_else(|| "claude".to_string());
            Summarizer::summarize_cli_streaming(&cmd, &prompt, &app).await
        }
        "api" => {
            let provider = summary_tool.clone().unwrap_or_else(|| "anthropic".to_string());
            let key = api_key.unwrap_or_default();
            let m = model.unwrap_or_else(|| { ... });
            Summarizer::summarize(&prompt, &SummaryMethod::Api { ... }).await
        }
        _ => Ok(prompt.clone()),
    };
```

New:
```rust
    let summary_result = if summary_method == "ai" {
        // Use unified AI module
        let provider_id = summary_tool.clone().unwrap_or_else(|| "claude-cli".to_string());
        let config_str = model.clone().unwrap_or_else(|| "{}".to_string());
        let config: AiProviderConfig = serde_json::from_str(&config_str)
            .map_err(|e| format!("Invalid AI config: {}", e))?;

        let registry = ProviderRegistry::new();
        let provider = registry.get(&provider_id)
            .ok_or_else(|| format!("Unknown AI provider: {}", provider_id))?;

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<AiEvent>();
        let request = AiRequest {
            prompt: prompt.clone(),
            provider_config: config,
            continue_session: false,
        };
        let handle = tokio::spawn(async move { provider.call_streaming(request, tx).await });
        while let Some(event) = rx.recv().await {
            match event {
                AiEvent::Progress { stage, message } => {
                    let _ = app.emit("report-gen-progress", serde_json::json!({"stage": stage, "message": message}));
                }
                AiEvent::Thinking { tokens } => {
                    let _ = app.emit("report-gen-stream", serde_json::json!({"kind": "thinking", "tokens": tokens}));
                }
                AiEvent::TextDelta { text } => {
                    let _ = app.emit("report-gen-stream", serde_json::json!({"kind": "text", "text": text}));
                }
                AiEvent::Done => {
                    let _ = app.emit("report-gen-stream", serde_json::json!({"kind": "done"}));
                }
            }
        }
        handle.await.map_err(|e| format!("AI task error: {}", e))?
            .map(|r| r.output)
            .map_err(|e| format!("{}", e))
    } else if summary_method == "manual" {
        Ok(prompt.clone())
    } else {
        // Legacy backward compat: still support old "cli"/"api" mode
        let cmd = summary_tool.clone().unwrap_or_else(|| "claude".to_string());
        Summarizer::summarize_cli_streaming(&cmd, &prompt, &app).await
    };
```

- [ ] **Step 2: Modify `src/pages/ActivityTrackerPage.tsx`**

Replace the AI summary settings section (around lines 1178-1291) with the new `AiSelector` component and simplified model input:

Import AiSelector:
```typescript
import { AiSelector } from "@/components/modules/ai/AiSelector";
import { useAiProvidersConfig, getProviderConfig, useDefaultProviderId } from "@/lib/query/aiQueries";
import type { AiProviderConfig } from "@/lib/api/ai";
```

Replace the summaryMethod/summaryTool/summaryProvider selects with:
```tsx
const providersConfig = useAiProvidersConfig();
const defaultProviderId = useDefaultProviderId();
const [aiProvider, setAiProvider] = useState<AiProviderConfig>(
  () => getProviderConfig(providersConfig, defaultProviderId) || providersConfig.providers[0]
);

// In the settings UI, replace the old selects with:
<div className="space-y-2">
  <span className="text-xs text-muted-foreground">AI 总结方式</span>
  <select
    className="w-full h-8 rounded-md border border-border bg-background px-3 text-sm"
    value={summaryMethod}
    onChange={(e) => setSetting("ai_summary_method", e.target.value)}
  >
    <option value="ai">AI 自动总结（使用下方选择的 AI）</option>
    <option value="cli">CLI 调用（旧模式，兼容）</option>
    <option value="manual">手动模式（仅生成 Prompt）</option>
  </select>

  {summaryMethod === "ai" && (
    <div className="mt-2">
      <AiSelector value={aiProvider} onChange={setAiProvider} />
    </div>
  )}
</div>
```

Update the `generateReport` call to pass provider config JSON:
```typescript
await generateReport({
  ...existing,
  summaryMethod: summaryMethod, // will be "ai", "cli", or "manual"
  summaryTool: summaryMethod === "ai" ? aiProvider.id : undefined,
  model: summaryMethod === "ai" ? JSON.stringify(aiProvider) : undefined,
});
```

- [ ] **Step 3: Modify `src/lib/api/activity.ts`**

The `generateReport` function already accepts `summaryMethod`, `summaryTool`, `model` fields — the interface stays the same, no changes needed.

- [ ] **Step 4: Verify compilation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1` and `npx tsc --noEmit 2>&1`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/activity_tracker.rs src/pages/ActivityTrackerPage.tsx
git commit -m "feat(ai): integrate Activity Reporter with unified AI module"
```

---

### Task 11: Data migration + cleanup

**Files:**
- Modify: `src/lib/query/settingsQueries.ts` (or create migration hook)
- Modify: `src-tauri/src/services/activity/summarizer.rs` (optional: mark old code as deprecated)
- Modify: `src-tauri/src/services/testgen/cli.rs` (keep for backward compat but add docs)

**Interfaces:**
- Consumes: existing settings, new AI config format
- Produces: migrated settings

- [ ] **Step 1: Create migration logic in frontend**

Add to `src/lib/query/aiQueries.ts`:

```typescript
import { useEffect } from "react";
import { getSettingValue } from "./settingsQueries";
import { useSettings, useUpdateSetting } from "./settingsQueries";

/**
 * On first load, migrate old ai_summary_* settings to new ai_providers_config format.
 * This runs once when settings are loaded.
 */
export function useMigrateAiSettings() {
  const { data: settings } = useSettings();
  const updateSetting = useUpdateSetting();
  const migratedKey = "ai_settings_migrated";

  useEffect(() => {
    if (!settings) return;
    const migrated = getSettingValue(settings, migratedKey, "false");
    if (migrated === "true") return;

    // Check if new config already exists
    const existing = getSettingValue(settings, "ai_providers_config", "");
    if (existing) {
      updateSetting.mutate({ key: migratedKey, value: "true" });
      return;
    }

    // Get old settings
    const oldMethod = getSettingValue(settings, "ai_summary_method", "");
    const oldTool = getSettingValue(settings, "ai_summary_tool", "");
    const oldProvider = getSettingValue(settings, "ai_summary_provider", "");
    const oldApiKey = getSettingValue(settings, "ai_summary_api_key", "");
    const oldModel = getSettingValue(settings, "ai_summary_model", "");

    // Build new config from old settings
    const defaultConfig = getDefaultProvidersConfig();

    // If they used API mode, pre-configure the API provider
    if (oldMethod === "api" && oldProvider && oldApiKey) {
      const provider = defaultConfig.providers.find(
        (p) => p.id === `${oldProvider}-api`
      );
      if (provider) {
        provider.enabled = true;
        provider.api_key = oldApiKey;
        if (oldModel) provider.default_model = oldModel;
      }
    }

    // If they used CLI mode, ensure the CLI provider is enabled and default
    if (oldMethod === "cli" && oldTool) {
      const cliProvider = defaultConfig.providers.find(
        (p) => p.id === `${oldTool}-cli`
      );
      if (cliProvider) {
        cliProvider.enabled = true;
      }
      updateSetting.mutate({
        key: "ai_default_provider",
        value: `${oldTool}-cli`,
      });
    }

    updateSetting.mutate({
      key: "ai_providers_config",
      value: JSON.stringify(defaultConfig),
    });
    updateSetting.mutate({ key: migratedKey, value: "true" });
  }, [settings]);
}
```

- [ ] **Step 2: Add import for `getDefaultProvidersConfig` in aiQueries.ts**

At the top of `src/lib/query/aiQueries.ts`:
```typescript
import { getDefaultProvidersConfig } from "@/lib/api/ai";
```

- [ ] **Step 3: Wire up migration in AiContext or App**

In `src/lib/AiContext.tsx`, call `useMigrateAiSettings()` inside `AiProvider`:
```typescript
import { useMigrateAiSettings } from "@/lib/query/aiQueries";

// Inside AiProvider component:
useMigrateAiSettings();
```

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/query/aiQueries.ts src/lib/AiContext.tsx
git commit -m "feat(ai): add data migration from old ai_summary_* settings"
```

---

### Task 12: End-to-end test & verification

- [ ] **Step 1: Build Rust (check)**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1`
Expected: no errors

- [ ] **Step 2: Build frontend (check)**

Run: `npx tsc --noEmit 2>&1`
Expected: no errors

- [ ] **Step 3: Full build**

Run: `npm run build 2>&1`
Expected: successful build

- [ ] **Step 4: Verify no unused imports / dead code warnings**

Run: `cargo clippy --manifest-path src-tauri/Cargo.toml 2>&1 | head -30`
Expected: no new warnings

- [ ] **Step 5: Commit final checks**

```bash
git add -A
git diff --cached --stat
git commit -m "chore(ai): final verification and cleanup"
```
