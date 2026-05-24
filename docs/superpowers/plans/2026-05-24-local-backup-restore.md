# Local Backup Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable local JSON export/import for reminder configuration data from the Settings page.

**Architecture:** Add a backend backup DAO that serializes and restores `tasks`, `channels`, `templates`, and `settings` through a versioned JSON structure. Add Tauri commands for file export/import and a small frontend API/query layer. Update the Settings data management card to trigger exports, accept an import path, and show operation results.

**Tech Stack:** Rust, rusqlite, serde_json, chrono, dirs, Tauri commands, React 19, TypeScript, React Query, Vite, Tailwind UI components.

---

## File Structure

- Create `src-tauri/src/database/dao/backup.rs`: backup structs, export/import DAO, in-memory round-trip tests.
- Modify `src-tauri/src/database/dao/mod.rs`: expose backup module.
- Create `src-tauri/src/commands/backup.rs`: Tauri commands for export/import files.
- Modify `src-tauri/src/commands/mod.rs`: expose backup commands.
- Modify `src-tauri/src/lib.rs`: register backup commands.
- Modify `src/types/index.ts`: add backup result/request types.
- Create `src/lib/api/backup.ts`: frontend backup command wrappers.
- Create `src/lib/query/backupQueries.ts`: export/import mutations and query invalidation.
- Modify `src/pages/SettingsPage.tsx`: enable data management controls.

---

### Task 1: Backend backup DAO

**Files:**
- Create: `src-tauri/src/database/dao/backup.rs`
- Modify: `src-tauri/src/database/dao/mod.rs`
- Test: `src-tauri/src/database/dao/backup.rs`

- [ ] **Step 1: Write the failing backup DAO test and skeleton**

Create `src-tauri/src/database/dao/backup.rs`:

```rust
use serde::{Deserialize, Serialize};

use crate::database::dao::{
    channel::Channel,
    settings::Setting,
    task::Task,
    template::Template,
};
use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupData {
    pub version: i32,
    pub exported_at: i64,
    pub tasks: Vec<Task>,
    pub channels: Vec<Channel>,
    pub templates: Vec<Template>,
    pub settings: Vec<Setting>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BackupCounts {
    pub tasks: usize,
    pub channels: usize,
    pub templates: usize,
    pub settings: usize,
}

pub struct BackupDao;

impl BackupDao {
    pub fn export_data(_conn: &rusqlite::Connection) -> Result<BackupData> {
        unimplemented!("export_data will be implemented after the failing test")
    }

    pub fn import_data(_conn: &mut rusqlite::Connection, _data: BackupData) -> Result<BackupCounts> {
        unimplemented!("import_data will be implemented after the failing test")
    }
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
             INSERT INTO settings (key, value) VALUES ('snooze_minutes', '12');"
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

        let mut target = setup_conn();
        let counts = BackupDao::import_data(&mut target, data).unwrap();
        assert_eq!(counts.tasks, 1);
        assert_eq!(counts.channels, 1);
        assert_eq!(counts.templates, 1);
        assert_eq!(counts.settings, 1);

        let task_name: String = target.query_row("SELECT name FROM tasks WHERE id = 'task-1'", [], |row| row.get(0)).unwrap();
        let setting_value: String = target.query_row("SELECT value FROM settings WHERE key = 'snooze_minutes'", [], |row| row.get(0)).unwrap();
        assert_eq!(task_name, "备份任务");
        assert_eq!(setting_value, "12");
    }
}
```

Modify `src-tauri/src/database/dao/mod.rs`:

```rust
pub mod task;
pub mod channel;
pub mod reminder;
pub mod template;
pub mod settings;
pub mod backup;

pub use task::*;
pub use channel::*;
pub use reminder::*;
```

