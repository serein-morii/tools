use reqwest::Client;
use serde_json::json;
use crate::error::Result;

pub async fn send_wecom(
    client: &Client,
    webhook_url: &str,
    title: &str,
    content: &str,
) -> Result<String> {
    let body = json!({
        "msgtype": "markdown",
        "markdown": {
            "content": format!("**{}**\n\n{}", title, content)
        }
    });

    let response = client
        .post(webhook_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| crate::error::ToolsError::Http(e.to_string()))?;

    let text = response.text().await.map_err(|e| crate::error::ToolsError::Http(e.to_string()))?;

    // 企业微信成功响应: {"errcode":0,"errmsg":"ok"}
    if text.contains("\"errcode\":0") || text.contains("\"errcode\": 0") {
        Ok("发送成功".to_string())
    } else {
        Err(crate::error::ToolsError::NotificationFailed(format!("企业微信响应: {}", text)))
    }
}