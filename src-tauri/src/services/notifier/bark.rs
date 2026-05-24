use reqwest::Client;
use serde_json::Value;
use crate::error::{Result, ToolsError};

pub async fn send_bark_notification(
    config_json: &str,
    title: &str,
    body: &str,
) -> Result<String> {
    let config: Value = serde_json::from_str(config_json)?;

    let server_url = config["serverUrl"].as_str().unwrap_or("https://api.day.app");
    let key = config["key"].as_str()
        .ok_or_else(|| ToolsError::NotificationFailed("Bark key is required".to_string()))?;

    let url = format!("{}/{}", server_url, key);

    let client = Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "title": title,
            "body": body,
            "sound": config["sound"].as_str().unwrap_or("bell"),
            "group": config["group"].as_str().unwrap_or("Tools"),
        }))
        .send()
        .await?;

    let status = response.status();
    let response_body = response.text().await?;

    if status.is_success() {
        Ok("发送成功".to_string())
    } else {
        Err(ToolsError::NotificationFailed(format!("Bark 发送失败: {}", response_body)))
    }
}