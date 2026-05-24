use reqwest::Client;
use serde_json::json;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use hmac_sha256::HMAC;
use crate::error::Result;

pub async fn send_dingtalk(
    client: &Client,
    webhook_url: &str,
    secret: Option<&str>,
    title: &str,
    content: &str,
    at_mobiles: Option<&[String]>,
) -> Result<String> {
    let url = if let Some(secret) = secret {
        let timestamp = chrono::Utc::now().timestamp_millis();
        let string_to_sign = format!("{}\n{}", timestamp, secret);
        let sign = HMAC::mac(string_to_sign.as_bytes(), secret.as_bytes());
        let sign_b64 = STANDARD.encode(&sign);
        let sign_url = urlencoding::encode(&sign_b64);
        format!("{}&timestamp={}&sign={}", webhook_url, timestamp, sign_url)
    } else {
        webhook_url.to_string()
    };

    // Build atMobiles array if provided
    let at_mobiles_json: Vec<String> = at_mobiles
        .map(|m| m.iter().filter(|s| !s.is_empty()).cloned().collect())
        .unwrap_or_default();

    // Build text content with @mentions in markdown format
    let at_text = if !at_mobiles_json.is_empty() {
        let at_str: String = at_mobiles_json.iter()
            .map(|phone| format!("@{}", phone))
            .collect::<Vec<_>>()
            .join(" ");
        format!("**{}**\n\n{}\n\n{}", title, content, at_str)
    } else {
        format!("**{}**\n\n{}", title, content)
    };

    let body = if at_mobiles_json.is_empty() {
        json!({
            "msgtype": "markdown",
            "markdown": {
                "title": title,
                "text": at_text
            }
        })
    } else {
        json!({
            "msgtype": "markdown",
            "markdown": {
                "title": title,
                "text": at_text
            },
            "at": {
                "atMobiles": at_mobiles_json,
                "isAtAll": false
            }
        })
    };

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| crate::error::ToolsError::Http(e.to_string()))?;

    let text = response.text().await.map_err(|e| crate::error::ToolsError::Http(e.to_string()))?;

    // 钉钉成功响应: {"errcode":0,"errmsg":"ok"}
    if text.contains("\"errcode\":0") || text.contains("\"errcode\": 0") {
        Ok("发送成功".to_string())
    } else {
        Err(crate::error::ToolsError::NotificationFailed(format!("钉钉响应: {}", text)))
    }
}