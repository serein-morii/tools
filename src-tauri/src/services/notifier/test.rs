use std::sync::Arc;
use crate::database::Database;
use crate::database::dao::channel::ChannelDao;
use crate::error::Result;
use crate::services::notifier::bark::send_bark_notification;

pub async fn test_channel(db: &Arc<Database>, channel_id: &str) -> Result<String> {
    let conn = db.conn().lock().unwrap();
    let channel = ChannelDao::get_by_id(&conn, channel_id)?
        .ok_or_else(|| crate::error::ToolsError::ChannelNotFound(channel_id.to_string()))?;
    drop(conn);

    let result = match channel.type_.as_str() {
        "bark" => send_bark_notification(&channel.config, "Tools 测试", "这是一条测试消息").await,
        "feishu" => Ok("飞书测试待实现".to_string()),
        "wecom" => Ok("企业微信测试待实现".to_string()),
        "dingtalk" => Ok("钉钉测试待实现".to_string()),
        _ => Err(crate::error::ToolsError::NotificationFailed(format!("未知的渠道类型: {}", channel.type_))),
    };

    // Update test result
    let conn = db.conn().lock().unwrap();
    match &result {
        Ok(msg) => ChannelDao::update_test_result(&conn, channel_id, Some(msg))?,
        Err(e) => ChannelDao::update_test_result(&conn, channel_id, Some(&e.to_string()))?,
    }

    result
}