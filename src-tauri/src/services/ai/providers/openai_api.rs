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
