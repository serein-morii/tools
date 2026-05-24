# Task Reminder - Database Layer & Task CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the SQLite database layer with all tables and the task CRUD operations (create, read, update, delete) for the task reminder feature.

**Architecture:** Use rusqlite with bundled SQLite for cross-platform compatibility. Database stored at `~/.tools/tools.db`. Implement a connection pool using a single Arc<Mutex<Connection>> pattern. Each entity (tasks, templates, channels, reminders, settings) has its own DAO module.

**Tech Stack:** Rust, rusqlite (bundled), serde, chrono, uuid, Tauri v2 commands

---

## File Structure

```
src-tauri/
├── Cargo.toml                    # Add dependencies
├── src/
│   ├── lib.rs                    # Register commands
│   ├── error.rs                  # Error types
│   ├── database/
│   │   ├── mod.rs                # Database module
│   │   ├── connection.rs         # Connection management
│   │   ├── schema.rs             # Table definitions
│   │   └── dao/
│   │       ├── mod.rs            # DAO module
│   │       └── task.rs           # Task DAO
│   └── commands/
│       ├── mod.rs                # Commands module
│       └── task.rs               # Task commands
```

---

### Task 1: Add Rust Dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add required dependencies to Cargo.toml**

```toml
[dependencies]
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
log = "0.4"
tauri = { version = "2.11.2", features = [] }
tauri-plugin-log = "2"
tauri-plugin-shell = "2"
rusqlite = { version = "0.32", features = ["bundled"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.10", features = ["v4", "serde"] }
dirs = "5.0"
thiserror = "1.0"
tokio = { version = "1", features = ["sync"] }
```

- [ ] **Step 2: Run cargo check to verify dependencies**

Run: `cd src-tauri && cargo check`
Expected: Dependencies download and compile successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "feat: add database dependencies (rusqlite, chrono, uuid)"
```

---

### Task 2: Create Error Types

**Files:**
- Create: `src-tauri/src/error.rs`

- [ ] **Step 1: Create error.rs with all error types**

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ToolsError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Task not found: {0}")]
    TaskNotFound(String),

    #[error("Template not found: {0}")]
    TemplateNotFound(String),

    #[error("Channel not found: {0}")]
    ChannelNotFound(String),

    #[error("Invalid cron expression: {0}")]
    InvalidCron(String),

    #[error("Notification failed: {0}")]
    NotificationFailed(String),
}

pub type Result<T> = std::result::Result<T, ToolsError>;
```

- [ ] **Step 2: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/error.rs
git commit -m "feat: add error types for database layer"
```

---

### Task 3: Create Database Connection Module

**Files:**
- Create: `src-tauri/src/database/mod.rs`
- Create: `src-tauri/src/database/connection.rs`

- [ ] **Step 1: Create database/mod.rs**

```rust
pub mod connection;
pub mod schema;
pub mod dao;

pub use connection::Database;
pub use schema::init_schema;
```

- [ ] **Step 2: Create database/connection.rs**

```rust
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use crate::error::Result;

pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new() -> Result<Self> {
        let db_path = Self::get_db_path()?;
        
        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let conn = Connection::open(&db_path)?;
        
        // Enable foreign keys
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }
    
    fn get_db_path() -> Result<PathBuf> {
        let home = dirs::home_dir()
            .ok_or_else(|| std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Home directory not found"
            ))?;
        Ok(home.join(".tools").join("tools.db"))
    }
    
    pub fn conn(&self) -> &Arc<Mutex<Connection>> {
        &self.conn
    }
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/database/
git commit -m "feat: add database connection module"
```

---

### Task 4: Create Database Schema

**Files:**
- Create: `src-tauri/src/database/schema.rs`

- [ ] **Step 1: Create database/schema.rs with all table definitions**

```rust
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

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
        CREATE INDEX IF NOT EXISTS idx_reminders_task ON reminders(task_id);
        CREATE INDEX IF NOT EXISTS idx_history_task ON reminder_history(task_id);
        CREATE INDEX IF NOT EXISTS idx_history_time ON reminder_history(scheduled_at);

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
    
    Ok(())
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/database/schema.rs
git commit -m "feat: add database schema with all tables"
```

---

### Task 5: Create Task Model and DAO

**Files:**
- Create: `src-tauri/src/database/dao/mod.rs`
- Create: `src-tauri/src/database/dao/task.rs`

- [ ] **Step 1: Create database/dao/mod.rs**

```rust
pub mod task;
```

- [ ] **Step 2: Create database/dao/task.rs with Task model and DAO**

```rust
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
```

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/database/dao/
git commit -m "feat: add Task model and DAO with CRUD operations"
```

