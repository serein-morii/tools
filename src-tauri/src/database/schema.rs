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
            scheduled_at    BIGINT NOT NULL,
            executed_at     BIGINT,
            status          TEXT NOT NULL DEFAULT 'pending',
            channel_results TEXT DEFAULT '[]',
            error_message   TEXT,
            user_action     TEXT,
            user_feedback   TEXT,
            action_at       BIGINT,
            retry_count     INTEGER NOT NULL DEFAULT 0,
            created_at      BIGINT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        -- Reminder history table
        CREATE TABLE IF NOT EXISTS reminder_history (
            id              TEXT PRIMARY KEY,
            reminder_id     TEXT NOT NULL,
            task_id         TEXT NOT NULL,
            task_name       TEXT NOT NULL,
            scheduled_at    BIGINT NOT NULL,
            executed_at     BIGINT,
            status          TEXT NOT NULL,
            channel_results TEXT DEFAULT '[]',
            user_action     TEXT,
            user_feedback   TEXT,
            created_at      BIGINT NOT NULL
        );

        -- Settings table
        CREATE TABLE IF NOT EXISTS settings (
            key             TEXT PRIMARY KEY,
            value           TEXT NOT NULL
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

        -- AI Activity Tracker tables
        -- AI Tools registry
        CREATE TABLE IF NOT EXISTS ai_tools (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            enabled         INTEGER NOT NULL DEFAULT 1,
            watch_paths     TEXT NOT NULL DEFAULT '[]',
            parser_type     TEXT NOT NULL,
            config          TEXT DEFAULT '{{}}',
            created_at      INTEGER NOT NULL,
            updated_at      INTEGER NOT NULL
        );

        -- AI Sessions
        CREATE TABLE IF NOT EXISTS ai_sessions (
            id              TEXT PRIMARY KEY,
            tool_id         TEXT NOT NULL,
            project_name    TEXT,
            project_path    TEXT,
            title           TEXT,
            message_count   INTEGER DEFAULT 0,
            duration_secs   INTEGER DEFAULT 0,
            started_at      BIGINT NOT NULL,
            ended_at        BIGINT,
            source          TEXT NOT NULL DEFAULT 'watch',
            raw_path        TEXT,
            summary         TEXT,
            tags            TEXT DEFAULT '[]',
            metadata        TEXT DEFAULT '{{}}',
            created_at      BIGINT NOT NULL,
            FOREIGN KEY (tool_id) REFERENCES ai_tools(id)
        );

        -- AI Activities
        CREATE TABLE IF NOT EXISTS ai_activities (
            id              TEXT PRIMARY KEY,
            session_id      TEXT NOT NULL,
            activity_type   TEXT NOT NULL,
            role            TEXT,
            content_preview TEXT,
            tool_name       TEXT,
            file_path       TEXT,
            lines_added     INTEGER,
            lines_removed   INTEGER,
            timestamp       BIGINT NOT NULL,
            metadata        TEXT DEFAULT '{{}}',
            FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
        );

        -- AI Reports
        CREATE TABLE IF NOT EXISTS ai_reports (
            id              TEXT PRIMARY KEY,
            report_type     TEXT NOT NULL,
            title           TEXT NOT NULL,
            range_start     BIGINT NOT NULL,
            range_end       BIGINT NOT NULL,
            content         TEXT,
            stats           TEXT DEFAULT '{{}}',
            session_ids     TEXT DEFAULT '[]',
            summary_method  TEXT,
            summary_tool    TEXT,
            generated_at    BIGINT,
            created_at      BIGINT NOT NULL
        );

        -- AI Report Templates (customizable prompt templates)
        CREATE TABLE IF NOT EXISTS ai_report_templates (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            body            TEXT NOT NULL,
            is_default      INTEGER NOT NULL DEFAULT 0,
            created_at      BIGINT NOT NULL,
            updated_at      BIGINT NOT NULL
        );

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
        CREATE INDEX IF NOT EXISTS idx_reminders_task ON reminders(task_id);
        CREATE INDEX IF NOT EXISTS idx_history_task ON reminder_history(task_id);
        CREATE INDEX IF NOT EXISTS idx_history_time ON reminder_history(scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_gitlab_scan_time ON gitlab_scan_history(scan_at);
        CREATE INDEX IF NOT EXISTS idx_ai_sessions_tool ON ai_sessions(tool_id);
        CREATE INDEX IF NOT EXISTS idx_ai_sessions_time ON ai_sessions(started_at);
        CREATE INDEX IF NOT EXISTS idx_ai_activities_session ON ai_activities(session_id);
        CREATE INDEX IF NOT EXISTS idx_ai_activities_type ON ai_activities(activity_type);
        CREATE INDEX IF NOT EXISTS idx_ai_reports_type_time ON ai_reports(report_type, range_start);

        -- Insert default AI tools
        INSERT OR IGNORE INTO ai_tools (id, name, enabled, watch_paths, parser_type, config, created_at, updated_at)
        VALUES
          ('claude-code',  'Claude Code',  1, '["~/.claude/projects/"]', 'claude_code',  '{{"has_hooks":true}}',  cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000),
          ('codex',        'CodeX',        1, '["~/.codex/sessions/"]',  'codex',        '{{"has_hooks":false}}', cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000),
          ('gemini-cli',   'Gemini CLI',   1, '["~/.gemini/"]',          'generic_json', '{{"has_hooks":false}}', cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000),
          ('qwen-cli',     'Qwen CLI',     1, '["~/.qwen/"]',            'generic_json', '{{"has_hooks":false}}', cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000);

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
    // Safe migration for retry_count
    let _ = conn.execute("ALTER TABLE reminders ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0", []);

    // Migration: fix INTEGER (i32) overflow on time-stamp columns.
    // The Rust code writes Utc::now().timestamp_millis() (~1.78e12) which overflows i32 (max 2.1e9).
    // Run AFTER the migrations above but BEFORE the index creation below, so all
    // data is preserved with the new BIGINT column types.
    if let Err(e) = migrate_timestamps_to_bigint(conn) {
        log::error!("[Schema] Timestamp migration failed: {}", e);
    }

    // Seed the default AI report template if none exist.
    if let Err(e) = seed_default_report_template(conn) {
        log::error!("[Schema] Seed default report template failed: {}", e);
    }

    Ok(())
}

/// Rebuild `reminders` and `reminder_history` tables, changing timestamp columns
/// from INTEGER (i32) to BIGINT (i64) to support millisecond Unix timestamps.
fn migrate_timestamps_to_bigint(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    // Skip if migration already applied
    let marker_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_migrated_bigint'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if marker_count > 0 {
        return Ok(());
    }

    // Check actual column types via PRAGMA table_info
    let reminders_has_bigint: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('reminders') WHERE name='scheduled_at' AND type='BIGINT'",
            [],
            |row| {
                let n: i64 = row.get(0)?;
                Ok(n > 0)
            },
        )
        .unwrap_or(false);
    if reminders_has_bigint {
        log::info!("[Schema] reminders.scheduled_at already BIGINT, skipping migration");
        // Mark as done
        conn.execute("CREATE TABLE IF NOT EXISTS _migrated_bigint (id INTEGER PRIMARY KEY)", [])?;
        conn.execute("INSERT OR IGNORE INTO _migrated_bigint VALUES (1)", [])?;
        return Ok(());
    }

    log::warn!("[Schema] Migrating timestamp columns to BIGINT (i32 overflow fix)...");

    // Use a transaction. We can't ALTER COLUMN TYPE in SQLite, so we rebuild.
    conn.execute_batch(
        r#"
        BEGIN;

        -- Rebuild reminders
        ALTER TABLE reminders RENAME TO _reminders_old;
        CREATE TABLE reminders (
            id              TEXT PRIMARY KEY,
            task_id         TEXT NOT NULL,
            scheduled_at    BIGINT NOT NULL,
            executed_at     BIGINT,
            status          TEXT NOT NULL DEFAULT 'pending',
            channel_results TEXT DEFAULT '[]',
            error_message   TEXT,
            user_action     TEXT,
            user_feedback   TEXT,
            action_at       BIGINT,
            retry_count     INTEGER NOT NULL DEFAULT 0,
            created_at      BIGINT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );
        INSERT INTO reminders (id, task_id, scheduled_at, executed_at, status, channel_results, error_message, user_action, user_feedback, action_at, retry_count, created_at)
        SELECT id, task_id,
               CAST(scheduled_at AS BIGINT), CAST(executed_at AS BIGINT), status, channel_results, error_message, user_action, user_feedback,
               CAST(action_at AS BIGINT), retry_count, CAST(created_at AS BIGINT)
        FROM _reminders_old;
        DROP TABLE _reminders_old;

        -- Rebuild reminder_history
        ALTER TABLE reminder_history RENAME TO _reminder_history_old;
        CREATE TABLE reminder_history (
            id              TEXT PRIMARY KEY,
            reminder_id     TEXT NOT NULL,
            task_id         TEXT NOT NULL,
            task_name       TEXT NOT NULL,
            scheduled_at    BIGINT NOT NULL,
            executed_at     BIGINT,
            status          TEXT NOT NULL,
            channel_results TEXT DEFAULT '[]',
            user_action     TEXT,
            user_feedback   TEXT,
            created_at      BIGINT NOT NULL
        );
        INSERT INTO reminder_history (id, reminder_id, task_id, task_name, scheduled_at, executed_at, status, channel_results, user_action, user_feedback, created_at)
        SELECT id, reminder_id, task_id, task_name,
               CAST(scheduled_at AS BIGINT), CAST(executed_at AS BIGINT), status, channel_results, user_action, user_feedback,
               CAST(created_at AS BIGINT)
        FROM _reminder_history_old;
        DROP TABLE _reminder_history_old;

        COMMIT;
        "#,
    )?;

    // Recreate indexes (they were dropped with old tables)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_at)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_reminders_task ON reminders(task_id)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_history_task ON reminder_history(task_id)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_history_time ON reminder_history(scheduled_at)", [])?;

    // Mark migration done
    conn.execute("CREATE TABLE IF NOT EXISTS _migrated_bigint (id INTEGER PRIMARY KEY)", [])?;
    conn.execute("INSERT OR IGNORE INTO _migrated_bigint VALUES (1)", [])?;

    log::info!("[Schema] Timestamp migration to BIGINT completed");
    Ok(())
}

/// Insert the default AI report template if the table is empty.
fn seed_default_report_template(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    use crate::database::dao::activity::DEFAULT_REPORT_TEMPLATE_BODY;
    let count: i64 =
        conn.query_row("SELECT COUNT(*) FROM ai_report_templates", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO ai_report_templates (id, name, body, is_default, created_at, updated_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?4)",
        rusqlite::params!["default", "默认模板", DEFAULT_REPORT_TEMPLATE_BODY, now],
    )?;
    Ok(())
}
