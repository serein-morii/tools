use rusqlite::Connection;
use chrono::Utc;
use uuid::Uuid;
use crate::error::Result;

pub fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(&format!(
        r#"
        -- Tasks table
        CREATE TABLE IF NOT EXISTS tasks (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            description     TEXT,
            reminder_type   TEXT NOT NULL DEFAULT 'simple',
            cron_expr       TEXT NOT NULL,
            cron_config     TEXT NOT NULL DEFAULT '{{}}',
            enabled         INTEGER NOT NULL DEFAULT 1,
            status          TEXT DEFAULT 'active',
            last_run_at     INTEGER,
            next_run_at     INTEGER,
            template_id     TEXT,
            channel_ids     TEXT NOT NULL DEFAULT '[]',
            tags            TEXT DEFAULT '[]',
            priority        INTEGER DEFAULT 0,
            created_at      INTEGER NOT NULL,
            updated_at      INTEGER NOT NULL
        );

        -- Templates table
        CREATE TABLE IF NOT EXISTS templates (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            description     TEXT,
            category        TEXT DEFAULT 'custom',
            title_template  TEXT NOT NULL,
            body_template   TEXT NOT NULL,
            default_cron    TEXT,
            default_channels TEXT DEFAULT '[]',
            icon            TEXT,
            color           TEXT,
            tags            TEXT DEFAULT '[]',
            created_at      INTEGER NOT NULL,
            updated_at      INTEGER NOT NULL
        );

        -- Channels table
        CREATE TABLE IF NOT EXISTS channels (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            type            TEXT NOT NULL,
            enabled         INTEGER NOT NULL DEFAULT 1,
            config          TEXT NOT NULL DEFAULT '{{}}',
            last_test_at    INTEGER,
            last_test_result TEXT,
            description     TEXT,
            created_at      INTEGER NOT NULL,
            updated_at      INTEGER NOT NULL
        );

        -- Reminders table
        CREATE TABLE IF NOT EXISTS reminders (
            id              TEXT PRIMARY KEY,
            task_id         TEXT NOT NULL,
            scheduled_at    INTEGER NOT NULL,
            executed_at     INTEGER,
            status          TEXT NOT NULL DEFAULT 'pending',
            channel_results TEXT DEFAULT '[]',
            error_message   TEXT,
            user_action     TEXT,
            user_feedback   TEXT,
            action_at       INTEGER,
            created_at      INTEGER NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        -- Reminder history table
        CREATE TABLE IF NOT EXISTS reminder_history (
            id              TEXT PRIMARY KEY,
            reminder_id     TEXT NOT NULL,
            task_id         TEXT NOT NULL,
            task_name       TEXT NOT NULL,
            scheduled_at    INTEGER NOT NULL,
            executed_at     INTEGER,
            status          TEXT NOT NULL,
            channel_results TEXT DEFAULT '[]',
            user_action     TEXT,
            user_feedback   TEXT,
            created_at      INTEGER NOT NULL
        );

        -- Settings table
        CREATE TABLE IF NOT EXISTS settings (
            key             TEXT PRIMARY KEY,
            value           TEXT NOT NULL
        );

        -- Quick Notes table
        CREATE TABLE IF NOT EXISTS quick_notes (
            id              TEXT PRIMARY KEY,
            content         TEXT NOT NULL,
            color           TEXT DEFAULT 'default',
            pinned          INTEGER NOT NULL DEFAULT 0,
            created_at      INTEGER NOT NULL,
            updated_at      INTEGER NOT NULL
        );

        -- GitLab Scan History table
        CREATE TABLE IF NOT EXISTS gitlab_scan_history (
            id                  TEXT PRIMARY KEY,
            scan_type           TEXT NOT NULL,
            scan_at             INTEGER NOT NULL,
            scan_range_start    TEXT,
            scan_range_end      TEXT,
            total_projects      INTEGER,
            total_commits       INTEGER,
            total_lines_added   INTEGER,
            total_lines_removed INTEGER,
            test_projects       INTEGER,
            pending_mrs         INTEGER,
            contributors        TEXT,
            summary             TEXT,
            created_at          INTEGER NOT NULL,
            pipeline_total      INTEGER DEFAULT 0,
            pipeline_success    INTEGER DEFAULT 0,
            pipeline_failed     INTEGER DEFAULT 0,
            developer_stats     TEXT DEFAULT '[]'
        );

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
        CREATE INDEX IF NOT EXISTS idx_reminders_task ON reminders(task_id);
        CREATE INDEX IF NOT EXISTS idx_history_task ON reminder_history(task_id);
        CREATE INDEX IF NOT EXISTS idx_history_time ON reminder_history(scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_gitlab_scan_time ON gitlab_scan_history(scan_at);

        -- Insert default settings if not exists
        INSERT OR IGNORE INTO settings (key, value) VALUES
            ('theme', '"system"'),
            ('language', '"zh"'),
            ('auto_launch', 'false'),
            ('minimize_to_tray', 'true'),
            ('silent_startup', 'false'),
            ('reminder_advance_minutes', '0'),
            ('snooze_minutes', '5'),
            ('history_retention_days', '30'),
            ('webdav_enabled', 'false'),
            ('webdav_base_url', '""'),
            ('webdav_username', '""'),
            ('webdav_password', '""');
        "#
    ))?;

    // Safe migrations for columns added in later versions (ignore errors if they already exist)
    let _ = conn.execute("ALTER TABLE gitlab_scan_history ADD COLUMN pipeline_total INTEGER DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE gitlab_scan_history ADD COLUMN pipeline_success INTEGER DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE gitlab_scan_history ADD COLUMN pipeline_failed INTEGER DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE gitlab_scan_history ADD COLUMN developer_stats TEXT DEFAULT '[]'", []);

    Ok(())
}

/// 为所有提醒任务创建/更新默认模板
pub fn migrate_default_templates(conn: &Connection) -> Result<()> {
    let now = Utc::now().timestamp_millis();

    // 查询所有任务（不管是否已有模板）
    let mut stmt = conn.prepare(
        "SELECT id, name, description, template_id FROM tasks"
    )?;

    let tasks: Vec<(String, String, Option<String>, Option<String>)> = stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })?.filter_map(|r| r.ok()).collect();

    // 每个任务对应的配置：(名称关键词, emoji, description, body模板)
    let task_configs: Vec<(&str, &str, &str, &str)> = vec![
        ("QP月点价", "🦄", "QP月点价是否完成",
         "今天是 {date}（本月第 {week_of_month} 周的星期 {weekday_num}），请及时查看{description}！🎯"),
        ("期货当月头寸", "🐶", "期货当月头寸是否处理",
         "今天是 {date}（本月第 {day_of_month} 天），请及时查看{description}！🎯"),
    ];

    // 矿均价保值头寸单独处理，区分下单/下指令
    let miner_configs: Vec<(&str, &str, &str)> = vec![
        ("下单", "🐯", "矿均价保值头寸是否下单"),
        ("下指令", "🦁", "矿均价保值头寸是否下指令"),
    ];

    for (task_id, task_name, _description, existing_template_id) in tasks {
        let (emoji, desc, body_tpl) = if task_name.contains("矿均价保值头寸") {
            let existing = _description.as_deref().unwrap_or("");
            // 默认下指令→倒数，下单→第X天
            let mut found = ("🦁", "矿均价保值头寸是否下指令", "今天是 {date}（本月倒数第 {days_remaining} 天），请及时查看{description}！🎯");
            for (kw, em, d) in &miner_configs {
                if existing.contains(kw) {
                    let b = if *kw == "下单" {
                        "今天是 {date}（本月第 {day_of_month} 天），请及时查看{description}！🎯"
                    } else {
                        "今天是 {date}（本月倒数第 {days_remaining} 天），请及时查看{description}！🎯"
                    };
                    found = (*em, *d, b);
                    break;
                }
            }
            found
        } else {
            let mut found = None;
            for cfg in &task_configs {
                if task_name.contains(cfg.0) {
                    found = Some(*cfg);
                    break;
                }
            }
            match found {
                Some((_, e, d, b)) => (e, d, b),
                None => continue,
            }
        };

        let title_tpl = format!("{}提醒来啦!📣📣📣", emoji);

        conn.execute(
            "UPDATE tasks SET description = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![desc, now, task_id],
        )?;

        if let Some(tid) = existing_template_id {
            conn.execute(
                "UPDATE templates SET title_template = ?1, body_template = ?2, updated_at = ?3 WHERE id = ?4",
                rusqlite::params![title_tpl, body_tpl, now, tid],
            )?;
        } else {
            let template_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO templates (id, name, description, category, title_template, body_template, default_channels, tags, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                rusqlite::params![
                    template_id,
                    format!("{}默认模板", task_name),
                    Some(format!("{}的自动提醒模板", task_name)),
                    "builtin",
                    title_tpl,
                    body_tpl,
                    "[]",
                    "[]",
                    now,
                ],
            )?;
            conn.execute(
                "UPDATE tasks SET template_id = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![template_id, now, task_id],
            )?;
        }
    }

    Ok(())
}