---

### Task 6: Create Task Commands

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/task.rs`

- [ ] **Step 1: Create commands/mod.rs**

```rust
pub mod task;

pub use task::*;
```

- [ ] **Step 2: Create commands/task.rs with Tauri commands**

```rust
use std::sync::Arc;
use tauri::State;
use crate::database::{Database, dao::task::{Task, CreateTaskRequest, UpdateTaskRequest, TaskDao}};
use crate::error::Result;

#[tauri::command]
pub fn get_tasks(db: State<'_, Arc<Database>>) -> Result<Vec<Task>> {
    let conn = db.conn().lock().unwrap();
    TaskDao::get_all(&conn)
}

#[tauri::command]
pub fn get_task(db: State<'_, Arc<Database>>, id: String) -> Result<Task> {
    let conn = db.conn().lock().unwrap();
    TaskDao::get_by_id(&conn, &id)?
        .ok_or_else(|| crate::error::ToolsError::TaskNotFound(id))
}

#[tauri::command]
pub fn create_task(db: State<'_, Arc<Database>>, task: CreateTaskRequest) -> Result<Task> {
    let conn = db.conn().lock().unwrap();
    TaskDao::create(&conn, task)
}

#[tauri::command]
pub fn update_task(db: State<'_, Arc<Database>>, id: String, task: UpdateTaskRequest) -> Result<Task> {
    let conn = db.conn().lock().unwrap();
    TaskDao::update(&conn, &id, task)
}

#[tauri::command]
pub fn delete_task(db: State<'_, Arc<Database>>, id: String) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    TaskDao::delete(&conn, &id)
}

