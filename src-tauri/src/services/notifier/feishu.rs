use reqwest::Client;
use serde_json::json;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use crate::error::Result;

pub async fn send_feishu(
    client: &Client,
    webhook_url: &str,
    secret: Option<&str>,
    title: &str,
    content: &str,
) -> Result<String> {
    let body = if let Some(secret) = secret {
        let timestamp = chrono::Utc::now().timestamp();
        let string_to_sign = format!("{}{}", timestamp, secret);
        let sign = hmac_sha256::HMAC::mac(string_to_sign.as_bytes(), secret.as_bytes());
        let sign_b64 = STANDARD.encode(&sign);

        json!({
            "timestamp": timestamp,
            "sign": sign_b64,
            "msg_type": "interactive",
            "card": {
                "header": {
                    "title": {
                        "tag": "plain_text",
                        "content": title
                    },
                    "template": "blue"
                },
                "elements": [
                    {
                        "tag": "div",
                        "text": {
                            "tag": "plain_text",
                            "content": content
                        }
                    }
                ]
            }
        })
    } else {
        json!({
            "msg_type": "interactive",
            "card": {
                "header": {
                    "title": {
                        "tag": "plain_text",
                        "content": title
                    },
                    "template": "blue"
                },
                "elements": [
                    {
                        "tag": "div",
                        "text": {
                            "tag": "plain_text",
                            "content": content
                        }
                    }
                ]
            }
        })
    };

    let response = client
        .post(webhook_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| crate::error::ToolsError::Http(e.to_string()))?;

    let text = response.text().await.map_err(|e| crate::error::ToolsError::Http(e.to_string()))?;

    // Check if response indicates success (StatusCode: 0)
    if text.contains("\"StatusCode\":0") || text.contains("\"StatusCode\": 0") {
        Ok("发送成功".to_string())
    } else {
        Err(crate::error::ToolsError::NotificationFailed(format!("飞书响应: {}", text)))
    }
}