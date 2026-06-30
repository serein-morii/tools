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
    pub retry_count: i32,
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
        // Column order (must match get_pending SELECT):
        //   0:id 1:task_id 2:scheduled_at 3:executed_at 4:status
        //   5:channel_results 6:error_message 7:user_action 8:user_feedback
        //   9:action_at 10:retry_count 11:created_at
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
            retry_count: row.get(10)?,
            created_at: row.get(11)?,
        })
    }
}

impl ReminderHistoryItem {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        // Column order (must match get_history SELECT):
        //   0:id 1:task_id 2:task_name 3:reminder_type
        //   4:scheduled_at 5:executed_at 6:status 7:channel_results
        //   8:error_message 9:user_action 10:user_feedback
        //   11:action_at 12:created_at
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
            INSERT INTO reminders (id, task_id, scheduled_at, status, channel_results, retry_count, created_at)
            VALUES (?1, ?2, ?3, 'pending', '[]', ?4, ?5)
            "#,
            rusqlite::params![id, req.task_id, req.scheduled_at, 0i64, now],
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
            retry_count: 0,
            created_at: now,
        })
    }

    pub fn get_pending(conn: &Connection) -> Result<Vec<Reminder>> {
        // 获取所有未执行且未超过重试次数的待办提醒
        // 修复：不限制"今天"，应该执行所有过期的待办提醒（防止应用长时间未运行时累积的任务被永久忽略）
        let now = Utc::now().timestamp_millis();

        let mut stmt = conn.prepare(
            "SELECT id, task_id, scheduled_at, executed_at, status, channel_results,
                    error_message, user_action, user_feedback, action_at, retry_count, created_at
             FROM reminders
             WHERE status = 'pending' AND scheduled_at <= ?1 AND retry_count < 3
             ORDER BY scheduled_at ASC"
        )?;

        let reminders = stmt.query_map([now], Reminder::from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(reminders)
    }

    pub fn get_by_task(conn: &Connection, task_id: &str) -> Result<Vec<Reminder>> {
        let mut stmt = conn.prepare(
            "SELECT id, task_id, scheduled_at, executed_at, status, channel_results,
                    error_message, user_action, user_feedback, action_at, retry_count, created_at
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
        // 从 reminder_history 表读取历史记录（不再错误地从 reminders JOIN）
        let mut stmt = conn.prepare(
            "SELECT h.id, h.task_id, h.task_name, 'simple' AS reminder_type,
                    h.scheduled_at, h.executed_at, h.status, h.channel_results,
                    NULL AS error_message, h.user_action, h.user_feedback,
                    NULL AS action_at, h.created_at
             FROM reminder_history h
             ORDER BY h.scheduled_at DESC
             LIMIT ?1"
        )?;

        let items = stmt.query_map([limit], ReminderHistoryItem::from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(items)
    }

    pub fn increment_retry(conn: &Connection, id: &str) -> Result<()> {
        conn.execute(
            "UPDATE reminders SET retry_count = retry_count + 1 WHERE id = ?1",
            rusqlite::params![id],
        )?;
        Ok(())
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
                    error_message, user_action, user_feedback, action_at, retry_count, created_at
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
                retry_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE reminder_history (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                task_name TEXT NOT NULL,
                scheduled_at INTEGER NOT NULL,
                executed_at INTEGER,
                status TEXT NOT NULL,
                channel_results TEXT DEFAULT '[]',
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
        // Insert into reminder_history (the correct table)
        conn.execute(
            "INSERT INTO reminder_history (id, task_id, task_name, scheduled_at, executed_at, status, channel_results, user_action, user_feedback, action_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params!["old", "task-1", "每日复盘", 1000, 1100, "sent", "[]", None::<&str>, None::<&str>, None::<i64>, 900],
        ).unwrap();
        // Insert with a task_id that doesn't exist in tasks (so COALESCE returns '已删除任务')
        conn.execute(
            "INSERT INTO reminder_history (id, task_id, task_name, scheduled_at, executed_at, status, channel_results, user_action, user_feedback, action_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params!["new", "missing-task", "原始名", 2000, 2100, "failed", "[]", None::<&str>, None::<&str>, None::<i64>, 1900],
        ).unwrap();

        let history = ReminderDao::get_history(&conn, 10).unwrap();

        assert_eq!(history.len(), 2);
        assert_eq!(history[0].id, "new");
        // 由于查 reminder_history 表（不再 JOIN），task_name 是原始值
        assert_eq!(history[0].task_name, "原始名");
        assert_eq!(history[1].id, "old");
        assert_eq!(history[1].task_name, "每日复盘");
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
                retry_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );"
        ).unwrap();
        conn
    }

    fn insert_action_reminder(conn: &Connection, id: &str, status: &str, scheduled_at: i64) {
        conn.execute(
            "INSERT INTO reminders (id, task_id, scheduled_at, executed_at, status, channel_results, retry_count, created_at)
             VALUES (?1, 'task-1', ?2, ?3, ?4, '[]', ?5, ?6)",
            rusqlite::params![id, scheduled_at, scheduled_at + 100, status, 0i64, scheduled_at - 100],
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