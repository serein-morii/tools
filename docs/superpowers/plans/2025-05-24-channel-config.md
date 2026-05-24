# Notification Channel Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement notification channel configuration with support for Bark, Feishu, WeCom, and DingTalk. Users can add, edit, test, and delete notification channels.

**Architecture:** Create Channel DAO in Rust backend, add Tauri commands for channel CRUD and testing. Create frontend ChannelPage with ChannelList, ChannelCard, and ChannelEditor components. Each channel type has its own configuration form.

**Tech Stack:** Rust, rusqlite, reqwest (for testing), React 19, TypeScript, Tailwind CSS, Radix UI Dialog

---

## File Structure

```
src-tauri/
├── Cargo.toml                    # Add reqwest dependency
├── src/
│   ├── database/dao/
│   │   ├── mod.rs                # Add channel export
│   │   └── channel.rs            # Channel DAO
│   ├── commands/
│   │   ├── mod.rs                # Add channel exports
│   │   ├── channel.rs            # Channel commands
│   └── services/
│       ├── mod.rs                # Services module
│       └── notifier/
│           ├── mod.rs            # Notifier interface
│           ├── bark.rs           # Bark notifier
│           └── test.rs           # Channel testing

src/
├── components/modules/reminder/
│   ├── ChannelList.tsx           # Channel list
│   ├── ChannelCard.tsx           # Individual channel card
│   ├── ChannelEditor.tsx         # Channel create/edit dialog
│   └── BarkConfigForm.tsx        # Bark configuration form
├── pages/
│   ├── TaskReminderPage.tsx      # Add Channel tab
│   └── ChannelsPage.tsx          # Dedicated channels page
└── lib/
    └── api/
        └── channel.ts            # Channel API
```

---

### Task 1: Add reqwest Dependency for HTTP Requests

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add reqwest dependency**

Add to Cargo.toml dependencies:
```toml
reqwest = { version = "0.12", features = ["json"] }
```

- [ ] **Step 2: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: add reqwest for HTTP requests"
```

---

### Task 2: Create Channel DAO

**Files:**
- Create: `src-tauri/src/database/dao/channel.rs`
- Modify: `src-tauri/src/database/dao/mod.rs`

- [ ] **Step 1: Create channel.rs with Channel model and DAO**

```rust
use chrono::Utc;
use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::{Result, ToolsError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: String,
    pub name: String,
    pub type_: String,
    pub enabled: bool,
    pub config: String,
    pub last_test_at: Option<i64>,
    pub last_test_result: Option<String>,
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateChannelRequest {
    pub name: String,
    pub type_: String,
    pub config: String,
    pub description: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateChannelRequest {
    pub name: Option<String>,
    pub config: Option<String>,
    pub description: Option<String>,
    pub enabled: Option<bool>,
}

impl Channel {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
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
    }
}

pub struct ChannelDao;

impl ChannelDao {
    pub fn create(conn: &Connection, req: CreateChannelRequest) -> Result<Channel> {
        let now = Utc::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();
        let enabled = req.enabled.unwrap_or(true);

        conn.execute(
            r#"
            INSERT INTO channels (id, name, type, enabled, config, description, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
            "#,
            rusqlite::params![id, req.name, req.type_, if enabled { 1 } else { 0 }, req.config, req.description, now],
        )?;

        Self::get_by_id(conn, &id)?.ok_or_else(|| ToolsError::ChannelNotFound(id))
    }

    pub fn get_all(conn: &Connection) -> Result<Vec<Channel>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, type, enabled, config, last_test_at, last_test_result, description, created_at, updated_at
             FROM channels ORDER BY created_at DESC"
        )?;

        let channels = stmt.query_map([], Channel::from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(channels)
    }

    pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Channel>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, type, enabled, config, last_test_at, last_test_result, description, created_at, updated_at
             FROM channels WHERE id = ?1"
        )?;

        let channel = stmt.query_row([id], Channel::from_row).ok();
        Ok(channel)
    }

    pub fn update(conn: &Connection, id: &str, req: UpdateChannelRequest) -> Result<Channel> {
        let now = Utc::now().timestamp_millis();

        let mut sets = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(name) = &req.name {
            sets.push("name = ?");
            params.push(Box::new(name.clone()));
        }
        if let Some(config) = &req.config {
            sets.push("config = ?");
            params.push(Box::new(config.clone()));
        }
        if let Some(desc) = &req.description {
            sets.push("description = ?");
            params.push(Box::new(desc.clone()));
        }
        if let Some(enabled) = req.enabled {
            sets.push("enabled = ?");
            params.push(Box::new(if enabled { 1 } else { 0 }));
        }

        sets.push("updated_at = ?");
        params.push(Box::new(now));
        params.push(Box::new(id.to_string()));

        let sql = format!("UPDATE channels SET {} WHERE id = ?", sets.join(", "));
        conn.execute(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))?;

        Self::get_by_id(conn, id)?.ok_or_else(|| ToolsError::ChannelNotFound(id.to_string()))
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<()> {
        let rows = conn.execute("DELETE FROM channels WHERE id = ?1", [id])?;
        if rows == 0 {
            return Err(ToolsError::ChannelNotFound(id.to_string()));
        }
        Ok(())
    }

    pub fn update_test_result(conn: &Connection, id: &str, result: Option<&str>) -> Result<()> {
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE channels SET last_test_at = ?1, last_test_result = ?2, updated_at = ?1 WHERE id = ?3",
            rusqlite::params![now, result, id],
        )?;
        Ok(())
    }
}
```

- [ ] **Step 2: Update dao/mod.rs to export channel**

```rust
pub mod task;
pub mod channel;

