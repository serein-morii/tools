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
    Ok(text)
}