use rusqlite::Connection;
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