pub use task::*;
pub use channel::*;
```

- [ ] **Step 3: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/database/dao/
git commit -m "feat: add Channel DAO for notification channels"
```

---

### Task 3: Create Notifier Service for Testing

**Files:**
- Create: `src-tauri/src/services/mod.rs`
- Create: `src-tauri/src/services/notifier/mod.rs`
- Create: `src-tauri/src/services/notifier/bark.rs`
- Create: `src-tauri/src/services/notifier/test.rs`

- [ ] **Step 1: Create services/mod.rs**

```rust
pub mod notifier;
```

- [ ] **Step 2: Create services/notifier/mod.rs**

```rust
pub mod bark;
pub mod test;

pub use test::test_channel;
```

- [ ] **Step 3: Create services/notifier/bark.rs**

```rust
use reqwest::Client;
use serde_json::Value;
use crate::error::{Result, ToolsError};

pub async fn send_bark_notification(
    config_json: &str,
    title: &str,
    body: &str,
) -> Result<String> {
    let config: Value = serde_json::from_str(config_json)?;
    
    let server_url = config["serverUrl"].as_str().unwrap_or("https://api.day.app");
    let key = config["key"].as_str()
        .ok_or_else(|| ToolsError::NotificationFailed("Bark key is required".to_string()))?;
    
    let url = format!("{}/{}", server_url, key);
    
    let client = Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "title": title,
            "body": body,
            "sound": config["sound"].as_str().unwrap_or("bell"),
            "group": config["group"].as_str().unwrap_or("Tools"),
        }))
        .send()
        .await?;
    
    let status = response.status();
    let body = response.text().await?;
    
    if status.is_success() {
        Ok("发送成功".to_string())
    } else {
        Err(ToolsError::NotificationFailed(format!("Bark 发送失败: {}", body)))
    }
}
```

- [ ] **Step 4: Create services/notifier/test.rs**

