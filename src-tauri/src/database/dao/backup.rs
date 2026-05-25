use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::database::dao::{
    channel::Channel,
    note::QuickNote,
    settings::{Setting, SettingsDao},
    task::Task,
    template::Template,
};
use crate::error::{Result, ToolsError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupData {
    pub version: i32,
    pub exported_at: i64,
    pub tasks: Vec<Task>,
    pub channels: Vec<Channel>,
    pub templates: Vec<Template>,
    pub settings: Vec<Setting>,
    #[serde(default)]
    pub quick_notes: Vec<QuickNote>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BackupCounts {
    pub tasks: usize,
    pub channels: usize,
    pub templates: usize,
    pub settings: usize,
    pub quick_notes: usize,
}

pub struct BackupDao;

impl BackupDao {
    pub fn export_data(conn: &Connection) -> Result<BackupData> {
        Ok(BackupData {
            version: 1,
            exported_at: Utc::now().timestamp_millis(),
            tasks: load_tasks(conn)?,
            channels: load_channels(conn)?,
            templates: load_templates(conn)?,
            settings: SettingsDao::get_all(conn)?,
            quick_notes: load_quick_notes(conn)?,
        })
    }

    pub fn import_data(conn: &mut Connection, data: BackupData) -> Result<BackupCounts> {
        if data.version != 1 {
            return Err(ToolsError::Backup(format!("Unsupported backup version: {}", data.version)));
        }

        let tx = conn.transaction()?;
        tx.execute("DELETE FROM tasks", [])?;
        tx.execute("DELETE FROM channels", [])?;
        tx.execute("DELETE FROM templates", [])?;
        tx.execute("DELETE FROM settings", [])?;
        tx.execute("DELETE FROM quick_notes", [])?;

        for task in &data.tasks {
            tx.execute(
                "INSERT INTO tasks (
                    id, name, description, reminder_type, cron_expr, cron_config,
                    enabled, status, last_run_at, next_run_at, template_id,
                    channel_ids, tags, priority, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                rusqlite::params![
                    task.id,
                    task.name,
                    task.description,
                    task.reminder_type,
                    task.cron_expr,
                    task.cron_config,
                    if task.enabled { 1 } else { 0 },
                    task.status,
                    task.last_run_at,
                    task.next_run_at,
                    task.template_id,
                    task.channel_ids,
                    task.tags,
                    task.priority,
                    task.created_at,
                    task.updated_at,
                ],
            )?;
        }

        for channel in &data.channels {
            tx.execute(
                "INSERT INTO channels (
                    id, name, type, enabled, config, last_test_at, last_test_result,
                    description, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                rusqlite::params![
                    channel.id,
                    channel.name,
                    channel.type_,
                    if channel.enabled { 1 } else { 0 },
                    channel.config,
                    channel.last_test_at,
                    channel.last_test_result,
                    channel.description,
                    channel.created_at,
                    channel.updated_at,
                ],
            )?;
        }

        for template in &data.templates {
            tx.execute(
                "INSERT INTO templates (
                    id, name, description, category, title_template, body_template,
                    default_cron, default_channels, icon, color, tags, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                rusqlite::params![
                    template.id,
                    template.name,
                    template.description,
                    template.category,
                    template.title_template,
                    template.body_template,
                    template.default_cron,
                    template.default_channels,
                    template.icon,
                    template.color,
                    template.tags,
                    template.created_at,
                    template.updated_at,
                ],
            )?;
        }

        for setting in &data.settings {
            tx.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)",
                rusqlite::params![setting.key, setting.value],
            )?;
        }

        for note in &data.quick_notes {
            tx.execute(
                "INSERT INTO quick_notes (id, content, color, pinned, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    note.id,
                    note.content,
                    note.color,
                    if note.pinned { 1 } else { 0 },
                    note.created_at,
                    note.updated_at,
                ],
            )?;
        }

        tx.commit()?;

        Ok(BackupCounts {
            tasks: data.tasks.len(),
            channels: data.channels.len(),
            templates: data.templates.len(),
            settings: data.settings.len(),
            quick_notes: data.quick_notes.len(),
        })
    }
}

fn load_tasks(conn: &Connection) -> Result<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, reminder_type, cron_expr, cron_config,
                enabled, status, last_run_at, next_run_at, template_id,
                channel_ids, tags, priority, created_at, updated_at
         FROM tasks ORDER BY created_at DESC"
    )?;

    let rows = stmt.query_map([], |row| {
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
    })?.collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(rows)
}

