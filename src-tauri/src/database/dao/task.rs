use chrono::{DateTime, Utc};
use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::{Result, ToolsError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub reminder_type: String,
    pub cron_expr: String,
    pub cron_config: String,
    pub enabled: bool,
    pub status: String,
    pub last_run_at: Option<i64>,
    pub next_run_at: Option<i64>,
    pub template_id: Option<String>,
    pub channel_ids: String,
    pub tags: String,
    pub priority: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskRequest {
    pub name: String,
    pub description: Option<String>,
    pub reminder_type: Option<String>,
    pub cron_expr: Option<String>,
    pub cron_config: Option<String>,
    pub template_id: Option<String>,
    pub channel_ids: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub priority: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTaskRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub reminder_type: Option<String>,
    pub cron_expr: Option<String>,
    pub cron_config: Option<String>,
    pub enabled: Option<bool>,
    pub status: Option<String>,
    pub template_id: Option<String>,
    pub channel_ids: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub priority: Option<i32>,
}

impl Task {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Task {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            reminder_type: row.get(3)?,
            cron_expr: row.get(4)?,
            cron_config: row.get(5)?,
            enabled: row.get::<_, i32>(6)? != 0,
            status: row.get(7)?,
            last_run_at: row.get(8)?,
            next_run_at: row.get(9)?,
            template_id: row.get(10)?,
            channel_ids: row.get(11)?,
            tags: row.get(12)?,
            priority: row.get(13)?,
            created_at: row.get(14)?,
            updated_at: row.get(15)?,
        })
    }
}

pub struct TaskDao;

impl TaskDao {
    pub fn create(conn: &Connection, req: CreateTaskRequest) -> Result<Task> {
        let now = Utc::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();

        let reminder_type = req.reminder_type.unwrap_or_else(|| "simple".to_string());
        let cron_expr = req.cron_expr.unwrap_or_else(|| "0 9 * * *".to_string());
        let cron_config = req.cron_config.unwrap_or_else(|| "{}".to_string());
        let channel_ids = serde_json::to_string(&req.channel_ids.unwrap_or_default())?;
        let tags = serde_json::to_string(&req.tags.unwrap_or_default())?;
        let priority = req.priority.unwrap_or(0);

        conn.execute(
            r#"
            INSERT INTO tasks (
                id, name, description, reminder_type, cron_expr, cron_config,
                enabled, status, template_id, channel_ids, tags, priority,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 'active', ?7, ?8, ?9, ?10, ?11, ?11)
            "#,
            rusqlite::params![
                id,
                req.name,
                req.description,
                reminder_type,
                cron_expr,
                cron_config,
                req.template_id,
                channel_ids,
                tags,
                priority,
                now
            ],
        )?;

        Self::get_by_id(conn, &id)?.ok_or_else(|| ToolsError::TaskNotFound(id))
    }

    pub fn get_all(conn: &Connection) -> Result<Vec<Task>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, reminder_type, cron_expr, cron_config,
                    enabled, status, last_run_at, next_run_at, template_id,
                    channel_ids, tags, priority, created_at, updated_at
             FROM tasks ORDER BY created_at DESC"
        )?;

        let tasks = stmt.query_map([], Task::from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(tasks)
    }

    pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Task>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, reminder_type, cron_expr, cron_config,
                    enabled, status, last_run_at, next_run_at, template_id,
                    channel_ids, tags, priority, created_at, updated_at
             FROM tasks WHERE id = ?1"
        )?;

        let task = stmt.query_row([id], Task::from_row).ok();
        Ok(task)
    }

    pub fn update(conn: &Connection, id: &str, req: UpdateTaskRequest) -> Result<Task> {
        let now = Utc::now().timestamp_millis();

        // Build dynamic update
        let mut sets = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(name) = &req.name {
            sets.push("name = ?");
            params.push(Box::new(name.clone()));
        }
        if let Some(desc) = &req.description {
            sets.push("description = ?");
            params.push(Box::new(desc.clone()));
        }
        if let Some(rt) = &req.reminder_type {
            sets.push("reminder_type = ?");
            params.push(Box::new(rt.clone()));
        }
        if let Some(expr) = &req.cron_expr {
            sets.push("cron_expr = ?");
            params.push(Box::new(expr.clone()));
        }
        if let Some(config) = &req.cron_config {
            sets.push("cron_config = ?");
            params.push(Box::new(config.clone()));
        }
        if let Some(enabled) = req.enabled {
            sets.push("enabled = ?");
            params.push(Box::new(if enabled { 1 } else { 0 }));
        }
        if let Some(status) = &req.status {
            sets.push("status = ?");
            params.push(Box::new(status.clone()));
        }
        if let Some(template_id) = &req.template_id {
            sets.push("template_id = ?");
            params.push(Box::new(template_id.clone()));
        }
        if let Some(channels) = &req.channel_ids {
            sets.push("channel_ids = ?");
            params.push(Box::new(serde_json::to_string(channels)?));
        }
        if let Some(tags) = &req.tags {
            sets.push("tags = ?");
            params.push(Box::new(serde_json::to_string(tags)?));
        }
        if let Some(priority) = req.priority {
            sets.push("priority = ?");
            params.push(Box::new(priority));
        }

        sets.push("updated_at = ?");
        params.push(Box::new(now));

        params.push(Box::new(id.to_string()));

        let sql = format!(
            "UPDATE tasks SET {} WHERE id = ?",
            sets.join(", ")
        );

        conn.execute(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))?;

        Self::get_by_id(conn, id)?.ok_or_else(|| ToolsError::TaskNotFound(id.to_string()))
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<()> {
        let rows = conn.execute("DELETE FROM tasks WHERE id = ?1", [id])?;
        if rows == 0 {
            return Err(ToolsError::TaskNotFound(id.to_string()));
        }
        Ok(())
    }

    pub fn toggle(conn: &Connection, id: &str, enabled: bool) -> Result<Task> {
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE tasks SET enabled = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![if enabled { 1 } else { 0 }, now, id],
        )?;
        Self::get_by_id(conn, id)?.ok_or_else(|| ToolsError::TaskNotFound(id.to_string()))
    }

    pub fn get_enabled(conn: &Connection) -> Result<Vec<Task>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, reminder_type, cron_expr, cron_config,
                    enabled, status, last_run_at, next_run_at, template_id,
                    channel_ids, tags, priority, created_at, updated_at
             FROM tasks WHERE enabled = 1 ORDER BY next_run_at ASC"
        )?;

        let tasks = stmt.query_map([], Task::from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(tasks)
    }
}
