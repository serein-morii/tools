use reqwest::Client;
use serde_json::json;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use crate::error::Result;

pub async fn send_dingtalk(
    client: &Client,
    webhook_url: &str,
    secret: Option<&str>,
    title: &str,
    content: &str,
) -> Result<String> {
    let url = if let Some(secret) = secret {
        let timestamp = chrono::Utc::now().timestamp_millis();
        let string_to_sign = format!("{}{}", timestamp, secret);
        let sign = hmac_sha256::HMAC::mac(string_to_sign.as_bytes(), secret.as_bytes());
        let sign_b64 = STANDARD.encode(&sign);
        let sign_url = urlencoding::encode(&sign_b64);
        format!("{}&timestamp={}&sign={}", webhook_url, timestamp, sign_url)
    } else {
        webhook_url.to_string()
    };

    let body = json!({
        "msgtype": "markdown",
        "markdown": {
            "title": title,
            "text": format!("**{}**\n\n{}", title, content)
        }
    });

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| crate::error::ToolsError::Http(e.to_string()))?;

    let text = response.text().await.map_err(|e| crate::error::ToolsError::Http(e.to_string()))?;
    Ok(text)
}