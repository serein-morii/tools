use reqwest::Client;
use serde_json::Value;
use crate::error::{Result, ToolsError};

pub fn build_bark_url(server_url: &str, key: &str) -> Result<String> {
    if key.trim().is_empty() {
        return Err(ToolsError::NotificationFailed("Bark key is required".to_string()));
    }

    Ok(format!("{}/{}/", server_url.trim_end_matches('/'), key.trim_matches('/')))
}

pub async fn send_bark_notification(
    config_json: &str,
    title: &str,
    body: &str,
) -> Result<String> {
    let config: Value = serde_json::from_str(config_json)?;

    let server_url = config["serverUrl"].as_str().unwrap_or("https://api.day.app");
    let key = config["key"].as_str()
        .ok_or_else(|| ToolsError::NotificationFailed("Bark key is required".to_string()))?;

    let url = build_bark_url(server_url, key)?;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_bark_url_requires_trailing_slash_for_json_post() {
        let url = build_bark_url("https://api.day.app/", "/BfNaf8oqxD4ETnERfpavV4/").unwrap();

        assert_eq!(url, "https://api.day.app/BfNaf8oqxD4ETnERfpavV4/");
    }

    #[test]
    fn build_bark_url_rejects_empty_key() {
        assert!(build_bark_url("https://api.day.app", "").is_err());
    }
}