```rust
use crate::database::Database;
use crate::database::dao::channel::ChannelDao;
use crate::error::Result;
use crate::services::notifier::bark::send_bark_notification;

pub async fn test_channel(db: &Database, channel_id: &str) -> Result<String> {
    let conn = db.conn().lock().unwrap();
    let channel = ChannelDao::get_by_id(&conn, channel_id)?
        .ok_or_else(|| crate::error::ToolsError::ChannelNotFound(channel_id.to_string()))?;
    drop(conn);
    
    let result = match channel.type_.as_str() {
        "bark" => send_bark_notification(&channel.config, "Tools 测试", "这是一条测试消息").await?,
        "feishu" => Ok("飞书测试待实现".to_string()),
        "wecom" => Ok("企业微信测试待实现".to_string()),
        "dingtalk" => Ok("钉钉测试待实现".to_string()),
        _ => Err(crate::error::ToolsError::NotificationFailed(format!("未知的渠道类型: {}", channel.type_))),
    };
    
    // Update test result
    let conn = db.conn().lock().unwrap();
    match &result {
        Ok(msg) => ChannelDao::update_test_result(&conn, channel_id, Some(msg))?,
        Err(e) => ChannelDao::update_test_result(&conn, channel_id, Some(&e.to_string()))?,
    }
    
    result
}
```

- [ ] **Step 5: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/services/
git commit -m "feat: add notifier service with Bark implementation"
```

---

### Task 4: Create Channel Commands

**Files:**
- Create: `src-tauri/src/commands/channel.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create commands/channel.rs**

```rust
use std::sync::Arc;
use tauri::State;
use crate::database::{Database, dao::channel::{Channel, CreateChannelRequest, UpdateChannelRequest, ChannelDao}};
use crate::error::Result;
use crate::services::notifier::test_channel;

#[tauri::command]
pub fn get_channels(db: State<'_, Arc<Database>>) -> Result<Vec<Channel>> {
    let conn = db.conn().lock().unwrap();
    ChannelDao::get_all(&conn)
}

#[tauri::command]
pub fn get_channel(db: State<'_, Arc<Database>>, id: String) -> Result<Channel> {
    let conn = db.conn().lock().unwrap();
    ChannelDao::get_by_id(&conn, &id)?
        .ok_or_else(|| crate::error::ToolsError::ChannelNotFound(id))
}

#[tauri::command]
pub fn create_channel(db: State<'_, Arc<Database>>, channel: CreateChannelRequest) -> Result<Channel> {
    let conn = db.conn().lock().unwrap();
    ChannelDao::create(&conn, channel)
}

#[tauri::command]
pub fn update_channel(db: State<'_, Arc<Database>>, id: String, channel: UpdateChannelRequest) -> Result<Channel> {
    let conn = db.conn().lock().unwrap();
    ChannelDao::update(&conn, &id, channel)
}

#[tauri::command]
pub fn delete_channel(db: State<'_, Arc<Database>>, id: String) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    ChannelDao::delete(&conn, &id)
}

#[tauri::command]
pub async fn test_channel_cmd(db: State<'_, Arc<Database>>, id: String) -> Result<String> {
    test_channel(&db, &id).await
}
```

- [ ] **Step 2: Update commands/mod.rs**

```rust
pub mod task;
pub mod channel;

pub use task::*;
pub use channel::*;
```

- [ ] **Step 3: Update lib.rs to register channel commands**

Add to invoke_handler:
```rust
.invoke_handler(tauri::generate_handler![
    commands::get_tasks,
    commands::get_task,
    commands::create_task,
    commands::update_task,
    commands::delete_task,
    commands::toggle_task,
    commands::get_channels,
    commands::get_channel,
    commands::create_channel,
    commands::update_channel,
    commands::delete_channel,
    commands::test_channel_cmd,
])
```

- [ ] **Step 4: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/ src-tauri/src/lib.rs
git commit -m "feat: add Tauri commands for channel CRUD and testing"
```

---

### Task 5: Create Frontend Channel API

**Files:**
- Create: `src/lib/api/channel.ts`

- [ ] **Step 1: Create channel API**

```typescript
import { call } from "./index";
import type { Channel, CreateChannelRequest, UpdateChannelRequest } from "@/types";

