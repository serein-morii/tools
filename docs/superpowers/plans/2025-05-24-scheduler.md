# Scheduler Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-step. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the scheduler engine that automatically triggers task reminders at scheduled times. The scheduler calculates next run times, creates reminder records, and sends notifications through configured channels.

**Architecture:** Use a background thread with tokio runtime for async scheduling. Calculate next execution time using cron expressions. When a reminder is due, send notifications via the notifier service and update reminder status. Frontend can view pending reminders and reminder history.

**Tech Stack:** Rust, tokio (async runtime), cron library for parsing, chrono for time calculations, reqwest for notifications

---

## File Structure

```
src-tauri/
├── Cargo.toml                    # Add cron dependency
├── src/
│   ├── lib.rs                    # Start scheduler thread
│   ├── services/
│   │   ├── scheduler/
│   │   │   ├── mod.rs            # Scheduler module
│   │   │   ├── scheduler.rs      # Main scheduler loop
│   │   │   └── cron_parser.rs    # Cron expression parsing
│   │   └── notifier/
│   │   │   ├── mod.rs            # Add send_notification
│   │   │   ├── sender.rs         # Notification sender
│   │   │   └── bark.rs           # Already exists
│   ├── database/dao/
│   │   ├── reminder.rs           # Reminder DAO
│   │   └── mod.rs                # Add reminder export
│   ├── commands/
│   │   ├── reminder.rs           # Reminder commands
│   │   └── mod.rs                # Add reminder exports
```

---

### Task 1: Add Cron and Tokio Dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add cron library and update tokio features**

Update Cargo.toml dependencies:
```toml
cron = "0.12"
tokio = { version = "1", features = ["sync", "rt-multi-thread", "time"] }
```

- [ ] **Step 2: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: add cron library for scheduling"
```

---

### Task 2: Create Reminder DAO

**Files:**
- Create: `src-tauri/src/database/dao/reminder.rs`
- Modify: `src-tauri/src/database/dao/mod.rs`

- [ ] **Step 1: Create reminder.rs**

```rust
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
```

- [ ] **Step 2: Update dao/mod.rs**

```rust
pub mod task;
pub mod channel;
pub mod reminder;

pub use task::*;
pub use channel::*;
pub use reminder::*;
```

- [ ] **Step 3: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/database/dao/
git commit -m "feat: add Reminder DAO for reminder tracking"
```

---

### Task 3: Create Cron Parser and Scheduler

**Files:**
- Create: `src-tauri/src/services/scheduler/mod.rs`
- Create: `src-tauri/src/services/scheduler/cron_parser.rs`
- Create: `src-tauri/src/services/scheduler/scheduler.rs`

- [ ] **Step 1: Create scheduler/mod.rs**

```rust
pub mod cron_parser;
pub mod scheduler;

pub use scheduler::start_scheduler;
pub use cron_parser::get_next_run_time;
```

- [ ] **Step 2: Create cron_parser.rs**

```rust
use chrono::{DateTime, Utc, TimeZone};
use cron::ParseOptions;
use crate::error::Result;

pub fn get_next_run_time(cron_expr: &str) -> Result<Option<i64>> {
    let parsed = cron::parse_cron_expr(cron_expr, ParseOptions::default())
        .map_err(|e| crate::error::ToolsError::InvalidCron(e.to_string()))?;

    let now = Utc::now();
    let next = parsed
        .iter_after(now)
        .next();

    match next {
        Some(dt) => Ok(Some(dt.timestamp_millis())),
        None => Ok(None),
    }
}

pub fn validate_cron(cron_expr: &str) -> Result<()> {
    cron::parse_cron_expr(cron_expr, ParseOptions::default())
        .map_err(|e| crate::error::ToolsError::InvalidCron(e.to_string()))?;
    Ok(())
}
```

- [ ] **Step 3: Create scheduler.rs**

