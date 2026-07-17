use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::services::ai::{
    AiEvent, AiProviderConfig, AiRequest, ProviderRegistry,
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
