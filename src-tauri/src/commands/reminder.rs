use std::sync::Arc;
use tauri::State;
use crate::database::{Database, dao::reminder::{Reminder, ReminderDao, ReminderHistoryItem}};
use crate::error::Result;

#[tauri::command]
pub fn get_pending_reminders(db: State<'_, Arc<Database>>) -> Result<Vec<Reminder>> {
    let conn = db.conn().lock().unwrap();
    ReminderDao::get_pending(&conn)
}

#[tauri::command]
pub fn get_task_reminders(db: State<'_, Arc<Database>>, task_id: String) -> Result<Vec<Reminder>> {
    let conn = db.conn().lock().unwrap();
    ReminderDao::get_by_task(&conn, &task_id)
}

#[tauri::command]
pub fn get_reminder_history(db: State<'_, Arc<Database>>) -> Result<Vec<ReminderHistoryItem>> {
    let conn = db.conn().lock().unwrap();
    ReminderDao::get_history(&conn, 100)
}

#[tauri::command]
pub fn confirm_reminder(db: State<'_, Arc<Database>>, id: String) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    ReminderDao::confirm(&conn, &id)
}

#[tauri::command]
pub fn submit_reminder_feedback(db: State<'_, Arc<Database>>, id: String, feedback: String) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    ReminderDao::submit_feedback(&conn, &id, &feedback)
}

#[tauri::command]
pub fn snooze_reminder(db: State<'_, Arc<Database>>, id: String, minutes: i64) -> Result<Reminder> {
    let conn = db.conn().lock().unwrap();
    ReminderDao::snooze(&conn, &id, minutes)
}
