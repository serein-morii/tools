use std::sync::Arc;
use crate::database::Database;
use crate::database::dao::channel::ChannelDao;
use crate::error::Result;
use crate::services::notifier::bark::send_bark_notification;

pub async fn test_channel(db: &Arc<Database>, channel_id: &str) -> Result<String> {
    // Get channel info first, then release lock before async operation
    let (channel_type, channel_config) = {
        let conn = db.conn().lock().unwrap();
        let channel = ChannelDao::get_by_id(&conn, channel_id)?
            .ok_or_else(|| crate::error::ToolsError::ChannelNotFound(channel_id.to_string()))?;
        (channel.type_, channel.config)
    };

    // Now we can safely do async operations without holding the lock
    let result = match channel_type.as_str() {
        "bark" => send_bark_notification(&channel_config, "Tools 测试", "这是一条测试消息").await,
        "feishu" => Ok("飞书测试待实现".to_string()),
        "wecom" => Ok("企业微信测试待实现".to_string()),
        "dingtalk" => Ok("钉钉测试待实现".to_string()),
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