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
