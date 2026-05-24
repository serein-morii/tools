use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickNote {
    pub id: String,
    pub content: String,
    pub color: String,
    pub pinned: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateNoteRequest {
    pub content: String,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNoteRequest {
    pub content: Option<String>,
    pub color: Option<String>,
    pub pinned: Option<bool>,
}

pub struct NoteDao;

impl NoteDao {
    pub fn create(conn: &Connection, req: CreateNoteRequest) -> Result<QuickNote> {
        let now = chrono::Utc::now().timestamp_millis();
        let id = format!("note-{}", uuid::Uuid::new_v4());
        let color = req.color.unwrap_or_else(|| "default".to_string());

        conn.execute(
            "INSERT INTO quick_notes (id, content, color, pinned, created_at, updated_at) VALUES (?1, ?2, ?3, 0, ?4, ?4)",
            rusqlite::params![id, req.content, color, now],
        )?;

        Ok(QuickNote {
            id,
            content: req.content,
            color,
            pinned: false,
            created_at: now,
            updated_at: now,
        })
    }

    pub fn get_all(conn: &Connection) -> Result<Vec<QuickNote>> {
        let mut stmt = conn.prepare(
            "SELECT id, content, color, pinned, created_at, updated_at FROM quick_notes ORDER BY pinned DESC, created_at DESC"
        )?;

        let notes = stmt.query_map([], |row| {
            Ok(QuickNote {
                id: row.get(0)?,
                content: row.get(1)?,
                color: row.get(2)?,
                pinned: row.get::<_, i32>(3)? != 0,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(notes)
    }

    pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<QuickNote>> {
        let mut stmt = conn.prepare(
            "SELECT id, content, color, pinned, created_at, updated_at FROM quick_notes WHERE id = ?1"
        )?;

        let note = stmt.query_row(rusqlite::params![id], |row| {
            Ok(QuickNote {
                id: row.get(0)?,
                content: row.get(1)?,
                color: row.get(2)?,
                pinned: row.get::<_, i32>(3)? != 0,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        }).ok();

        Ok(note)
    }

    pub fn update(conn: &Connection, id: &str, req: UpdateNoteRequest) -> Result<Option<QuickNote>> {
        let now = chrono::Utc::now().timestamp_millis();

        // Build dynamic update query
        let mut updates = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(content) = &req.content {
            updates.push("content = ?");
            params.push(Box::new(content.clone()));
        }
        if let Some(color) = &req.color {
            updates.push("color = ?");
            params.push(Box::new(color.clone()));
        }
        if let Some(pinned) = req.pinned {
            updates.push("pinned = ?");
            params.push(Box::new(if pinned { 1i32 } else { 0i32 }));
        }

        if updates.is_empty() {
            return Self::get_by_id(conn, id);
        }

        updates.push("updated_at = ?");
        params.push(Box::new(now));
        params.push(Box::new(id.to_string()));

        let sql = format!(
            "UPDATE quick_notes SET {} WHERE id = ?",
            updates.join(", ")
        );

        conn.execute(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))?;

        Self::get_by_id(conn, id)
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<bool> {
        let rows = conn.execute("DELETE FROM quick_notes WHERE id = ?1", rusqlite::params![id])?;
        Ok(rows > 0)
    }

    pub fn search(conn: &Connection, query: &str) -> Result<Vec<QuickNote>> {
        let pattern = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "SELECT id, content, color, pinned, created_at, updated_at FROM quick_notes WHERE content LIKE ?1 ORDER BY pinned DESC, created_at DESC"
        )?;

        let notes = stmt.query_map(rusqlite::params![pattern], |row| {
            Ok(QuickNote {
                id: row.get(0)?,
                content: row.get(1)?,
                color: row.get(2)?,
                pinned: row.get::<_, i32>(3)? != 0,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?.collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(notes)
    }
}