fn load_channels(conn: &Connection) -> Result<Vec<Channel>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, type, enabled, config, last_test_at, last_test_result,
                description, created_at, updated_at
         FROM channels ORDER BY created_at DESC"
    )?;

    let rows = stmt.query_map([], |row| {
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
    })?.collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(rows)
}

fn load_templates(conn: &Connection) -> Result<Vec<Template>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, category, title_template, body_template,
                default_cron, default_channels, icon, color, tags, created_at, updated_at
         FROM templates ORDER BY created_at DESC"
    )?;

    let rows = stmt.query_map([], |row| {
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
    })?.collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(rows)
}

fn load_quick_notes(conn: &Connection) -> Result<Vec<QuickNote>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, color, pinned, created_at, updated_at
         FROM quick_notes ORDER BY pinned DESC, created_at DESC"
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(QuickNote {
            id: row.get(0)?,
            content: row.get(1)?,
            color: row.get(2)?,
            pinned: row.get::<_, i32>(3)? != 0,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?.collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::BackupDao;
    use rusqlite::Connection;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                reminder_type TEXT NOT NULL DEFAULT 'simple',
                cron_expr TEXT NOT NULL,
                cron_config TEXT NOT NULL DEFAULT '{}',
                enabled INTEGER NOT NULL DEFAULT 1,
                status TEXT DEFAULT 'active',
                last_run_at INTEGER,
                next_run_at INTEGER,
                template_id TEXT,
                channel_ids TEXT NOT NULL DEFAULT '[]',
                tags TEXT DEFAULT '[]',
                priority INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE channels (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                config TEXT NOT NULL DEFAULT '{}',
                last_test_at INTEGER,
                last_test_result TEXT,
                description TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE templates (
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
            );
            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE quick_notes (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT 'default',
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );"
        ).unwrap();
        conn
    }

    fn seed(conn: &Connection) {
        conn.execute_batch(
            "INSERT INTO tasks (id, name, description, reminder_type, cron_expr, cron_config, enabled, status, channel_ids, tags, priority, created_at, updated_at)
             VALUES ('task-1', '备份任务', 'desc', 'confirm', '0 9 * * *', '{}', 1, 'active', '[\"channel-1\"]', '[\"backup\"]', 2, 1000, 1000);
             INSERT INTO channels (id, name, type, enabled, config, description, created_at, updated_at)
             VALUES ('channel-1', 'Bark', 'bark', 1, '{\"key\":\"local\"}', 'desc', 1000, 1000);
             INSERT INTO templates (id, name, description, category, title_template, body_template, default_cron, default_channels, tags, created_at, updated_at)
             VALUES ('template-1', '模板', 'desc', 'custom', '标题', '内容', '0 9 * * *', '[\"channel-1\"]', '[]', 1000, 1000);
             INSERT INTO settings (key, value) VALUES ('snooze_minutes', '12');
             INSERT INTO quick_notes (id, content, color, pinned, created_at, updated_at)
             VALUES ('note-1', '测试笔记', 'blue', 1, 1000, 1000);"
        ).unwrap();
    }

    #[test]
    fn backup_export_import_round_trip() {
        let source = setup_conn();
        seed(&source);

        let data = BackupDao::export_data(&source).unwrap();
        assert_eq!(data.version, 1);
        assert_eq!(data.tasks.len(), 1);
        assert_eq!(data.channels.len(), 1);
        assert_eq!(data.templates.len(), 1);
        assert_eq!(data.settings.len(), 1);
        assert_eq!(data.quick_notes.len(), 1);

        let mut target = setup_conn();
        let counts = BackupDao::import_data(&mut target, data).unwrap();
        assert_eq!(counts.tasks, 1);
        assert_eq!(counts.channels, 1);
        assert_eq!(counts.templates, 1);
        assert_eq!(counts.settings, 1);
        assert_eq!(counts.quick_notes, 1);

        let task_name: String = target.query_row("SELECT name FROM tasks WHERE id = 'task-1'", [], |row| row.get(0)).unwrap();
        let setting_value: String = target.query_row("SELECT value FROM settings WHERE key = 'snooze_minutes'", [], |row| row.get(0)).unwrap();
        let note_content: String = target.query_row("SELECT content FROM quick_notes WHERE id = 'note-1'", [], |row| row.get(0)).unwrap();
        let note_pinned: bool = target.query_row("SELECT pinned FROM quick_notes WHERE id = 'note-1'", [], |row| {
            let v: i32 = row.get(0)?;
            Ok(v != 0)
        }).unwrap();
        assert_eq!(task_name, "备份任务");
        assert_eq!(setting_value, "12");
        assert_eq!(note_content, "测试笔记");
        assert!(note_pinned);
    }
}
