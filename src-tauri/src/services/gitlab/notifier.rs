use reqwest::Client;
use serde_json::Value;
use crate::error::{Result, ToolsError};
use crate::database::dao::channel::Channel;

pub async fn send_scan_notification(
    channels: &[Channel],
    title: &str,
    content: &str,
) -> Vec<(String, Result<String>)> {
    let client = Client::new();
    let mut results = Vec::new();

    for channel in channels {
        if !channel.enabled {
            continue;
        }

        let result = match channel.type_.as_str() {
            "bark" => send_bark(&client, &channel.config, title, content).await,
            "feishu" => send_feishu(&client, &channel.config, title, content).await,
            "wecom" => send_wecom(&client, &channel.config, title, content).await,
            "dingtalk" => send_dingtalk(&client, &channel.config, title, content).await,
            _ => Err(ToolsError::NotificationFailed(format!("Unknown channel type: {}", channel.type_))),
        };

        results.push((channel.name.clone(), result));
    }

    results
}

async fn send_bark(client: &Client, config_json: &str, title: &str, body: &str) -> Result<String> {
    let config: Value = serde_json::from_str(config_json)?;

    let server_url = config["serverUrl"].as_str().unwrap_or("https://api.day.app");
    let key = config["key"].as_str()
        .ok_or_else(|| ToolsError::NotificationFailed("Bark key is required".to_string()))?;

    if key.trim().is_empty() {
        return Err(ToolsError::NotificationFailed("Bark key is required".to_string()));
    }

    let url = format!("{}/{}/", server_url.trim_end_matches('/'), key.trim_matches('/'));

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "title": title,
            "body": body,
            "sound": config["sound"].as_str().unwrap_or("bell"),
            "group": config["group"].as_str().unwrap_or("GitLab"),
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

async fn send_feishu(client: &Client, config_json: &str, title: &str, content: &str) -> Result<String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    let config: Value = serde_json::from_str(config_json)?;
    let webhook_url = config["webhookUrl"].as_str()
        .ok_or_else(|| ToolsError::NotificationFailed("飞书 webhook URL is required".to_string()))?;

    let body = if let Some(secret) = config["secret"].as_str() {
        if !secret.is_empty() {
            let timestamp = chrono::Utc::now().timestamp();
            let string_to_sign = format!("{}{}", timestamp, secret);
            let sign = hmac_sha256::HMAC::mac(string_to_sign.as_bytes(), secret.as_bytes());
            let sign_b64 = STANDARD.encode(&sign);

            serde_json::json!({
                "timestamp": timestamp,
                "sign": sign_b64,
                "msg_type": "interactive",
                "card": {
                    "header": {
                        "title": { "tag": "plain_text", "content": title },
                        "template": "blue"
                    },
                    "elements": [
                        { "tag": "div", "text": { "tag": "plain_text", "content": content } }
                    ]
                }
            })
        } else {
            build_feishu_card(title, content)
        }
    } else {
        build_feishu_card(title, content)
    };

    let response = client
        .post(webhook_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| ToolsError::Http(e.to_string()))?;

    let text = response.text().await.map_err(|e| ToolsError::Http(e.to_string()))?;

    if text.contains("\"StatusCode\":0") || text.contains("\"StatusCode\": 0") {
        Ok("发送成功".to_string())
    } else {
        Err(ToolsError::NotificationFailed(format!("飞书响应: {}", text)))
    }
}

fn build_feishu_card(title: &str, content: &str) -> serde_json::Value {
    serde_json::json!({
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": { "tag": "plain_text", "content": title },
                "template": "blue"
            },
            "elements": [
                { "tag": "div", "text": { "tag": "plain_text", "content": content } }
            ]
        }
    })
}

async fn send_wecom(client: &Client, config_json: &str, title: &str, content: &str) -> Result<String> {
    let config: Value = serde_json::from_str(config_json)?;
    let webhook_url = config["webhookUrl"].as_str()
        .ok_or_else(|| ToolsError::NotificationFailed("企业微信 webhook URL is required".to_string()))?;

    let body = serde_json::json!({
        "msgtype": "markdown",
        "markdown": {
            "content": format!("## {}\n\n{}", title, content)
        }
    });

    let response = client
        .post(webhook_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| ToolsError::Http(e.to_string()))?;

    let text = response.text().await.map_err(|e| ToolsError::Http(e.to_string()))?;

    if text.contains("\"errcode\":0") || text.contains("\"errcode\": 0") {
        Ok("发送成功".to_string())
    } else {
        Err(ToolsError::NotificationFailed(format!("企业微信响应: {}", text)))
    }
}

async fn send_dingtalk(client: &Client, config_json: &str, title: &str, content: &str) -> Result<String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    let config: Value = serde_json::from_str(config_json)?;
    let webhook_url = config["webhookUrl"].as_str()
        .ok_or_else(|| ToolsError::NotificationFailed("钉钉 webhook URL is required".to_string()))?;

    let mut url = webhook_url.to_string();

    // Add sign if secret is configured
    if let Some(secret) = config["secret"].as_str() {
        if !secret.is_empty() {
            let timestamp = chrono::Utc::now().timestamp_millis();
            let string_to_sign = format!("{}{}", timestamp, secret);
            let sign = hmac_sha256::HMAC::mac(string_to_sign.as_bytes(), secret.as_bytes());
            let sign_b64 = STANDARD.encode(&sign);
            let sign_encoded = urlencoding::encode(&sign_b64);
            url = format!("{}&timestamp={}&sign={}", webhook_url, timestamp, sign_encoded);
        }
    }

    let body = serde_json::json!({
        "msgtype": "markdown",
        "markdown": {
            "title": title,
            "text": format!("## {}\n\n{}", title, content)
        }
    });

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| ToolsError::Http(e.to_string()))?;

    let text = response.text().await.map_err(|e| ToolsError::Http(e.to_string()))?;

    if text.contains("\"errcode\":0") || text.contains("\"errcode\": 0") {
        Ok("发送成功".to_string())
    } else {
        Err(ToolsError::NotificationFailed(format!("钉钉响应: {}", text)))
    }
}
