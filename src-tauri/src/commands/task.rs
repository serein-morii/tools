use std::sync::Arc;
use tauri::State;
use crate::database::{Database, dao::task::{Task, CreateTaskRequest, UpdateTaskRequest, TaskDao}};
use crate::error::Result;

#[tauri::command]
pub fn get_tasks(db: State<'_, Arc<Database>>) -> Result<Vec<Task>> {
    let conn = db.conn().lock().unwrap();
    TaskDao::get_all(&conn)
}

#[tauri::command]
pub fn get_task(db: State<'_, Arc<Database>>, id: String) -> Result<Task> {
    let conn = db.conn().lock().unwrap();
    TaskDao::get_by_id(&conn, &id)?
        .ok_or_else(|| crate::error::ToolsError::TaskNotFound(id))
}

#[tauri::command]
pub fn create_task(db: State<'_, Arc<Database>>, task: CreateTaskRequest) -> Result<Task> {
    let conn = db.conn().lock().unwrap();
    TaskDao::create(&conn, task)
}

#[tauri::command]
pub fn update_task(db: State<'_, Arc<Database>>, id: String, task: UpdateTaskRequest) -> Result<Task> {
    let conn = db.conn().lock().unwrap();
    TaskDao::update(&conn, &id, task)
}

#[tauri::command]
pub fn delete_task(db: State<'_, Arc<Database>>, id: String) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    TaskDao::delete(&conn, &id)
}

#[tauri::command]
pub fn toggle_task(db: State<'_, Arc<Database>>, id: String, enabled: bool) -> Result<Task> {
    let conn = db.conn().lock().unwrap();
    TaskDao::toggle(&conn, &id, enabled)
}