#[tauri::command]
pub fn toggle_task(db: State<'_, Arc<Database>>, id: String, enabled: bool) -> Result<Task> {
    let conn = db.conn().lock().unwrap();
    TaskDao::toggle(&conn, &id, enabled)
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/
git commit -m "feat: add Tauri commands for task CRUD"
```

---

### Task 7: Wire Up Database and Commands in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Update lib.rs to initialize database and register commands**

```rust
mod commands;
mod database;
mod error;

use std::sync::Arc;
use database::{Database, init_schema};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize database
    let db = match Database::new() {
        Ok(db) => {
            // Initialize schema
            let conn = db.conn().lock().unwrap();
            if let Err(e) = init_schema(&conn) {
                log::error!("Failed to initialize database schema: {}", e);
            }
            drop(conn);
            Arc::new(db)
        }
        Err(e) => {
            log::error!("Failed to initialize database: {}", e);
            std::process::exit(1);
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(db)
        .invoke_handler(tauri::generate_handler![
            commands::get_tasks,
            commands::get_task,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
            commands::toggle_task,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: wire up database and task commands in Tauri app"
```

---

### Task 8: Create Frontend API Layer

**Files:**
- Create: `src/lib/api/index.ts`
- Create: `src/lib/api/task.ts`

- [ ] **Step 1: Create lib/api/index.ts with Tauri invoke wrapper**

```typescript
import { invoke } from "@tauri-apps/api/core";

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(cmd, args);
}
```

- [ ] **Step 2: Create lib/api/task.ts with task API functions**

```typescript
import { call } from "./index";
import type { Task, CreateTaskRequest, UpdateTaskRequest } from "@/types";

export const taskApi = {
  getAll: (): Promise<Task[]> => call<Task[]>("get_tasks"),

  getById: (id: string): Promise<Task> => call<Task>("get_task", { id }),

  create: (task: CreateTaskRequest): Promise<Task> =>
    call<Task>("create_task", { task }),

  update: (id: string, task: UpdateTaskRequest): Promise<Task> =>
    call<Task>("update_task", { id, task }),

  delete: (id: string): Promise<void> => call<void>("delete_task", { id }),

  toggle: (id: string, enabled: boolean): Promise<Task> =>
    call<Task>("toggle_task", { id, enabled }),
};
```

- [ ] **Step 3: Update types/index.ts with Task request types**

Add to existing `src/types/index.ts`:

```typescript
export interface CreateTaskRequest {
  name: string;
  description?: string;
  reminder_type?: string;
  cron_expr?: string;
  cron_config?: string;
  template_id?: string;
  channel_ids?: string[];
  tags?: string[];
  priority?: number;
}

export interface UpdateTaskRequest {
  name?: string;
  description?: string;
  reminder_type?: string;
  cron_expr?: string;
  cron_config?: string;
  enabled?: boolean;
  status?: string;
  template_id?: string;
  channel_ids?: string[];
  tags?: string[];
  priority?: number;
}
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `npm run build`
Expected: Builds successfully

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/ src/types/index.ts
git commit -m "feat: add frontend API layer for task CRUD"
```

---

### Task 9: Create React Query Hooks

**Files:**
- Create: `src/lib/query/taskQueries.ts`

- [ ] **Step 1: Create query/taskQueries.ts with React Query hooks**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { taskApi } from "@/lib/api/task";
import type { CreateTaskRequest, UpdateTaskRequest } from "@/types";

export const taskKeys = {
  all: ["tasks"] as const,
  list: () => [...taskKeys.all, "list"] as const,
  detail: (id: string) => [...taskKeys.all, "detail", id] as const,
};

export function useTasks() {
  return useQuery({
    queryKey: taskKeys.list(),
    queryFn: taskApi.getAll,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => taskApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: CreateTaskRequest) => taskApi.create(task),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.list() });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, task }: { id: string; task: UpdateTaskRequest }) =>
      taskApi.update(id, task),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.list() });
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => taskApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.list() });
    },
  });
}

export function useToggleTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      taskApi.toggle(id, enabled),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.list() });
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: Builds successfully

- [ ] **Step 3: Commit**

```bash
git add src/lib/query/
git commit -m "feat: add React Query hooks for task operations"
```

---

### Task 10: Verify End-to-End Functionality

**Files:**
- None (testing)

- [ ] **Step 1: Build the application**

Run: `npm run tauri build -- --debug`
Expected: Builds successfully

- [ ] **Step 2: Run the dev server and test task creation**

Run: `npm run tauri dev`
Expected: App starts, database is created at ~/.tools/tools.db

- [ ] **Step 3: Verify database was created**

Run: `ls -la ~/.tools/tools.db`
Expected: Database file exists

- [ ] **Step 4: Commit final verification**

```bash
git add -A
git commit -m "chore: verify database layer and task CRUD working"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Database tables: tasks, templates, channels, reminders, reminder_history, settings
- ✅ Task CRUD operations
- ✅ Tauri commands for task operations
- ✅ Frontend API layer
- ✅ React Query hooks
- ⚠️ Templates, channels, reminders DAOs - will be in subsequent plans
- ⚠️ Scheduler and notifier - will be in subsequent plans

**2. Placeholder scan:**
- ✅ No TBD, TODO, or placeholder text
- ✅ All code blocks contain complete implementations
- ✅ All commands have expected output

**3. Type consistency:**
- ✅ Task model fields match between Rust and TypeScript
- ✅ CreateTaskRequest and UpdateTaskRequest match between layers
- ✅ Error types cover all failure cases