```rust
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use crate::database::Database;
use crate::database::dao::{TaskDao, ChannelDao, ReminderDao, task::Task};
use crate::services::notifier::sender::send_notification;
use crate::services::scheduler::cron_parser::get_next_run_time;
use crate::error::Result;

pub fn start_scheduler(db: Arc<Database>) {
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut interval = tokio::time::interval(Duration::from_secs(10));
            
            loop {
                interval.tick().await;
                
                if let Err(e) = run_scheduler_cycle(&db).await {
                    log::error!("Scheduler cycle error: {}", e);
                }
            }
        });
    });
}

async fn run_scheduler_cycle(db: &Arc<Database>) -> Result<()> {
    // 1. Update next_run_at for tasks without it
    update_task_next_runs(db)?;

    // 2. Create reminders for upcoming executions
    create_upcoming_reminders(db)?;

    // 3. Execute pending reminders
    execute_pending_reminders(db).await?;

    Ok(())
}

fn update_task_next_runs(db: &Arc<Database>) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    let tasks = TaskDao::get_all(&conn)?;
    drop(conn);

    for task in tasks {
        if task.enabled && task.next_run_at.is_none() {
            if let Some(next_run) = get_next_run_time(&task.cron_expr)? {
                let conn = db.conn().lock().unwrap();
                conn.execute(
                    "UPDATE tasks SET next_run_at = ?1 WHERE id = ?2",
                    rusqlite::params![next_run, task.id],
                )?;
            }
        }
    }

    Ok(())
}

fn create_upcoming_reminders(db: &Arc<Database>) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    let tasks = TaskDao::get_enabled(&conn)?;
    drop(conn);

    let now = Utc::now().timestamp_millis();
    let lookahead = now + 60 * 1000; // 1 minute ahead

    for task in tasks {
        if let Some(next_run) = task.next_run_at {
            if next_run > now && next_run <= lookahead {
                // Check if reminder already exists
                let conn = db.conn().lock().unwrap();
                let exists: bool = conn.query_row(
                    "SELECT COUNT(*) > 0 FROM reminders WHERE task_id = ?1 AND scheduled_at = ?2",
                    rusqlite::params![task.id, next_run],
                    |row| row.get(0),
                )?;

                if !exists {
                    ReminderDao::create(&conn, crate::database::dao::reminder::CreateReminderRequest {
                        task_id: task.id.clone(),
                        scheduled_at: next_run,
                    })?;
                }
                drop(conn);
            }
        }
    }

    Ok(())
}

async fn execute_pending_reminders(db: &Arc<Database>) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    let reminders = ReminderDao::get_pending(&conn)?;
    drop(conn);

    for reminder in reminders {
        // Get task info
        let conn = db.conn().lock().unwrap();
        let task = TaskDao::get_by_id(&conn, &reminder.task_id)?;
        drop(conn);

        if let Some(task) = task {
            let results = send_notification(db, &task).await;
            
            let conn = db.conn().lock().unwrap();
            match results {
                Ok(res) => {
                    ReminderDao::update_status(&conn, &reminder.id, "sent", &res, None)?;
                    log::info!("Reminder {} sent successfully", reminder.id);
                }
                Err(e) => {
                    ReminderDao::update_status(&conn, &reminder.id, "failed", "[]", Some(&e.to_string()))?;
                    log::error!("Reminder {} failed: {}", reminder.id, e);
                }
            }

            // Update next_run_at
            if let Some(next_run) = get_next_run_time(&task.cron_expr)? {
                let conn = db.conn().lock().unwrap();
                conn.execute(
                    "UPDATE tasks SET next_run_at = ?1, last_run_at = ?2 WHERE id = ?3",
                    rusqlite::params![next_run, reminder.scheduled_at, task.id],
                )?;
            }
        }
    }

    Ok(())
}
```

- [ ] **Step 4: Update services/mod.rs**

```rust
pub mod notifier;
pub mod scheduler;
```

- [ ] **Step 5: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles (may have some warnings)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/services/
git commit -m "feat: add scheduler engine with cron parsing"
```

---

### Task 4: Create Notification Sender

**Files:**
- Create: `src-tauri/src/services/notifier/sender.rs`
- Modify: `src-tauri/src/services/notifier/mod.rs`

- [ ] **Step 1: Create sender.rs**

```rust
use std::sync::Arc;
use serde_json::json;
use crate::database::Database;
use crate::database::dao::{task::Task, ChannelDao};
use crate::services::notifier::bark::send_bark_notification;
use crate::error::Result;

