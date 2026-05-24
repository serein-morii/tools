use chrono::Utc;
use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::Result;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReminderHistoryItem {
    pub id: String,
    pub task_id: String,
    pub task_name: String,
    pub reminder_type: String,
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

impl ReminderHistoryItem {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(ReminderHistoryItem {
            id: row.get(0)?,
            task_id: row.get(1)?,
            task_name: row.get(2)?,
            reminder_type: row.get(3)?,
            scheduled_at: row.get(4)?,
            executed_at: row.get(5)?,
            status: row.get(6)?,
            channel_results: row.get(7)?,
            error_message: row.get(8)?,
            user_action: row.get(9)?,
            user_feedback: row.get(10)?,
            action_at: row.get(11)?,
            created_at: row.get(12)?,
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

    pub fn get_history(conn: &Connection, limit: i64) -> Result<Vec<ReminderHistoryItem>> {
        let mut stmt = conn.prepare(
            "SELECT r.id, r.task_id, COALESCE(t.name, '已删除任务') AS task_name,
                    COALESCE(t.reminder_type, 'simple') AS reminder_type,
                    r.scheduled_at, r.executed_at, r.status, r.channel_results,
                    r.error_message, r.user_action, r.user_feedback, r.action_at, r.created_at
             FROM reminders r
             LEFT JOIN tasks t ON t.id = r.task_id
             ORDER BY r.scheduled_at DESC
             LIMIT ?1"
        )?;

        let items = stmt.query_map([limit], ReminderHistoryItem::from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(items)
    }

    pub fn update_status(conn: &Connection, id: &str, status: &str, channel_results: &str, error: Option<&str>) -> Result<()> {
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE reminders SET status = ?1, executed_at = ?2, channel_results = ?3, error_message = ?4 WHERE id = ?5",
            rusqlite::params![status, now, channel_results, error, id],
        )?;
        Ok(())
    }

    pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Reminder>> {
        let mut stmt = conn.prepare(
            "SELECT id, task_id, scheduled_at, executed_at, status, channel_results,
                    error_message, user_action, user_feedback, action_at, created_at
             FROM reminders WHERE id = ?1"
        )?;

        let reminder = stmt.query_row([id], Reminder::from_row).ok();
        Ok(reminder)
    }

    pub fn confirm(conn: &Connection, id: &str) -> Result<()> {
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE reminders SET user_action = 'confirmed', user_feedback = NULL, action_at = ?1 WHERE id = ?2",
            rusqlite::params![now, id],
        )?;
        Ok(())
    }

    pub fn submit_feedback(conn: &Connection, id: &str, feedback: &str) -> Result<()> {
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE reminders SET user_action = 'feedback_done', user_feedback = ?1, action_at = ?2 WHERE id = ?3",
            rusqlite::params![feedback, now, id],
        )?;
        Ok(())
    }

    pub fn snooze(conn: &Connection, id: &str, minutes: i64) -> Result<Reminder> {
        let existing = Self::get_by_id(conn, id)?.ok_or_else(|| crate::error::ToolsError::TaskNotFound(id.to_string()))?;
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE reminders SET user_action = 'snoozed', action_at = ?1 WHERE id = ?2",
            rusqlite::params![now, id],
        )?;

        Self::create(conn, CreateReminderRequest {
            task_id: existing.task_id,
            scheduled_at: now + minutes * 60 * 1000,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_status_counts_group_known_statuses() {
        let items = vec![
            ReminderHistoryItem::test_item("sent"),
            ReminderHistoryItem::test_item("failed"),
            ReminderHistoryItem::test_item("pending"),
            ReminderHistoryItem::test_item("sent"),
        ];

        let counts = summarize_history_statuses(&items);

        assert_eq!(counts.total, 4);
        assert_eq!(counts.sent, 2);
        assert_eq!(counts.failed, 1);
        assert_eq!(counts.pending, 1);
    }

    #[test]
    fn get_history_returns_task_names_and_recent_records_first() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                reminder_type TEXT NOT NULL DEFAULT 'simple'
            );
            CREATE TABLE reminders (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                scheduled_at INTEGER NOT NULL,
                executed_at INTEGER,
                status TEXT NOT NULL DEFAULT 'pending',
                channel_results TEXT DEFAULT '[]',
                error_message TEXT,
                user_action TEXT,
                user_feedback TEXT,
                action_at INTEGER,
                created_at INTEGER NOT NULL
            );"
        ).unwrap();

        conn.execute(
            "INSERT INTO tasks (id, name, reminder_type) VALUES (?1, ?2, ?3)",
            rusqlite::params!["task-1", "每日复盘", "feedback"],
        ).unwrap();
        conn.execute(
            "INSERT INTO reminders (id, task_id, scheduled_at, executed_at, status, channel_results, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params!["old", "task-1", 1000, 1100, "sent", "[]", 900],
        ).unwrap();
        conn.execute(
            "INSERT INTO reminders (id, task_id, scheduled_at, executed_at, status, channel_results, error_message, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params!["new", "missing-task", 2000, 2100, "failed", "[]", "发送失败", 1900],
        ).unwrap();

        let history = ReminderDao::get_history(&conn, 10).unwrap();

        assert_eq!(history.len(), 2);
        assert_eq!(history[0].id, "new");
        assert_eq!(history[0].task_name, "已删除任务");
        assert_eq!(history[0].error_message.as_deref(), Some("发送失败"));
        assert_eq!(history[1].id, "old");
        assert_eq!(history[1].task_name, "每日复盘");
        assert_eq!(history[1].reminder_type, "feedback");
    }

    #[test]
    fn reminder_actions_record_confirm_feedback_and_snooze() {
        let conn = setup_action_conn();
        insert_action_reminder(&conn, "confirm-id", "sent", 1_000);
        insert_action_reminder(&conn, "feedback-id", "sent", 2_000);
        insert_action_reminder(&conn, "snooze-id", "sent", 3_000);

        ReminderDao::confirm(&conn, "confirm-id").unwrap();
        ReminderDao::submit_feedback(&conn, "feedback-id", "已处理，明天跟进").unwrap();
        let snoozed = ReminderDao::snooze(&conn, "snooze-id", 10).unwrap();

        let confirm = get_action_row(&conn, "confirm-id");
        assert_eq!(confirm.0.as_deref(), Some("confirmed"));
        assert!(confirm.1.is_none());
        assert!(confirm.2.is_some());

        let feedback = get_action_row(&conn, "feedback-id");
        assert_eq!(feedback.0.as_deref(), Some("feedback_done"));
        assert_eq!(feedback.1.as_deref(), Some("已处理，明天跟进"));
        assert!(feedback.2.is_some());

        let original = get_action_row(&conn, "snooze-id");
        assert_eq!(original.0.as_deref(), Some("snoozed"));
        assert!(original.2.is_some());
        assert_eq!(snoozed.task_id, "task-1");
        assert_eq!(snoozed.status, "pending");
        assert!(snoozed.scheduled_at >= 3_000 + 10 * 60 * 1000);
    }

    fn setup_action_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE reminders (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                scheduled_at INTEGER NOT NULL,
                executed_at INTEGER,
                status TEXT NOT NULL DEFAULT 'pending',
                channel_results TEXT DEFAULT '[]',
                error_message TEXT,
                user_action TEXT,
                user_feedback TEXT,
                action_at INTEGER,
                created_at INTEGER NOT NULL
            );"
        ).unwrap();
        conn
    }

    fn insert_action_reminder(conn: &Connection, id: &str, status: &str, scheduled_at: i64) {
        conn.execute(
            "INSERT INTO reminders (id, task_id, scheduled_at, executed_at, status, channel_results, created_at)
             VALUES (?1, 'task-1', ?2, ?3, ?4, '[]', ?5)",
            rusqlite::params![id, scheduled_at, scheduled_at + 100, status, scheduled_at - 100],
        ).unwrap();
    }

    fn get_action_row(conn: &Connection, id: &str) -> (Option<String>, Option<String>, Option<i64>) {
        conn.query_row(
            "SELECT user_action, user_feedback, action_at FROM reminders WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap()
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct ReminderHistoryStatusCounts {
        total: usize,
        sent: usize,
        failed: usize,
        pending: usize,
    }

    fn summarize_history_statuses(items: &[ReminderHistoryItem]) -> ReminderHistoryStatusCounts {
        ReminderHistoryStatusCounts {
            total: items.len(),
            sent: items.iter().filter(|item| item.status == "sent").count(),
            failed: items.iter().filter(|item| item.status == "failed").count(),
            pending: items.iter().filter(|item| item.status == "pending").count(),
        }
    }

    impl ReminderHistoryItem {
        fn test_item(status: &str) -> Self {
            Self {
                id: format!("{}-id", status),
                task_id: "task-id".to_string(),
                task_name: "测试任务".to_string(),
                reminder_type: "simple".to_string(),
                scheduled_at: 1,
                executed_at: Some(2),
                status: status.to_string(),
                channel_results: "[]".to_string(),
                error_message: None,
                user_action: None,
                user_feedback: None,
                action_at: None,
                created_at: 1,
            }
        }
    }
}