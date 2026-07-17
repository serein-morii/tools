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
