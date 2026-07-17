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
    task_id: String,
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

    let app_handle = app.clone();
    let provider_clone = provider.clone();
    let tid = task_id.clone();

    let handle = tokio::spawn(async move {
        provider_clone.call_streaming(request, tx).await
    });

    while let Some(event) = rx.recv().await {
        let mut payload = serde_json::to_value(&event).unwrap_or_default();
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("task_id".to_string(), serde_json::Value::String(tid.clone()));
        }
        let _ = app_handle.emit("ai-stream", payload);
    }

    handle.await.map_err(|e| format!("Task join error: {}", e))?
}

/// Check if CLI tools are installed on the system PATH.
/// Returns a list of provider IDs that should be enabled by default.
#[tauri::command]
pub async fn detect_installed_cli_tools() -> Result<Vec<String>, String> {
    let mut found: Vec<String> = Vec::new();
    let cmd_name = if cfg!(target_os = "windows") { "where" } else { "which" };
    for (name, id) in [("claude", "claude-cli"), ("codex", "codex-cli")] {
        let output = tokio::process::Command::new(cmd_name)
            .arg(name)
            .output()
            .await;
        if let Ok(o) = output {
            if o.status.success() {
                found.push(id.to_string());
            }
        }
    }
    Ok(found)
}
