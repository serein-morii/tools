use std::sync::Arc;
use tauri::State;
use crate::database::{Database, dao::template::{Template, CreateTemplateRequest, UpdateTemplateRequest, TemplateDao}};
use crate::error::Result;

#[tauri::command]
pub fn get_templates(db: State<'_, Arc<Database>>) -> Result<Vec<Template>> {
    let conn = db.conn().lock().unwrap();
    TemplateDao::get_all(&conn)
}

#[tauri::command]
pub fn get_template(db: State<'_, Arc<Database>>, id: String) -> Result<Template> {
    let conn = db.conn().lock().unwrap();
    TemplateDao::get_by_id(&conn, &id)?
        .ok_or_else(|| crate::error::ToolsError::TaskNotFound(id))
}

#[tauri::command]
pub fn create_template(db: State<'_, Arc<Database>>, template: CreateTemplateRequest) -> Result<Template> {
    let conn = db.conn().lock().unwrap();
    TemplateDao::create(&conn, template)
}

#[tauri::command]
pub fn update_template(db: State<'_, Arc<Database>>, id: String, template: UpdateTemplateRequest) -> Result<Template> {
    let conn = db.conn().lock().unwrap();
    TemplateDao::update(&conn, &id, template)
}

#[tauri::command]
pub fn delete_template(db: State<'_, Arc<Database>>, id: String) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    TemplateDao::delete(&conn, &id)
}
