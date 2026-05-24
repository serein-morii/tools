use chrono::Utc;
use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::{Result, ToolsError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reminder {
    pub id: String,
    pub task_id: String,
    pub scheduled_at: i64,
    pub executed_at: Option<i64>,
    pub status: String,
    pub channel_results: String,
    pub error_message: Option<String>,
    pub user_action: Option<String>,
    pub user_feedback: Option<String>,
    pub action_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReminderRequest {
    pub task_id: String,
    pub scheduled_at: i64,
}

impl Reminder {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Reminder {
            id: row.get(0)?,
            task_id: row.get(1)?,
            scheduled_at: row.get(2)?,
            executed_at: row.get(3)?,
            status: row.get(4)?,
            channel_results: row.get(5)?,
            error_message: row.get(6)?,
            user_action: row.get(7)?,
            user_feedback: row.get(8)?,
            action_at: row.get(9)?,
            created_at: row.get(10)?,
        })
    }
}

pub struct ReminderDao;

impl ReminderDao {
    pub fn create(conn: &Connection, req: CreateReminderRequest) -> Result<Reminder> {
        let now = Utc::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();

        conn.execute(
            r#"
            INSERT INTO reminders (id, task_id, scheduled_at, status, channel_results, created_at)
            VALUES (?1, ?2, ?3, 'pending', '[]', ?4)
            "#,
            rusqlite::params![id, req.task_id, req.scheduled_at, now],
        )?;

        Ok(Reminder {
            id,
            task_id: req.task_id,
            scheduled_at: req.scheduled_at,
            executed_at: None,
            status: "pending".to_string(),
            channel_results: "[]".to_string(),
            error_message: None,
            user_action: None,
            user_feedback: None,
            action_at: None,
            created_at: now,
        })
    }

    pub fn get_pending(conn: &Connection) -> Result<Vec<Reminder>> {
        let now = Utc::now().timestamp_millis();
        let mut stmt = conn.prepare(
            "SELECT id, task_id, scheduled_at, executed_at, status, channel_results,
                    error_message, user_action, user_feedback, action_at, created_at
             FROM reminders
             WHERE status = 'pending' AND scheduled_at <= ?1
             ORDER BY scheduled_at ASC"
        )?;

        let reminders = stmt.query_map([now], Reminder::from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(reminders)
    }

    pub fn get_by_task(conn: &Connection, task_id: &str) -> Result<Vec<Reminder>> {
        let mut stmt = conn.prepare(
            "SELECT id, task_id, scheduled_at, executed_at, status, channel_results,
                    error_message, user_action, user_feedback, action_at, created_at
             FROM reminders
             WHERE task_id = ?1
             ORDER BY scheduled_at DESC
             LIMIT 10"
        )?;

        let reminders = stmt.query_map([task_id], Reminder::from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(reminders)
    }

    pub fn update_status(conn: &Connection, id: &str, status: &str, channel_results: &str, error: Option<&str>) -> Result<()> {
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE reminders SET status = ?1, executed_at = ?2, channel_results = ?3, error_message = ?4 WHERE id = ?5",
            rusqlite::params![status, now, channel_results, error, id],
        )?;
        Ok(())
    }

    pub fn delete_old(conn: &Connection, days: i32) -> Result<usize> {
        let cutoff = Utc::now().timestamp_millis() - (days as i64 * 24 * 60 * 60 * 1000);
        let rows = conn.execute(
            "DELETE FROM reminders WHERE status != 'pending' AND created_at < ?1",
            [cutoff],
        )?;
        Ok(rows)
    }
}