use std::sync::Arc;
use tauri::State;
use crate::database::{Database, dao::channel::{Channel, CreateChannelRequest, UpdateChannelRequest, ChannelDao}};
use crate::error::Result;
use crate::services::notifier::test_channel;

#[tauri::command]
pub fn get_channels(db: State<'_, Arc<Database>>) -> Result<Vec<Channel>> {
    let conn = db.conn().lock().unwrap();
    ChannelDao::get_all(&conn)
}

#[tauri::command]
pub fn get_channel(db: State<'_, Arc<Database>>, id: String) -> Result<Channel> {
    let conn = db.conn().lock().unwrap();
    ChannelDao::get_by_id(&conn, &id)?
        .ok_or_else(|| crate::error::ToolsError::ChannelNotFound(id))
}

#[tauri::command]
pub fn create_channel(db: State<'_, Arc<Database>>, channel: CreateChannelRequest) -> Result<Channel> {
    let conn = db.conn().lock().unwrap();
    ChannelDao::create(&conn, channel)
}

#[tauri::command]
pub fn update_channel(db: State<'_, Arc<Database>>, id: String, channel: UpdateChannelRequest) -> Result<Channel> {
    let conn = db.conn().lock().unwrap();
    ChannelDao::update(&conn, &id, channel)
}

#[tauri::command]
pub fn delete_channel(db: State<'_, Arc<Database>>, id: String) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    ChannelDao::delete(&conn, &id)
}

#[tauri::command]
pub async fn test_channel_cmd(db: State<'_, Arc<Database>>, id: String) -> Result<String> {
    test_channel(&db, &id).await
}