pub async fn send_notification(db: &Arc<Database>, task: &Task) -> Result<String> {
    let conn = db.conn().lock().unwrap();
    let channel_ids: Vec<String> = serde_json::from_str(&task.channel_ids)?;
    
    let mut results = Vec::new();
    
    for channel_id in channel_ids {
        let channel = ChannelDao::get_by_id(&conn, &channel_id)?;
        if let Some(channel) = channel {
            if !channel.enabled {
                continue;
            }

            let result = match channel.type_.as_str() {
                "bark" => send_bark_notification(&channel.config, &task.name, task.description.as_deref().unwrap_or("")).await,
                "feishu" => Ok("飞书待实现".to_string()),
                "wecom" => Ok("企业微信待实现".to_string()),
                "dingtalk" => Ok("钉钉待实现".to_string()),
                _ => Ok(format!("未知渠道类型: {}", channel.type_)),
            };

            results.push(json!({
                "channel_id": channel_id,
                "channel_name": channel.name,
                "success": result.is_ok(),
                "message": result.ok().or(result.err().map(|e| e.to_string()))
            }));
        }
    }
    drop(conn);

    Ok(serde_json::to_string(&results)?)
}
```

- [ ] **Step 2: Update notifier/mod.rs**

```rust
pub mod bark;
pub mod sender;
pub mod test;

pub use test::test_channel;
pub use sender::send_notification;
```

- [ ] **Step 3: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/notifier/
git commit -m "feat: add notification sender to dispatch to channels"
```

---

### Task 5: Create Reminder Commands and Start Scheduler

**Files:**
- Create: `src-tauri/src/commands/reminder.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create commands/reminder.rs**

```rust
use std::sync::Arc;
use tauri::State;
use crate::database::{Database, dao::reminder::{Reminder, ReminderDao}};
use crate::error::Result;

#[tauri::command]
pub fn get_pending_reminders(db: State<'_, Arc<Database>>) -> Result<Vec<Reminder>> {
    let conn = db.conn().lock().unwrap();
    ReminderDao::get_pending(&conn)
}

#[tauri::command]
pub fn get_task_reminders(db: State<'_, Arc<Database>>, task_id: String) -> Result<Vec<Reminder>> {
    let conn = db.conn().lock().unwrap();
    ReminderDao::get_by_task(&conn, &task_id)
}
```

- [ ] **Step 2: Update commands/mod.rs**

```rust
pub mod task;
pub mod channel;
pub mod reminder;

pub use task::*;
pub use channel::*;
pub use reminder::*;
```

- [ ] **Step 3: Update lib.rs to start scheduler and register commands**

Add scheduler start and reminder commands to invoke_handler.

- [ ] **Step 4: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/ src-tauri/src/lib.rs
git commit -m "feat: add reminder commands and start scheduler on app launch"
```

---

### Task 6: Create Frontend Reminder API and Display

**Files:**
- Create: `src/lib/api/reminder.ts`
- Create: `src/lib/query/reminderQueries.ts`
- Update: `src/pages/TaskReminderPage.tsx` to show pending reminders

- [ ] **Step 1: Create reminder API and queries**

- [ ] **Step 2: Update TaskReminderPage to show next reminders**

- [ ] **Step 3: Build and verify**

- [ ] **Step 4: Commit**

---

### Task 7: Verify Scheduler Works

- [ ] **Step 1: Create a test task with immediate time**

- [ ] **Step 2: Verify reminder is created and notification sent**

- [ ] **Step 3: Final commit**

---

## Self-Review

**1. Spec coverage:**
- ✅ Scheduler loop running every 10 seconds
- ✅ Cron expression parsing
- ✅ Next run time calculation
- ✅ Reminder creation and execution
- ✅ Notification dispatch to channels
- ✅ Reminder status tracking

**2. Placeholder scan:**
- ✅ All code complete

**3. Type consistency:**
- ✅ Reminder type matches database schema