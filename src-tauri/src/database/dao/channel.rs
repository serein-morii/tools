use chrono::Utc;
use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::{Result, ToolsError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub enabled: bool,
    pub config: String,
    pub last_test_at: Option<i64>,
    pub last_test_result: Option<String>,
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateChannelRequest {
    pub name: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub config: String,
    pub description: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateChannelRequest {
    pub name: Option<String>,
    pub config: Option<String>,
    pub description: Option<String>,
    pub enabled: Option<bool>,
}

impl Channel {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Channel {
            id: row.get(0)?,
            name: row.get(1)?,
            type_: row.get(2)?,
            enabled: row.get::<_, i32>(3)? != 0,
            config: row.get(4)?,
            last_test_at: row.get(5)?,
            last_test_result: row.get(6)?,
            description: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }
}

pub struct ChannelDao;

impl ChannelDao {
    pub fn create(conn: &Connection, req: CreateChannelRequest) -> Result<Channel> {
        let now = Utc::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();
        let enabled = req.enabled.unwrap_or(true);

        conn.execute(
            r#"
            INSERT INTO channels (id, name, type, enabled, config, description, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
            "#,
            rusqlite::params![id, req.name, req.type_, if enabled { 1 } else { 0 }, req.config, req.description, now],
        )?;

        Self::get_by_id(conn, &id)?.ok_or_else(|| ToolsError::ChannelNotFound(id))
    }

    pub fn get_all(conn: &Connection) -> Result<Vec<Channel>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, type, enabled, config, last_test_at, last_test_result, description, created_at, updated_at
             FROM channels ORDER BY created_at DESC"
        )?;

        let channels = stmt.query_map([], Channel::from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(channels)
    }

    pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Channel>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, type, enabled, config, last_test_at, last_test_result, description, created_at, updated_at
             FROM channels WHERE id = ?1"
        )?;

        let channel = stmt.query_row([id], Channel::from_row).ok();
        Ok(channel)
    }

    pub fn update(conn: &Connection, id: &str, req: UpdateChannelRequest) -> Result<Channel> {
        let now = Utc::now().timestamp_millis();

        let mut sets = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(name) = &req.name {
            sets.push("name = ?");
            params.push(Box::new(name.clone()));
        }
        if let Some(config) = &req.config {
            sets.push("config = ?");
            params.push(Box::new(config.clone()));
        }
        if let Some(desc) = &req.description {
            sets.push("description = ?");
            params.push(Box::new(desc.clone()));
        }
        if let Some(enabled) = req.enabled {
            sets.push("enabled = ?");
            params.push(Box::new(if enabled { 1 } else { 0 }));
        }

        sets.push("updated_at = ?");
        params.push(Box::new(now));
        params.push(Box::new(id.to_string()));

        let sql = format!("UPDATE channels SET {} WHERE id = ?", sets.join(", "));
        conn.execute(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))?;

        Self::get_by_id(conn, id)?.ok_or_else(|| ToolsError::ChannelNotFound(id.to_string()))
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<()> {
        let rows = conn.execute("DELETE FROM channels WHERE id = ?1", [id])?;
        if rows == 0 {
            return Err(ToolsError::ChannelNotFound(id.to_string()));
        }
        Ok(())
    }

    pub fn update_test_result(conn: &Connection, id: &str, result: Option<&str>) -> Result<()> {
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE channels SET last_test_at = ?1, last_test_result = ?2, updated_at = ?1 WHERE id = ?3",
            rusqlite::params![now, result, id],
        )?;
        Ok(())
    }
}