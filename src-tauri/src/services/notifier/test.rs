use std::sync::Arc;
use reqwest::Client;
use crate::database::Database;
use crate::database::dao::channel::ChannelDao;
use crate::error::Result;
use crate::services::notifier::bark::send_bark_notification;
use crate::services::notifier::feishu::send_feishu;
use crate::services::notifier::wecom::send_wecom;
use crate::services::notifier::dingtalk::send_dingtalk;

pub async fn test_channel(db: &Arc<Database>, channel_id: &str) -> Result<String> {
    let client = Client::new();

    // Get channel info first, then release lock before async operation
    let (channel_type, channel_config) = {
        let conn = db.conn().lock().unwrap();
        let channel = ChannelDao::get_by_id(&conn, channel_id)?
            .ok_or_else(|| crate::error::ToolsError::ChannelNotFound(channel_id.to_string()))?;
        (channel.type_, channel.config)
    };

    // Parse config
    let config: serde_json::Value = serde_json::from_str(&channel_config)
        .map_err(|e| crate::error::ToolsError::NotificationFailed(format!("配置解析失败: {}", e)))?;

    // Send test notification
    let result = match channel_type.as_str() {
        "bark" => send_bark_notification(&channel_config, "Tools 测试", "这是一条测试消息").await,
        "feishu" => {
            let webhook_url = config["webhookUrl"].as_str().unwrap_or("");
            let secret = config["secret"].as_str();
            send_feishu(&client, webhook_url, secret, "Tools 测试", "这是一条测试消息").await
        },
        "wecom" => {
            let webhook_url = config["webhookUrl"].as_str().unwrap_or("");
            send_wecom(&client, webhook_url, "Tools 测试", "这是一条测试消息").await
        },
        "dingtalk" => {
            let webhook_url = config["webhookUrl"].as_str().unwrap_or("");
            let secret = config["secret"].as_str();
            let at_phones: Vec<String> = config["atPhones"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();
            send_dingtalk(
                &client, webhook_url, secret, "Tools 测试", "这是一条测试消息",
                if at_phones.is_empty() { None } else { Some(&at_phones) }
            ).await
        },
        _ => Err(crate::error::ToolsError::NotificationFailed(format!("未知的渠道类型: {}", channel_type))),
    };

    // Update test result - acquire lock again after async is done
    let conn = db.conn().lock().unwrap();
    match &result {
        Ok(msg) => ChannelDao::update_test_result(&conn, channel_id, Some(msg))?,
        Err(e) => ChannelDao::update_test_result(&conn, channel_id, Some(&e.to_string()))?,
    }

    result
}