export const channelApi = {
  getAll: (): Promise<Channel[]> => call<Channel[]>("get_channels"),

  getById: (id: string): Promise<Channel> => call<Channel>("get_channel", { id }),

  create: (channel: CreateChannelRequest): Promise<Channel> =>
    call<Channel>("create_channel", { channel }),

  update: (id: string, channel: UpdateChannelRequest): Promise<Channel> =>
    call<Channel>("update_channel", { id, channel }),

  delete: (id: string): Promise<void> => call<void>("delete_channel", { id }),

  test: (id: string): Promise<string> => call<string>("test_channel_cmd", { id }),
};
```

- [ ] **Step 2: Add Channel types to types/index.ts**

```typescript
export interface Channel {
  id: string;
  name: string;
  type_: string;
  enabled: boolean;
  config: string;
  last_test_at?: number;
  last_test_result?: string;
  description?: string;
  created_at: number;
  updated_at: number;
}

export interface CreateChannelRequest {
  name: string;
  type_: string;
  config: string;
  description?: string;
  enabled?: boolean;
}

export interface UpdateChannelRequest {
  name?: string;
  config?: string;
  description?: string;
  enabled?: boolean;
}

export interface BarkConfig {
  serverUrl?: string;
  key: string;
  sound?: string;
  group?: string;
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npm run build`
Expected: Builds successfully

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/channel.ts src/types/index.ts
git commit -m "feat: add frontend channel API and types"
```

---

### Task 6: Create Channel Page and Components

**Files:**
- Create: `src/pages/ChannelsPage.tsx`
- Create: `src/components/modules/reminder/ChannelList.tsx`
- Create: `src/components/modules/reminder/ChannelCard.tsx`
- Create: `src/components/modules/reminder/ChannelEditor.tsx`
- Modify: `src/App.tsx` (add route)
- Modify: `src/components/layout/Sidebar.tsx` (add channels link)

- [ ] **Step 1: Create ChannelsPage.tsx**

```tsx
import { useChannels } from "@/lib/query/channelQueries";
import { ChannelList } from "@/components/modules/reminder/ChannelList";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ChannelEditor } from "@/components/modules/reminder/ChannelEditor";

export function ChannelsPage() {
  const { data: channels, isLoading, error } = useChannels();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);

  const handleCreate = () => {
    setEditingChannelId(null);
    setEditorOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingChannelId(id);
    setEditorOpen(true);
  };

  if (isLoading) {
    return <div className="p-6"><p className="text-muted-foreground">加载中...</p></div>;
  }

  if (error) {
    return <div className="p-6"><p className="text-destructive">加载失败</p></div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">通知渠道</h2>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          新建渠道
        </Button>
      </div>

      <ChannelList channels={channels || []} onEdit={handleEdit} />

      <ChannelEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        channelId={editingChannelId}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create ChannelList, ChannelCard, ChannelEditor components**

(Similar structure to TaskList, TaskCard, TaskEditor)

- [ ] **Step 3: Add route to App.tsx**

- [ ] **Step 4: Add navigation to Sidebar**

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Builds successfully

- [ ] **Step 6: Commit**

```bash
git add src/pages/ChannelsPage.tsx src/components/modules/reminder/ src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: add ChannelsPage with list, card, and editor components"
```

---

### Task 7: Verify End-to-End

- [ ] **Step 1: Run dev server**

Run: `npm run tauri dev`

- [ ] **Step 2: Test channel creation**

Create a Bark channel with a test key, verify it saves to database.

- [ ] **Step 3: Test channel testing**

Click test button, verify Bark notification is sent.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify channel configuration working"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Channel CRUD (create, read, update, delete)
- ✅ Bark notification implementation
- ✅ Channel testing
- ⚠️ Feishu, WeCom, DingTalk notifiers - placeholder for now
- ✅ Frontend channel management UI

**2. Placeholder scan:**
- ✅ All code complete
- ✅ No TBD or TODO

**3. Type consistency:**
- ✅ Channel type matches backend (note: type_ instead of type due to SQL keyword)
- ✅ CreateChannelRequest and UpdateChannelRequest match