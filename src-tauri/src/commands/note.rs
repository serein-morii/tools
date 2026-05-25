use std::sync::Arc;
use crate::database::Database;
use crate::database::dao::note::{NoteDao, QuickNote, CreateNoteRequest, UpdateNoteRequest};
use crate::error::Result;

#[tauri::command]
pub fn get_notes(db: tauri::State<'_, Arc<Database>>) -> Result<Vec<QuickNote>> {
    let conn = db.conn().lock().unwrap();
    NoteDao::get_all(&conn)
}

#[tauri::command]
pub fn get_note(db: tauri::State<'_, Arc<Database>>, id: String) -> Result<Option<QuickNote>> {
    let conn = db.conn().lock().unwrap();
    NoteDao::get_by_id(&conn, &id)
}

#[tauri::command]
pub fn create_note(db: tauri::State<'_, Arc<Database>>, content: String, color: Option<String>) -> Result<QuickNote> {
    let conn = db.conn().lock().unwrap();
    NoteDao::create(&conn, CreateNoteRequest { content, color })
}

#[tauri::command]
pub fn update_note(db: tauri::State<'_, Arc<Database>>, id: String, content: Option<String>, color: Option<String>, pinned: Option<bool>) -> Result<Option<QuickNote>> {
    let conn = db.conn().lock().unwrap();
    NoteDao::update(&conn, &id, UpdateNoteRequest { content, color, pinned })
}

#[tauri::command]
pub fn delete_note(db: tauri::State<'_, Arc<Database>>, id: String) -> Result<bool> {
    let conn = db.conn().lock().unwrap();
    NoteDao::delete(&conn, &id)
}

#[tauri::command]
pub fn search_notes(db: tauri::State<'_, Arc<Database>>, query: String) -> Result<Vec<QuickNote>> {
    let conn = db.conn().lock().unwrap();
    NoteDao::search(&conn, &query)
}
