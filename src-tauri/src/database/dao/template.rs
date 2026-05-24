use chrono::Utc;
use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::{Result, ToolsError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub title_template: String,
    pub body_template: String,
    pub default_cron: Option<String>,
    pub default_channels: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub tags: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTemplateRequest {
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub title_template: String,
    pub body_template: String,
    pub default_cron: Option<String>,
    pub default_channels: Option<Vec<String>>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTemplateRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub title_template: Option<String>,
    pub body_template: Option<String>,
    pub default_cron: Option<String>,
    pub default_channels: Option<Vec<String>>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub tags: Option<Vec<String>>,
}

impl Template {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Template {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            category: row.get(3)?,
            title_template: row.get(4)?,
            body_template: row.get(5)?,
            default_cron: row.get(6)?,
            default_channels: row.get(7)?,
            icon: row.get(8)?,
            color: row.get(9)?,
            tags: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    }
}

pub struct TemplateDao;

impl TemplateDao {
    pub fn create(conn: &Connection, req: CreateTemplateRequest) -> Result<Template> {
        let now = Utc::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();
        let category = req.category.unwrap_or_else(|| "custom".to_string());
        let default_channels = serde_json::to_string(&req.default_channels.unwrap_or_default())?;
        let tags = serde_json::to_string(&req.tags.unwrap_or_default())?;

        conn.execute(
            "INSERT INTO templates (
                id, name, description, category, title_template, body_template,
                default_cron, default_channels, icon, color, tags, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
            rusqlite::params![
                id,
                req.name,
                req.description,
                category,
                req.title_template,
                req.body_template,
                req.default_cron,
                default_channels,
                req.icon,
                req.color,
                tags,
                now,
            ],
        )?;

        Self::get_by_id(conn, &id)?.ok_or_else(|| ToolsError::TaskNotFound(id))
    }

    pub fn get_all(conn: &Connection) -> Result<Vec<Template>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, category, title_template, body_template,
                    default_cron, default_channels, icon, color, tags, created_at, updated_at
             FROM templates ORDER BY created_at DESC"
        )?;

        let templates = stmt.query_map([], Template::from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(templates)
    }

    pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Template>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, category, title_template, body_template,
                    default_cron, default_channels, icon, color, tags, created_at, updated_at
             FROM templates WHERE id = ?1"
        )?;

        let template = stmt.query_row([id], Template::from_row).ok();
        Ok(template)
    }

    pub fn update(conn: &Connection, id: &str, req: UpdateTemplateRequest) -> Result<Template> {
        let existing = Self::get_by_id(conn, id)?.ok_or_else(|| ToolsError::TaskNotFound(id.to_string()))?;
        let now = Utc::now().timestamp_millis();
        let name = req.name.unwrap_or(existing.name);
        let description = req.description.or(existing.description);
        let category = req.category.unwrap_or(existing.category);
        let title_template = req.title_template.unwrap_or(existing.title_template);
        let body_template = req.body_template.unwrap_or(existing.body_template);
        let default_cron = req.default_cron.or(existing.default_cron);
        let default_channels = match req.default_channels {
            Some(channels) => serde_json::to_string(&channels)?,
            None => existing.default_channels,
        };
        let icon = req.icon.or(existing.icon);
        let color = req.color.or(existing.color);
        let tags = match req.tags {
            Some(tags) => serde_json::to_string(&tags)?,
            None => existing.tags,
        };

        conn.execute(
            "UPDATE templates SET
                name = ?1, description = ?2, category = ?3, title_template = ?4,
                body_template = ?5, default_cron = ?6, default_channels = ?7,
                icon = ?8, color = ?9, tags = ?10, updated_at = ?11
             WHERE id = ?12",
            rusqlite::params![
                name,
                description,
                category,
                title_template,
                body_template,
                default_cron,
                default_channels,
                icon,
                color,
                tags,
                now,
                id,
            ],
        )?;

        Self::get_by_id(conn, id)?.ok_or_else(|| ToolsError::TaskNotFound(id.to_string()))
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<()> {
        let rows = conn.execute("DELETE FROM templates WHERE id = ?1", [id])?;
        if rows == 0 {
            return Err(ToolsError::TaskNotFound(id.to_string()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT DEFAULT 'custom',
                title_template TEXT NOT NULL,
                body_template TEXT NOT NULL,
                default_cron TEXT,
                default_channels TEXT DEFAULT '[]',
                icon TEXT,
                color TEXT,
                tags TEXT DEFAULT '[]',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );"
        ).unwrap();
        conn
    }

    #[test]
    fn template_crud_round_trip() {
        let conn = setup_conn();

        let created = TemplateDao::create(&conn, CreateTemplateRequest {
            name: "会议提醒".to_string(),
            description: Some("会议前提醒".to_string()),
            category: Some("custom".to_string()),
            title_template: "会议提醒".to_string(),
            body_template: "{task_name}\n时间: {date} {time}".to_string(),
            default_cron: Some("0 9 * * *".to_string()),
            default_channels: Some(vec!["channel-1".to_string()]),
            icon: Some("bell".to_string()),
            color: Some("blue".to_string()),
            tags: Some(vec!["meeting".to_string()]),
        }).unwrap();

        assert_eq!(created.name, "会议提醒");
        assert_eq!(created.default_channels, "[\"channel-1\"]");

        let updated = TemplateDao::update(&conn, &created.id, UpdateTemplateRequest {
            name: Some("每日复盘".to_string()),
            description: None,
            category: None,
            title_template: Some("复盘提醒".to_string()),
            body_template: None,
            default_cron: Some("30 18 * * *".to_string()),
            default_channels: None,
            icon: None,
            color: None,
            tags: Some(vec!["review".to_string()]),
        }).unwrap();

        assert_eq!(updated.name, "每日复盘");
        assert_eq!(updated.title_template, "复盘提醒");
        assert_eq!(updated.body_template, "{task_name}\n时间: {date} {time}");
        assert_eq!(updated.tags, "[\"review\"]");

        let all = TemplateDao::get_all(&conn).unwrap();
        assert_eq!(all.len(), 1);

        TemplateDao::delete(&conn, &created.id).unwrap();
        assert!(TemplateDao::get_by_id(&conn, &created.id).unwrap().is_none());
    }
}
