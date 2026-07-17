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
