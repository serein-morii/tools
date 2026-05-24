use std::sync::Arc;
use tauri::State;
use crate::database::{Database, dao::reminder::{Reminder, ReminderDao}};
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