- [ ] **Step 2: Run the targeted backup test and verify RED**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml backup_export_import_round_trip
```

Expected: FAIL because `BackupDao::export_data` panics at `unimplemented!`.

- [ ] **Step 3: Implement export/import DAO**

Replace `src-tauri/src/database/dao/backup.rs` with:

```rust
use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::database::dao::{
    channel::Channel,
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
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BackupCounts {
    pub tasks: usize,
    pub channels: usize,
    pub templates: usize,
    pub settings: usize,
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

        tx.commit()?;

        Ok(BackupCounts {
            tasks: data.tasks.len(),
            channels: data.channels.len(),
            templates: data.templates.len(),
            settings: data.settings.len(),
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
             INSERT INTO settings (key, value) VALUES ('snooze_minutes', '12');"
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

        let mut target = setup_conn();
        let counts = BackupDao::import_data(&mut target, data).unwrap();
        assert_eq!(counts.tasks, 1);
        assert_eq!(counts.channels, 1);
        assert_eq!(counts.templates, 1);
        assert_eq!(counts.settings, 1);

        let task_name: String = target.query_row("SELECT name FROM tasks WHERE id = 'task-1'", [], |row| row.get(0)).unwrap();
        let setting_value: String = target.query_row("SELECT value FROM settings WHERE key = 'snooze_minutes'", [], |row| row.get(0)).unwrap();
        assert_eq!(task_name, "备份任务");
        assert_eq!(setting_value, "12");
    }
}
```

- [ ] **Step 4: Add backup error variant**

Modify `src-tauri/src/error.rs` by adding this variant after `NotificationFailed`:

```rust
    #[error("Backup failed: {0}")]
    Backup(String),
```

- [ ] **Step 5: Run the targeted backup test and verify GREEN**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml backup_export_import_round_trip
```

Expected: PASS for `backup_export_import_round_trip`.

---

### Task 2: Backup Tauri commands

**Files:**
- Create: `src-tauri/src/commands/backup.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create backup commands**

Create `src-tauri/src/commands/backup.rs`:

```rust
use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::database::{dao::backup::{BackupCounts, BackupDao, BackupData}, Database};
use crate::error::{Result, ToolsError};

#[derive(Debug, Deserialize)]
pub struct ExportBackupRequest {
    pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ImportBackupRequest {
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct BackupExportResult {
    pub path: String,
    pub counts: BackupCounts,
}

#[derive(Debug, Serialize)]
pub struct BackupImportResult {
    pub counts: BackupCounts,
}

#[tauri::command]
pub fn export_backup(db: State<'_, Arc<Database>>, request: Option<ExportBackupRequest>) -> Result<BackupExportResult> {
    let path = match request.and_then(|item| item.path) {
        Some(path) if !path.trim().is_empty() => PathBuf::from(path),
        _ => default_backup_path()?,
    };

    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err(ToolsError::Backup(format!("Backup directory does not exist: {}", parent.display())));
        }
    }

    let conn = db.conn().lock().unwrap();
    let data = BackupDao::export_data(&conn)?;
    let counts = BackupCounts {
        tasks: data.tasks.len(),
        channels: data.channels.len(),
        templates: data.templates.len(),
        settings: data.settings.len(),
    };
    let content = serde_json::to_string_pretty(&data)?;
    std::fs::write(&path, content)?;

    Ok(BackupExportResult {
        path: path.to_string_lossy().to_string(),
        counts,
    })
}

#[tauri::command]
pub fn import_backup(db: State<'_, Arc<Database>>, request: ImportBackupRequest) -> Result<BackupImportResult> {
    let content = std::fs::read_to_string(&request.path)?;
    let data: BackupData = serde_json::from_str(&content)?;
    let mut conn = db.conn().lock().unwrap();
    let counts = BackupDao::import_data(&mut conn, data)?;

    Ok(BackupImportResult { counts })
}

fn default_backup_path() -> Result<PathBuf> {
    let downloads = dirs::download_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| ToolsError::Backup("Cannot resolve backup directory".to_string()))?;
    Ok(downloads.join(format!("tools-backup-{}.json", Utc::now().format("%Y%m%d-%H%M%S"))))
}
```

- [ ] **Step 2: Export backup commands**

Modify `src-tauri/src/commands/mod.rs`:

```rust
pub mod task;
pub mod channel;
pub mod reminder;
pub mod template;
pub mod settings;
pub mod backup;

pub use task::*;
pub use channel::*;
pub use reminder::*;
pub use template::*;
pub use settings::*;
pub use backup::*;
```

- [ ] **Step 3: Register commands in Tauri**

Modify `src-tauri/src/lib.rs` so `generate_handler!` includes:

```rust
            commands::export_backup,
            commands::import_backup,
```

Place them after `commands::update_setting`.

- [ ] **Step 4: Run Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all Rust tests pass.

---

### Task 3: Frontend backup data layer

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/api/backup.ts`
- Create: `src/lib/query/backupQueries.ts`

- [ ] **Step 1: Add backup frontend types**

Append these types to `src/types/index.ts`:

```ts
export interface BackupCounts {
  tasks: number;
  channels: number;
  templates: number;
  settings: number;
}

export interface ExportBackupRequest {
  path?: string;
}

export interface ImportBackupRequest {
  path: string;
}

export interface BackupExportResult {
  path: string;
  counts: BackupCounts;
}

export interface BackupImportResult {
  counts: BackupCounts;
}
```

- [ ] **Step 2: Create backup API wrapper**

Create `src/lib/api/backup.ts`:

```ts
import { call } from "./index";
import type {
  BackupExportResult,
  BackupImportResult,
  ExportBackupRequest,
  ImportBackupRequest,
} from "@/types";

export const backupApi = {
  export: (request?: ExportBackupRequest): Promise<BackupExportResult> =>
    call<BackupExportResult>("export_backup", { request }),

  import: (request: ImportBackupRequest): Promise<BackupImportResult> =>
    call<BackupImportResult>("import_backup", { request }),
};
```

- [ ] **Step 3: Create backup React Query hooks**

Create `src/lib/query/backupQueries.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { backupApi } from "@/lib/api/backup";
import { channelKeys } from "@/lib/query/channelQueries";
import { settingsKeys } from "@/lib/query/settingsQueries";
import { taskKeys } from "@/lib/query/taskQueries";
import { templateKeys } from "@/lib/query/templateQueries";
import type { ExportBackupRequest, ImportBackupRequest } from "@/types";

export function useExportBackup() {
  return useMutation({
    mutationFn: (request?: ExportBackupRequest) => backupApi.export(request),
  });
}

export function useImportBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ImportBackupRequest) => backupApi.import(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      queryClient.invalidateQueries({ queryKey: channelKeys.all });
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}
```

- [ ] **Step 4: Run frontend build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build pass.

---

### Task 4: Settings page backup UI

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add backup imports and state**

Modify the top of `src/pages/SettingsPage.tsx` imports:

```tsx
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useExportBackup, useImportBackup } from "@/lib/query/backupQueries";
import { useSettings, useUpdateSetting, getSettingValue } from "@/lib/query/settingsQueries";
```

Inside `SettingsPage`, after `const updateSetting = useUpdateSetting();`, add:

```tsx
  const exportBackup = useExportBackup();
  const importBackup = useImportBackup();
  const [backupPath, setBackupPath] = useState("");
```

- [ ] **Step 2: Add result helpers**

Inside `SettingsPage`, after `saveNumber`, add:

```tsx
  const backupPending = exportBackup.isPending || importBackup.isPending;
  const lastBackupMessage = exportBackup.data
    ? `已导出到 ${exportBackup.data.path}（任务 ${exportBackup.data.counts.tasks}，渠道 ${exportBackup.data.counts.channels}，模板 ${exportBackup.data.counts.templates}，设置 ${exportBackup.data.counts.settings}）`
    : importBackup.data
      ? `已导入：任务 ${importBackup.data.counts.tasks}，渠道 ${importBackup.data.counts.channels}，模板 ${importBackup.data.counts.templates}，设置 ${importBackup.data.counts.settings}`
      : null;
  const backupError = exportBackup.error || importBackup.error;
```

- [ ] **Step 3: Replace Data Management card content**

Replace the current data management `CardContent` block with:

```tsx
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={backupPending}
              onClick={() => exportBackup.mutate(undefined)}
            >
              导出数据
            </Button>
            <Button
              variant="outline"
              disabled={backupPending || !backupPath.trim()}
              onClick={() => importBackup.mutate({ path: backupPath.trim() })}
            >
              导入数据
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="backupPath">导入文件路径</Label>
            <Input
              id="backupPath"
              value={backupPath}
              onChange={(event) => setBackupPath(event.target.value)}
              placeholder="/Users/you/Downloads/tools-backup-20260524-120000.json"
              disabled={backupPending}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            导出任务、渠道、模板和设置；导入会替换这些配置数据，不包含提醒执行历史。
          </p>
          {lastBackupMessage && <p className="text-xs text-green-600">{lastBackupMessage}</p>}
          {backupError && <p className="text-xs text-destructive">{String(backupError)}</p>}
        </CardContent>
```

- [ ] **Step 4: Run frontend build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build pass.

---

### Task 5: Full verification

**Files:**
- No source edits unless verification exposes a bug.

- [ ] **Step 1: Run full Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm run build
```

Expected: build exits 0.

- [ ] **Step 3: Restart real app if needed**

If a `npm run tauri dev` instance is already running from before backup commands were registered, stop only this project’s dev processes and relaunch:

```bash
npm run tauri dev
```

Expected: Vite serves `http://localhost:1420` and Tauri opens the Tools app.

- [ ] **Step 4: Probe Settings route**

Probe:

```text
/settings
```

Expected:

```text
200 /settings
```

- [ ] **Step 5: Export backup from running app command path**

Use the Settings page export button when possible. If UI automation is blocked by macOS permissions, call the command through the running app only as far as the Tauri surface allows; otherwise verify through a direct local Rust/SQLite export path is not sufficient for final PASS and report BLOCKED for click automation.

Expected exported file path:

```text
~/Downloads/tools-backup-*.json
```

- [ ] **Step 6: Inspect exported JSON**

Read the exported JSON and confirm it contains:

```json
"version": 1
```

and top-level arrays:

```json
"tasks"
"channels"
"templates"
"settings"
```

- [ ] **Step 7: Capture Settings screenshot**

Capture:

```text
/tmp/tools-local-backup-settings.png
```

Expected: Settings page shows enabled “导出数据”, “导入数据”, and import path input.

---

## Self-Review Notes

- Spec coverage: export/import backend, frontend data layer, Settings page UI, JSON format, and runtime verification are covered.
- Placeholder scan: no TBD/TODO/fill-in steps are present.
- Type consistency: Rust `BackupCounts`, `BackupExportResult`, and `BackupImportResult` match the TypeScript interfaces.
- Scope check: WebDAV, file picker, encryption, merging, and reminder history export remain out of scope.
