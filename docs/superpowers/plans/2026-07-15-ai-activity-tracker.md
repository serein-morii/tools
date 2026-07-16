# AI Activity Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI activity tracking module to Dev Tools Tauri app — monitor Claude Code/CodeX/Gemini CLI/Qwen CLI sessions, generate daily/weekly/monthly reports with AI summarization.

**Architecture:** New Tauri module with independent background collector thread (HTTP hook listener + file watchers), pluggable parsers per AI tool, SQLite storage, report generator calling local AI CLI/API for summaries.

**Tech Stack:** Rust (Tauri v2), React 19 + TypeScript, SQLite, tokio, notify crate, tiny_http, reqwest

## Global Constraints

- Follow existing module patterns (organizer, dts, ai_coverage)
- Reuse existing: SQLite connection, tokio scheduler, i18n system, settings table, RSA encryption for API keys
- No new npm dependencies unless absolutely necessary
- Support zh/en/ja/ko 4 languages
- All timestamps use BIGINT (milliseconds) matching existing convention

---

### Task 1: Database Schema + DAO Layer

**Files:**
- Modify: `src-tauri/src/database/schema.rs`
- Create: `src-tauri/src/database/dao/activity.rs`
- Modify: `src-tauri/src/database/dao/mod.rs`

**Interfaces:**
- Produces: `ActivityDao` with CRUD methods for `ai_tools`, `ai_sessions`, `ai_activities`, `ai_reports` tables

- [ ] **Step 1: Add schema tables to init_schema()**

In `schema.rs`, inside `init_schema()`'s `execute_batch`, add after existing CREATE TABLE statements but before the INSERT OR IGNORE settings block:

```sql
-- AI Tools registry
CREATE TABLE IF NOT EXISTS ai_tools (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    watch_paths     TEXT NOT NULL DEFAULT '[]',
    parser_type     TEXT NOT NULL,
    config          TEXT DEFAULT '{}',
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
    metadata        TEXT DEFAULT '{}',
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
    metadata        TEXT DEFAULT '{}',
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
    stats           TEXT DEFAULT '{}',
    session_ids     TEXT DEFAULT '[]',
    summary_method  TEXT,
    summary_tool    TEXT,
    generated_at    BIGINT,
    created_at      BIGINT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_sessions_tool ON ai_sessions(tool_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_time ON ai_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_project ON ai_sessions(project_name);
CREATE INDEX IF NOT EXISTS idx_ai_activities_session ON ai_activities(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_activities_type ON ai_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_ai_reports_type_time ON ai_reports(report_type, range_start);
```

And add default tool registrations:
```sql
INSERT OR IGNORE INTO ai_tools (id, name, enabled, watch_paths, parser_type, config, created_at, updated_at)
VALUES
  ('claude-code', 'Claude Code', 1, '["~/.claude/projects/"]', 'claude_code', '{"has_hooks":true}', {now}, {now}),
  ('codex', 'CodeX', 1, '["~/.codex/sessions/"]', 'codex', '{"has_hooks":false}', {now}, {now}),
  ('gemini-cli', 'Gemini CLI', 1, '["~/.gemini/"]', 'generic_json', '{"has_hooks":false}', {now}, {now}),
  ('qwen-cli', 'Qwen CLI', 1, '["~/.qwen/"]', 'generic_json', '{"has_hooks":false}', {now}, {now});
```

Replace `{now}` with Rust's current timestamp at runtime.

- [ ] **Step 2: Create DAO file**

Create `src-tauri/src/database/dao/activity.rs`:

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::error::{AppError, Result};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiTool {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub watch_paths: String,   // JSON array
    pub parser_type: String,
    pub config: String,        // JSON
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiSession {
    pub id: String,
    pub tool_id: String,
    pub project_name: Option<String>,
    pub project_path: Option<String>,
    pub title: Option<String>,
    pub message_count: i32,
    pub duration_secs: i32,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub source: String,
    pub raw_path: Option<String>,
    pub summary: Option<String>,
    pub tags: String,
    pub metadata: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiActivity {
    pub id: String,
    pub session_id: String,
    pub activity_type: String,
    pub role: Option<String>,
    pub content_preview: Option<String>,
    pub tool_name: Option<String>,
    pub file_path: Option<String>,
    pub lines_added: Option<i32>,
    pub lines_removed: Option<i32>,
    pub timestamp: i64,
    pub metadata: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiReport {
    pub id: String,
    pub report_type: String,
    pub title: String,
    pub range_start: i64,
    pub range_end: i64,
    pub content: Option<String>,
    pub stats: String,
    pub session_ids: String,
    pub summary_method: Option<String>,
    pub summary_tool: Option<String>,
    pub generated_at: Option<i64>,
    pub created_at: i64,
}

pub struct ActivityDao;

impl ActivityDao {
    // ===== AiTool CRUD =====
    
    pub fn get_all_tools(conn: &Connection) -> Result<Vec<AiTool>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, enabled, watch_paths, parser_type, config, created_at, updated_at FROM ai_tools ORDER BY name"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(AiTool {
                id: row.get(0)?,
                name: row.get(1)?,
                enabled: row.get::<_, i32>(2)? != 0,
                watch_paths: row.get(3)?,
                parser_type: row.get(4)?,
                config: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(|e| AppError::Database(e.to_string()))
    }
    
    pub fn get_enabled_tools(conn: &Connection) -> Result<Vec<AiTool>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, enabled, watch_paths, parser_type, config, created_at, updated_at FROM ai_tools WHERE enabled = 1 ORDER BY name"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(AiTool {
                id: row.get(0)?,
                name: row.get(1)?,
                enabled: true,
                watch_paths: row.get(2)?,
                parser_type: row.get(3)?,
                config: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(|e| AppError::Database(e.to_string()))
    }
    
    pub fn update_tool(conn: &Connection, id: &str, enabled: bool, watch_paths: &str, config: &str) -> Result<()> {
        conn.execute(
            "UPDATE ai_tools SET enabled = ?, watch_paths = ?, config = ?, updated_at = ? WHERE id = ?",
            rusqlite::params![enabled as i32, watch_paths, config, chrono::Utc::now().timestamp_millis(), id],
        )?;
        Ok(())
    }

    // ===== AiSession CRUD =====
    
    pub fn insert_session(conn: &Connection, session: &AiSession) -> Result<()> {
        conn.execute(
            "INSERT INTO ai_sessions (id, tool_id, project_name, project_path, title, message_count, duration_secs, started_at, ended_at, source, raw_path, summary, tags, metadata, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                session.id, session.tool_id, session.project_name, session.project_path,
                session.title, session.message_count, session.duration_secs,
                session.started_at, session.ended_at, session.source, session.raw_path,
                session.summary, session.tags, session.metadata, session.created_at,
            ],
        )?;
        Ok(())
    }
    
    pub fn session_exists(conn: &Connection, id: &str) -> Result<bool> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM ai_sessions WHERE id = ?",
            [id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }
    
    pub fn get_sessions(conn: &Connection, tool_id: Option<&str>, project_name: Option<&str>, start: i64, end: i64, limit: i64, offset: i64) -> Result<Vec<AiSession>> {
        let mut sql = String::from(
            "SELECT id, tool_id, project_name, project_path, title, message_count, duration_secs, started_at, ended_at, source, raw_path, summary, tags, metadata, created_at FROM ai_sessions WHERE started_at >= ? AND started_at <= ?"
        );
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(start), Box::new(end)];
        
        if let Some(tid) = tool_id {
            sql.push_str(" AND tool_id = ?");
            params.push(Box::new(tid.to_string()));
        }
        if let Some(pn) = project_name {
            sql.push_str(" AND project_name = ?");
            params.push(Box::new(pn.to_string()));
        }
        
        sql.push_str(" ORDER BY started_at DESC LIMIT ? OFFSET ?");
        params.push(Box::new(limit));
        params.push(Box::new(offset));
        
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), |row| {
            Ok(AiSession {
                id: row.get(0)?,
                tool_id: row.get(1)?,
                project_name: row.get(2)?,
                project_path: row.get(3)?,
                title: row.get(4)?,
                message_count: row.get(5)?,
                duration_secs: row.get(6)?,
                started_at: row.get(7)?,
                ended_at: row.get(8)?,
                source: row.get(9)?,
                raw_path: row.get(10)?,
                summary: row.get(11)?,
                tags: row.get(12)?,
                metadata: row.get(13)?,
                created_at: row.get(14)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(|e| AppError::Database(e.to_string()))
    }
    
    pub fn update_session_ended(conn: &Connection, id: &str, ended_at: i64, message_count: i32, duration_secs: i32) -> Result<()> {
        conn.execute(
            "UPDATE ai_sessions SET ended_at = ?, message_count = ?, duration_secs = ? WHERE id = ?",
            rusqlite::params![ended_at, message_count, duration_secs, id],
        )?;
        Ok(())
    }
    
    pub fn update_session_summary(conn: &Connection, id: &str, summary: &str) -> Result<()> {
        conn.execute("UPDATE ai_sessions SET summary = ? WHERE id = ?", rusqlite::params![summary, id])?;
        Ok(())
    }
    
    // ===== AiActivity CRUD =====
    
    pub fn insert_activity(conn: &Connection, activity: &AiActivity) -> Result<()> {
        conn.execute(
            "INSERT INTO ai_activities (id, session_id, activity_type, role, content_preview, tool_name, file_path, lines_added, lines_removed, timestamp, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                activity.id, activity.session_id, activity.activity_type, activity.role,
                activity.content_preview, activity.tool_name, activity.file_path,
                activity.lines_added, activity.lines_removed, activity.timestamp, activity.metadata,
            ],
        )?;
        Ok(())
    }
    
    pub fn get_activities_for_session(conn: &Connection, session_id: &str) -> Result<Vec<AiActivity>> {
        let mut stmt = conn.prepare(
            "SELECT id, session_id, activity_type, role, content_preview, tool_name, file_path, lines_added, lines_removed, timestamp, metadata FROM ai_activities WHERE session_id = ? ORDER BY timestamp"
        )?;
        let rows = stmt.query_map([session_id], |row| {
            Ok(AiActivity {
                id: row.get(0)?,
                session_id: row.get(1)?,
                activity_type: row.get(2)?,
                role: row.get(3)?,
                content_preview: row.get(4)?,
                tool_name: row.get(5)?,
                file_path: row.get(6)?,
                lines_added: row.get(7)?,
                lines_removed: row.get(8)?,
                timestamp: row.get(9)?,
                metadata: row.get(10)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(|e| AppError::Database(e.to_string()))
    }
    
    // ===== AiReport CRUD =====
    
    pub fn insert_report(conn: &Connection, report: &AiReport) -> Result<()> {
        conn.execute(
            "INSERT INTO ai_reports (id, report_type, title, range_start, range_end, content, stats, session_ids, summary_method, summary_tool, generated_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                report.id, report.report_type, report.title, report.range_start, report.range_end,
                report.content, report.stats, report.session_ids, report.summary_method,
                report.summary_tool, report.generated_at, report.created_at,
            ],
        )?;
        Ok(())
    }
    
    pub fn get_reports(conn: &Connection, report_type: Option<&str>, limit: i64) -> Result<Vec<AiReport>> {
        let mut sql = String::from(
            "SELECT id, report_type, title, range_start, range_end, content, stats, session_ids, summary_method, summary_tool, generated_at, created_at FROM ai_reports"
        );
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        
        if let Some(rt) = report_type {
            sql.push_str(" WHERE report_type = ?");
            params.push(Box::new(rt.to_string()));
        }
        sql.push_str(" ORDER BY range_start DESC LIMIT ?");
        params.push(Box::new(limit));
        
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), |row| {
            Ok(AiReport {
                id: row.get(0)?,
                report_type: row.get(1)?,
                title: row.get(2)?,
                range_start: row.get(3)?,
                range_end: row.get(4)?,
                content: row.get(5)?,
                stats: row.get(6)?,
                session_ids: row.get(7)?,
                summary_method: row.get(8)?,
                summary_tool: row.get(9)?,
                generated_at: row.get(10)?,
                created_at: row.get(11)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(|e| AppError::Database(e.to_string()))
    }
    
    pub fn delete_report(conn: &Connection, id: &str) -> Result<()> {
        conn.execute("DELETE FROM ai_reports WHERE id = ?", [id])?;
        Ok(())
    }
}
```

- [ ] **Step 3: Register DAO module**

In `src-tauri/src/database/dao/mod.rs`, add:
```rust
pub mod activity;
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/database/
git commit -m "feat: add AI activity tracker database schema and DAO"
```

---

### Task 2: Parser Trait + Claude Code Parser

**Files:**
- Create: `src-tauri/src/services/activity/mod.rs`
- Create: `src-tauri/src/services/activity/parsers/mod.rs`
- Create: `src-tauri/src/services/activity/parsers/claude_code.rs`

**Interfaces:**
- Produces: `ActivityParser` trait, `ParsedSession`, `ParsedActivity`, `ClaudeCodeParser`

- [ ] **Step 1: Create module structure**

Create `src-tauri/src/services/activity/mod.rs`:
```rust
pub mod parsers;
pub mod collector;
pub mod summarizer;
pub mod reporter;
```

Create `src-tauri/src/services/activity/parsers/mod.rs`:
```rust
pub mod claude_code;
pub mod codex;
pub mod generic;

use std::path::Path;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedActivity {
    pub id: String,
    pub activity_type: String,   // "message" | "tool_call" | "file_change"
    pub role: Option<String>,     // "user" | "assistant" | "tool"
    pub content_preview: String,
    pub tool_name: Option<String>,
    pub file_path: Option<String>,
    pub lines_added: Option<i32>,
    pub lines_removed: Option<i32>,
    pub timestamp: i64,
    pub metadata: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedSession {
    pub id: String,
    pub tool_id: String,
    pub title: String,
    pub project_name: Option<String>,
    pub project_path: Option<String>,
    pub message_count: i32,
    pub duration_secs: i32,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub source: String,
    pub raw_path: Option<String>,
    pub activities: Vec<ParsedActivity>,
    pub raw_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookPayload {
    pub tool: String,
    pub event: String,
    pub session_id: Option<String>,
    pub timestamp: Option<i64>,
    pub data: Option<serde_json::Value>,
}

#[async_trait]
pub trait ActivityParser: Send + Sync {
    fn tool_id(&self) -> &str;
    
    async fn parse_session(&self, path: &Path) -> Result<ParsedSession, String>;
    
    async fn parse_hook_event(&self, _payload: &HookPayload) -> Result<Option<ParsedSession>, String> {
        Ok(None) // default: hooks not supported
    }
    
    fn is_session_file(&self, path: &Path) -> bool;
    
    fn supports_hooks(&self) -> bool { false }
    
    fn watch_dirs(&self) -> Vec<String>;
}
```

- [ ] **Step 2: Implement Claude Code parser**

Create `src-tauri/src/services/activity/parsers/claude_code.rs`:
```rust
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use async_trait::async_trait;
use chrono::Utc;
use uuid::Uuid;
use super::*;

pub struct ClaudeCodeParser {
    watch_dirs: Vec<String>,
}

impl ClaudeCodeParser {
    pub fn new() -> Self {
        let home = dirs::home_dir()
            .map(|p| p.join(".claude").join("projects"))
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "~/.claude/projects".to_string());
        
        Self {
            watch_dirs: vec![home],
        }
    }
}

#[async_trait]
impl ActivityParser for ClaudeCodeParser {
    fn tool_id(&self) -> &str { "claude-code" }
    
    fn supports_hooks(&self) -> bool { true }
    
    fn watch_dirs(&self) -> Vec<String> { self.watch_dirs.clone() }
    
    fn is_session_file(&self, path: &Path) -> bool {
        path.extension()
            .map(|e| e == "jsonl")
            .unwrap_or(false)
    }
    
    async fn parse_session(&self, path: &Path) -> Result<ParsedSession, String> {
        let file = fs::File::open(path).map_err(|e| format!("Cannot open file: {}", e))?;
        let reader = BufReader::new(file);
        let mut messages: Vec<serde_json::Value> = Vec::new();
        
        for line in reader.lines() {
            let line = line.map_err(|e| format!("Read error: {}", e))?;
            if line.trim().is_empty() { continue; }
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                messages.push(value);
            }
        }
        
        if messages.is_empty() {
            return Err("Empty session file".to_string());
        }
        
        let now_ms = Utc::now().timestamp_millis();
        let first_msg = &messages[0];
        let last_msg = &messages[messages.len() - 1];
        
        // Extract title from first user message
        let title = extract_first_user_text(&messages).unwrap_or_else(|| "Untitled".to_string());
        
        // Extract project info from path
        let project_name = path.parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string());
        
        let project_path = path.parent()
            .and_then(|p| p.parent())
            .map(|p| p.to_string_lossy().to_string());
        
        // Count messages
        let message_count = messages.len() as i32;
        
        // Parse activities
        let activities = parse_activities(&messages);
        
        // Extract timestamps
        let started_at = first_msg.get("timestamp")
            .and_then(|v| v.as_i64())
            .unwrap_or(now_ms);
        let ended_at = last_msg.get("timestamp")
            .and_then(|v| v.as_i64());
        
        let duration_secs = ended_at.map(|e| ((e - started_at) / 1000) as i32).unwrap_or(0);
        
        Ok(ParsedSession {
            id: Uuid::new_v4().to_string(),
            tool_id: "claude-code".to_string(),
            title,
            project_name,
            project_path,
            message_count,
            duration_secs,
            started_at,
            ended_at,
            source: "watch".to_string(),
            raw_path: Some(path.to_string_lossy().to_string()),
            activities,
            raw_json: serde_json::to_string(&messages).unwrap_or_default(),
        })
    }
    
    async fn parse_hook_event(&self, payload: &HookPayload) -> Result<Option<ParsedSession>, String> {
        // Claude Code hooks: PostToolUse, SessionStart, SessionStop
        match payload.event.as_str() {
            "SessionStart" => {
                // Could create a new session record here
                Ok(None) // Defer to file-based parsing for full detail
            }
            _ => Ok(None),
        }
    }
}

fn extract_first_user_text(messages: &[serde_json::Value]) -> Option<String> {
    for msg in messages {
        if msg.get("role").and_then(|r| r.as_str()) == Some("user") {
            if let Some(content) = msg.get("content") {
                if let Some(text) = content.as_array().and_then(|arr| arr.first()).and_then(|c| c.get("text")).and_then(|t| t.as_str()) {
                    let preview: String = text.chars().take(100).collect();
                    return Some(if text.len() > 100 { format!("{}...", preview) } else { preview });
                }
            }
        }
    }
    None
}

fn parse_activities(messages: &[serde_json::Value]) -> Vec<ParsedActivity> {
    let mut activities = Vec::new();
    
    for msg in messages {
        let timestamp = msg.get("timestamp")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        
        let role = msg.get("role").and_then(|r| r.as_str()).map(|s| s.to_string());
        
        // User/assistant messages
        if role.as_deref() == Some("user") || role.as_deref() == Some("assistant") {
            let content_preview = msg.get("content")
                .and_then(|c| {
                    if let Some(arr) = c.as_array() {
                        arr.iter()
                            .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
                            .collect::<Vec<_>>()
                            .join(" ")
                    } else if let Some(s) = c.as_str() {
                        s.to_string()
                    } else {
                        None
                    }
                })
                .unwrap_or_default();
            
            let preview: String = content_preview.chars().take(500).collect();
            
            activities.push(ParsedActivity {
                id: Uuid::new_v4().to_string(),
                session_id: String::new(), // filled by caller
                activity_type: "message".to_string(),
                role,
                content_preview: preview,
                tool_name: None,
                file_path: None,
                lines_added: None,
                lines_removed: None,
                timestamp,
                metadata: "{}".to_string(),
            });
        }
        
        // Tool use blocks (inside assistant messages)
        if let Some(content) = msg.get("content").and_then(|c| c.as_array()) {
            for block in content {
                if block.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                    let tool_name = block.get("name").and_then(|n| n.as_str()).map(|s| s.to_string());
                    let tool_input = block.get("input")
                        .map(|i| i.to_string())
                        .unwrap_or_default();
                    
                    // Detect file-related tool calls
                    let (file_path, lines_added, lines_removed) = detect_file_change(tool_name.as_deref(), &tool_input);
                    
                    let preview: String = tool_input.chars().take(500).collect();
                    
                    activities.push(ParsedActivity {
                        id: Uuid::new_v4().to_string(),
                        session_id: String::new(),
                        activity_type: "tool_call".to_string(),
                        role: Some("tool".to_string()),
                        content_preview: preview,
                        tool_name,
                        file_path,
                        lines_added,
                        lines_removed,
                        timestamp,
                        metadata: "{}".to_string(),
                    });
                }
            }
        }
    }
    
    activities
}

fn detect_file_change(tool_name: Option<&str>, input: &str) -> (Option<String>, Option<i32>, Option<i32>) {
    let file_path = match tool_name {
        Some("read") | Some("write_to_file") | Some("replace_in_file") => {
            serde_json::from_str::<serde_json::Value>(input)
                .ok()
                .and_then(|v| v.get("filePath").or_else(|| v.get("file_path")))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        }
        _ => None,
    };
    
    let lines_added = match tool_name {
        Some("write_to_file") => serde_json::from_str::<serde_json::Value>(input)
            .ok()
            .and_then(|v| v.get("content").and_then(|c| c.as_str()))
            .map(|c| c.lines().count() as i32),
        _ => None,
    };
    
    (file_path, lines_added, None)
}
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/services/
git commit -m "feat: add parser trait and Claude Code parser"
```

---

### Task 3: CodeX + Generic Parsers

**Files:**
- Create: `src-tauri/src/services/activity/parsers/codex.rs`
- Create: `src-tauri/src/services/activity/parsers/generic.rs`

- [ ] **Step 1: CodeX parser**

Create `src-tauri/src/services/activity/parsers/codex.rs`:
```rust
use std::fs;
use std::path::Path;
use async_trait::async_trait;
use chrono::Utc;
use uuid::Uuid;
use super::*;

pub struct CodexParser {
    watch_dirs: Vec<String>,
}

impl CodexParser {
    pub fn new() -> Self {
        let home = dirs::home_dir()
            .map(|p| p.join(".codex").join("sessions"))
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "~/.codex/sessions".to_string());
        Self { watch_dirs: vec![home] }
    }
}

#[async_trait]
impl ActivityParser for CodexParser {
    fn tool_id(&self) -> &str { "codex" }
    fn watch_dirs(&self) -> Vec<String> { self.watch_dirs.clone() }
    fn is_session_file(&self, path: &Path) -> bool {
        path.extension().map(|e| e == "json" || e == "jsonl").unwrap_or(false)
    }
    
    async fn parse_session(&self, path: &Path) -> Result<ParsedSession, String> {
        let content = fs::read_to_string(path).map_err(|e| format!("Read error: {}", e))?;
        let messages: Vec<serde_json::Value> = if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
            content.lines()
                .filter(|l| !l.trim().is_empty())
                .filter_map(|l| serde_json::from_str(l).ok())
                .collect()
        } else {
            serde_json::from_str(&content)
                .map(|v: serde_json::Value| {
                    v.get("messages").or_else(|| v.get("conversation"))
                        .and_then(|m| m.as_array())
                        .cloned()
                        .unwrap_or_default()
                })
                .unwrap_or_default()
        };
        
        if messages.is_empty() {
            return Err("No messages found".to_string());
        }
        
        let now_ms = Utc::now().timestamp_millis();
        let title = extract_codex_title(&messages);
        let message_count = messages.len() as i32;
        let project_name = infer_project_from_path(path);
        let activities = parse_codex_activities(&messages);
        
        Ok(ParsedSession {
            id: Uuid::new_v4().to_string(),
            tool_id: "codex".to_string(),
            title,
            project_name: project_name.clone(),
            project_path: project_name,
            message_count,
            duration_secs: 0,
            started_at: now_ms,
            ended_at: None,
            source: "watch".to_string(),
            raw_path: Some(path.to_string_lossy().to_string()),
            activities,
            raw_json: serde_json::to_string(&messages).unwrap_or_default(),
        })
    }
}

fn extract_codex_title(messages: &[serde_json::Value]) -> String {
    for msg in messages {
        if msg.get("role").and_then(|r| r.as_str()) == Some("user") {
            if let Some(content) = msg.get("content").and_then(|c| c.as_str()) {
                let preview: String = content.chars().take(100).collect();
                return if content.len() > 100 { format!("{}...", preview) } else { preview };
            }
        }
    }
    "Untitled".to_string()
}

fn infer_project_from_path(path: &Path) -> Option<String> {
    path.parent().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().to_string())
}

fn parse_codex_activities(messages: &[serde_json::Value]) -> Vec<ParsedActivity> {
    messages.iter().map(|msg| {
        let role = msg.get("role").and_then(|r| r.as_str()).map(|s| s.to_string());
        let content_preview = msg.get("content")
            .and_then(|c| c.as_str())
            .map(|s| s.chars().take(500).collect())
            .unwrap_or_default();
        
        ParsedActivity {
            id: Uuid::new_v4().to_string(),
            session_id: String::new(),
            activity_type: "message".to_string(),
            role,
            content_preview,
            tool_name: None,
            file_path: None,
            lines_added: None,
            lines_removed: None,
            timestamp: Utc::now().timestamp_millis(),
            metadata: "{}".to_string(),
        }
    }).collect()
}
```

- [ ] **Step 2: Generic parser**

Create `src-tauri/src/services/activity/parsers/generic.rs`:
```rust
use std::fs;
use std::path::Path;
use async_trait::async_trait;
use chrono::Utc;
use uuid::Uuid;
use super::*;

pub struct GenericParser {
    tool_id: String,
    watch_dirs: Vec<String>,
}

impl GenericParser {
    pub fn new(tool_id: &str, watch_dir: &str) -> Self {
        Self {
            tool_id: tool_id.to_string(),
            watch_dirs: vec![watch_dir.to_string()],
        }
    }
}

#[async_trait]
impl ActivityParser for GenericParser {
    fn tool_id(&self) -> &str { &self.tool_id }
    fn watch_dirs(&self) -> Vec<String> { self.watch_dirs.clone() }
    
    fn is_session_file(&self, path: &Path) -> bool {
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        matches!(ext, "json" | "jsonl" | "log" | "txt")
    }
    
    async fn parse_session(&self, path: &Path) -> Result<ParsedSession, String> {
        let content = fs::read_to_string(path).map_err(|e| format!("Read error: {}", e))?;
        let now_ms = Utc::now().timestamp_millis();
        
        // Try to find any recognizable message structure
        let messages = try_parse_any_messages(&content);
        
        let title = path.file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string());
        
        Ok(ParsedSession {
            id: Uuid::new_v4().to_string(),
            tool_id: self.tool_id.clone(),
            title,
            project_name: None,
            project_path: None,
            message_count: messages.len() as i32,
            duration_secs: 0,
            started_at: now_ms,
            ended_at: None,
            source: "watch".to_string(),
            raw_path: Some(path.to_string_lossy().to_string()),
            activities: messages.iter().enumerate().map(|(i, m)| {
                ParsedActivity {
                    id: Uuid::new_v4().to_string(),
                    session_id: String::new(),
                    activity_type: "message".to_string(),
                    role: Some(m.role.clone()),
                    content_preview: m.preview.clone(),
                    tool_name: None,
                    file_path: None,
                    lines_added: None,
                    lines_removed: None,
                    timestamp: now_ms + i as i64,
                    metadata: "{}".to_string(),
                }
            }).collect(),
            raw_json: content,
        })
    }
}

struct RawMessage {
    role: String,
    preview: String,
}

fn try_parse_any_messages(content: &str) -> Vec<RawMessage> {
    let json_value: serde_json::Value = match serde_json::from_str(content) {
        Ok(v) => v,
        Err(_) => {
            // Try JSONL
            let lines: Vec<serde_json::Value> = content.lines()
                .filter(|l| !l.trim().is_empty())
                .filter_map(|l| serde_json::from_str(l).ok())
                .collect();
            let roles = extract_roles_from_array(&lines);
            if !roles.is_empty() { return roles; }
            
            // Plain text - create as single entry
            return vec![RawMessage {
                role: "note".to_string(),
                preview: content.chars().take(500).collect(),
            }];
        }
    };
    
    extract_roles_from_value(&json_value)
}

fn extract_roles_from_value(value: &serde_json::Value) -> Vec<RawMessage> {
    let candidates = vec!["messages", "conversation", "history", "data", "sessions"];
    for key in candidates {
        if let Some(arr) = value.get(key).and_then(|v| v.as_array()) {
            let roles = extract_roles_from_array(arr);
            if !roles.is_empty() { return roles; }
        }
    }
    
    // If value itself is an array, try extracting from each element
    if let Some(arr) = value.as_array() {
        return extract_roles_from_array(arr);
    }
    
    vec![]
}

fn extract_roles_from_array(arr: &[serde_json::Value]) -> Vec<RawMessage> {
    arr.iter().filter_map(|item| {
        let role = item.get("role").or_else(|| item.get("type"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let preview = item.get("content")
            .and_then(|c| {
                if let Some(s) = c.as_str() { Some(s.to_string()) }
                else if let Some(arr) = c.as_array() {
                    arr.iter()
                        .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                        .collect::<Vec<_>>()
                        .join(" ")
                        .into()
                } else { None }
            })
            .unwrap_or_default();
        
        let truncated: String = preview.chars().take(500).collect();
        Some(RawMessage { role, preview: truncated })
    }).collect()
}
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/services/activity/parsers/codex.rs src-tauri/src/services/activity/parsers/generic.rs
git commit -m "feat: add CodeX and generic parsers"
```

---

### Task 4: Collector (File Watcher + Hook Listener)

**Files:**
- Create: `src-tauri/src/services/activity/collector.rs`

**Interfaces:**
- Consumes: `ActivityDao`, `ActivityParser` trait
- Produces: `ActivityCollector` with `start()`, `sync_now()`, `get_status()`

- [ ] **Step 1: Implement collector**

Create `src-tauri/src/services/activity/collector.rs`:
```rust
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use notify::{Event, RecursiveMode, Watcher, Config};
use tokio::sync::{mpsc, Mutex, RwLock};
use uuid::Uuid;

use crate::database::Database;
use crate::database::dao::activity::{ActivityDao, AiSession, AiActivity};

use super::parsers::{ActivityParser, ParsedSession};

pub struct CollectorState {
    pub running: bool,
    pub sessions_parsed: u64,
    pub last_sync: Option<i64>,
    pub errors: Vec<String>,
}

pub struct ActivityCollector {
    db: Arc<Database>,
    parsers: HashMap<String, Box<dyn ActivityParser>>,
    state: Arc<RwLock<CollectorState>>,
}

impl ActivityCollector {
    pub fn new(db: Arc<Database>, parsers: HashMap<String, Box<dyn ActivityParser>>) -> Self {
        Self {
            db,
            parsers,
            state: Arc::new(RwLock::new(CollectorState {
                running: false,
                sessions_parsed: 0,
                last_sync: None,
                errors: Vec::new(),
            })),
        }
    }
    
    pub async fn start(self: Arc<Self>) {
        {
            let mut state = self.state.write().await;
            state.running = true;
        }
        
        let self_clone = self.clone();
        tokio::spawn(async move {
            self_clone.full_scan().await;
        });
        
        // Periodic full scan every 30 minutes
        let self_clone = self.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(1800));
            loop {
                interval.tick().await;
                self_clone.full_scan().await;
            }
        });
        
        // Start file watchers for each tool
        let self_clone = self.clone();
        tokio::spawn(async move {
            self_clone.start_file_watchers().await;
        });
        
        // Start HTTP hook listener
        let self_clone = self.clone();
        tokio::spawn(async move {
            if let Err(e) = self_clone.start_hook_listener().await {
                let mut state = self_clone.state.write().await;
                state.errors.push(format!("Hook listener error: {}", e));
            }
        });
    }
    
    pub async fn full_scan(&self) {
        log::info!("[ActivityCollector] Starting full scan...");
        
        let conn = self.db.conn().lock().unwrap();
        let tools = match ActivityDao::get_enabled_tools(&conn) {
            Ok(t) => t,
            Err(e) => {
                log::error!("[ActivityCollector] Failed to get tools: {}", e);
                return;
            }
        };
        drop(conn);
        
        let mut parsed = 0u64;
        for tool in &tools {
            if let Some(parser) = self.parsers.get(&tool.id) {
                for watch_dir in parser.watch_dirs() {
                    let dir = expand_path(&watch_dir);
                    if let Err(e) = self.scan_directory(&dir, parser.as_ref()).await {
                        let mut state = self.state.write().await;
                        state.errors.push(format!("Scan {}: {}", dir, e));
                    } else {
                        parsed += 1;
                    }
                }
            }
        }
        
        let mut state = self.state.write().await;
        state.sessions_parsed += parsed;
        state.last_sync = Some(Utc::now().timestamp_millis());
        log::info!("[ActivityCollector] Full scan complete. Parsed {} new sessions", parsed);
    }
    
    async fn scan_directory(&self, dir: &str, parser: &dyn ActivityParser) -> Result<(), String> {
        let path = PathBuf::from(dir);
        if !path.exists() {
            return Ok(()); // Directory doesn't exist yet, skip
        }
        
        let entries = std::fs::read_dir(&path)
            .map_err(|e| format!("Cannot read dir {}: {}", dir, e))?;
        
        for entry in entries {
            let entry = entry.map_err(|e| format!("Entry error: {}", e))?;
            let file_path = entry.path();
            
            if file_path.is_file() && parser.is_session_file(&file_path) {
                match parser.parse_session(&file_path).await {
                    Ok(mut session) => {
                        let conn = self.db.conn().lock().unwrap();
                        if !ActivityDao::session_exists(&conn, &session.id).unwrap_or(false) {
                            // Save session
                            let db_session = AiSession {
                                id: session.id.clone(),
                                tool_id: session.tool_id.clone(),
                                project_name: session.project_name.clone(),
                                project_path: session.project_path.clone(),
                                title: Some(session.title.clone()),
                                message_count: session.message_count,
                                duration_secs: session.duration_secs,
                                started_at: session.started_at,
                                ended_at: session.ended_at,
                                source: session.source.clone(),
                                raw_path: session.raw_path.clone(),
                                summary: None,
                                tags: "[]".to_string(),
                                metadata: session.raw_json.clone(),
                                created_at: Utc::now().timestamp_millis(),
                            };
                            
                            if let Err(e) = ActivityDao::insert_session(&conn, &db_session) {
                                log::error!("[ActivityCollector] Failed to insert session: {}", e);
                            } else {
                                // Save activities
                                for activity in &mut session.activities {
                                    activity.session_id = session.id.clone();
                                    let db_activity = AiActivity {
                                        id: activity.id.clone(),
                                        session_id: activity.session_id.clone(),
                                        activity_type: activity.activity_type.clone(),
                                        role: activity.role.clone(),
                                        content_preview: Some(activity.content_preview.clone()),
                                        tool_name: activity.tool_name.clone(),
                                        file_path: activity.file_path.clone(),
                                        lines_added: activity.lines_added,
                                        lines_removed: activity.lines_removed,
                                        timestamp: activity.timestamp,
                                        metadata: activity.metadata.clone(),
                                    };
                                    if let Err(e) = ActivityDao::insert_activity(&conn, &db_activity) {
                                        log::error!("[ActivityCollector] Failed to insert activity: {}", e);
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("[ActivityCollector] Parse error for {}: {}", file_path.display(), e);
                    }
                }
            } else if file_path.is_dir() {
                // Recurse into subdirectories (projects)
                let sub_dir = file_path.to_string_lossy().to_string();
                Box::pin(self.scan_directory(&sub_dir, parser)).await?;
            }
        }
        
        Ok(())
    }
    
    async fn start_file_watchers(&self) {
        for (tool_id, parser) in &self.parsers {
            for watch_dir in parser.watch_dirs() {
                let dir = expand_path(&watch_dir);
                if !PathBuf::from(&dir).exists() {
                    continue;
                }
                
                let db = self.db.clone();
                let tool_id = tool_id.clone();
                let watch_dir_clone = dir.clone();
                
                // Use a simple polling approach instead of notify (more reliable cross-platform)
                tokio::spawn(async move {
                    let mut interval = tokio::time::interval(Duration::from_secs(30));
                    let mut seen_files: HashMap<String, u64> = HashMap::new();
                    
                    loop {
                        interval.tick().await;
                        if let Ok(entries) = std::fs::read_dir(&watch_dir_clone) {
                            for entry in entries.flatten() {
                                let path = entry.path();
                                if let Ok(meta) = entry.metadata() {
                                    let mtime = meta.modified()
                                        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs())
                                        .unwrap_or(0);
                                    let key = path.to_string_lossy().to_string();
                                    
                                    if seen_files.get(&key) != Some(&mtime) {
                                        seen_files.insert(key, mtime);
                                        // Trigger re-scan for this file
                                        log::debug!("[ActivityCollector] Change detected: {}", path.display());
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }
    }
    
    async fn start_hook_listener(&self) -> ! {
        // Simple HTTP server for receiving AI tool hook callbacks
        // Uses std::net::TcpListener for minimal dependencies
        let listener = std::net::TcpListener::bind("127.0.0.1:19820")
            .expect("[ActivityCollector] Failed to bind hook listener on 127.0.0.1:19820");
        
        log::info!("[ActivityCollector] Hook listener started on 127.0.0.1:19820");
        
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let db = self.db.clone();
                    let parsers: HashMap<String, Box<dyn ActivityParser>> = HashMap::new(); // simplified
                    tokio::spawn(async move {
                        // Parse HTTP request, extract JSON body
                        // For MVP: accept POST /hook/activity with JSON
                        let _ = stream; // placeholder
                    });
                }
                Err(e) => {
                    log::error!("[ActivityCollector] Hook connection error: {}", e);
                }
            }
        }
        
        unreachable!("Hook listener loop ended");
    }    
    pub async fn get_state(&self) -> CollectorState {
        self.state.read().await.clone()
    }
}

fn expand_path(path: &str) -> String {
    if path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(&path[2..]).to_string_lossy().to_string();
        }
    }
    path.to_string()
}
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/services/activity/collector.rs
git commit -m "feat: add activity collector with file watching and hook listener"
```

---

### Task 5: Reporter + Summarizer

**Files:**
- Create: `src-tauri/src/services/activity/reporter.rs`
- Create: `src-tauri/src/services/activity/summarizer.rs`

- [ ] **Step 1: Reporter**

Create `src-tauri/src/services/activity/reporter.rs`:
```rust
use std::sync::Arc;
use chrono::{Utc, NaiveDate, NaiveDateTime, Datelike, Timelike, Weekday};
use serde_json::json;
use uuid::Uuid;

use crate::database::Database;
use crate::database::dao::activity::{ActivityDao, AiReport, AiSession};

pub struct Reporter {
    db: Arc<Database>,
}

impl Reporter {
    pub fn new(db: Arc<Database>) -> Self { Self { db } }
    
    pub fn build_stats(&self, sessions: &[AiSession]) -> serde_json::Value {
        let total_sessions = sessions.len();
        let total_messages: i64 = sessions.iter().map(|s| s.message_count as i64).sum();
        let total_duration: i64 = sessions.iter().map(|s| s.duration_secs as i64).sum();
        
        // Tool distribution
        let mut tool_counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
        for s in sessions {
            *tool_counts.entry(s.tool_id.clone()).or_default() += 1;
        }
        
        // Project distribution
        let mut project_counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
        for s in sessions {
            if let Some(ref name) = s.project_name {
                *project_counts.entry(name.clone()).or_default() += 1;
            }
        }
        
        json!({
            "total_sessions": total_sessions,
            "total_messages": total_messages,
            "total_duration_secs": total_duration,
            "total_duration_formatted": format_duration(total_duration),
            "tool_distribution": tool_counts,
            "project_distribution": project_counts,
            "session_ids": sessions.iter().map(|s| s.id.clone()).collect::<Vec<_>>(),
        })
    }
    
    pub fn build_report_prompt(
        &self, 
        report_type: &str, 
        range_start: i64, 
        range_end: i64, 
        stats: &serde_json::Value,
        sessions: &[AiSession],
        language: &str,
    ) -> String {
        let date_range = format_date_range(range_start, range_end);
        let session_list: String = sessions.iter()
            .map(|s| format!("- [{}] {} ({} 轮, {} 分钟)", 
                s.tool_id, 
                s.title.as_deref().unwrap_or("Untitled"),
                s.message_count,
                s.duration_secs / 60))
            .collect::<Vec<_>>()
            .join("\n");
        
        let lang_instruction = match language {
            "zh" => "输出语言：中文",
            "en" => "Output language: English",
            "ja" => "出力言語：日本語",
            "ko" => "출력 언어: 한국어",
            _ => "输出语言：中文",
        };
        
        format!(r#"你是一个专业的工作总结助手。请根据以下数据生成{report_type}。

## 时间范围
{date_range}

## 整体数据
- AI 工具使用总时长：{total_duration}
- 总会话数：{total_sessions}
- 总对话轮次：{total_messages}

## 各工具使用分布
{tool_distribution}

## 会话列表
{session_list}

## 要求
1. 生成一份结构化的{report_type}
2. 突出关键产出
3. 标注 AI 辅助完成的工作
4. 输出格式为 Markdown
5. {lang_instruction}
"#,
            report_type = report_label(report_type),
            date_range = date_range,
            total_duration = stats.get("total_duration_formatted").and_then(|v| v.as_str()).unwrap_or("0"),
            total_sessions = stats.get("total_sessions").unwrap_or(&json!(0)),
            total_messages = stats.get("total_messages").unwrap_or(&json!(0)),
            tool_distribution = serde_json::to_string_pretty(stats.get("tool_distribution").unwrap_or(&json!({}))).unwrap_or_default(),
            session_list = session_list,
            lang_instruction = lang_instruction,
        )
    }
    
    pub fn save_report(
        &self, 
        report_type: &str, 
        range_start: i64, 
        range_end: i64, 
        content: &str,
        stats: &serde_json::Value, 
        summary_method: &str,
        summary_tool: &str,
    ) -> Result<AiReport, String> {
        let conn = self.db.conn().lock().unwrap();
        let report = AiReport {
            id: Uuid::new_v4().to_string(),
            report_type: report_type.to_string(),
            title: format!("{} ({})", report_label(report_type), format_date_range(range_start, range_end)),
            range_start,
            range_end,
            content: Some(content.to_string()),
            stats: stats.to_string(),
            session_ids: stats.get("session_ids").map(|v| v.to_string()).unwrap_or_default(),
            summary_method: Some(summary_method.to_string()),
            summary_tool: Some(summary_tool.to_string()),
            generated_at: Some(Utc::now().timestamp_millis()),
            created_at: Utc::now().timestamp_millis(),
        };
        
        ActivityDao::insert_report(&conn, &report).map_err(|e| e.to_string())?;
        Ok(report)
    }
}

fn report_label(report_type: &str) -> &str {
    match report_type {
        "daily" => "日报",
        "weekly" => "周报",
        "monthly" => "月报",
        _ => report_type,
    }
}

fn format_duration(secs: i64) -> String {
    let hours = secs / 3600;
    let mins = (secs % 3600) / 60;
    format!("{}h {}m", hours, mins)
}

fn format_date_range(start: i64, end: i64) -> String {
    let start_dt = NaiveDateTime::from_timestamp_opt(start / 1000, ((start % 1000) * 1_000_000) as u32)
        .unwrap_or_default();
    let end_dt = NaiveDateTime::from_timestamp_opt(end / 1000, ((end % 1000) * 1_000_000) as u32)
        .unwrap_or_default();
    format!("{} - {}", start_dt.format("%Y-%m-%d"), end_dt.format("%Y-%m-%d"))
}
```

- [ ] **Step 2: Summarizer**

Create `src-tauri/src/services/activity/summarizer.rs`:
```rust
use std::time::Duration;
use tokio::process::Command;

pub enum SummaryMethod {
    Cli { command: String },
    Api { provider: String, api_key: String, model: String },
    Manual,
}

pub struct Summarizer;

impl Summarizer {
    pub async fn summarize(prompt: &str, method: &SummaryMethod) -> Result<String, String> {
        match method {
            SummaryMethod::Cli { command } => {
                Self::summarize_via_cli(command, prompt).await
            }
            SummaryMethod::Api { provider, api_key, model } => {
                Self::summarize_via_api(provider, api_key, model, prompt).await
            }
            SummaryMethod::Manual => {
                Ok(format!("[MANUAL_PROMPT]{}", prompt))
            }
        }
    }
    
    async fn summarize_via_cli(command: &str, prompt: &str) -> Result<String, String> {
        let result = tokio::time::timeout(
            Duration::from_secs(120),
            async {
                let output = Command::new("sh")
                    .arg("-c")
                    .arg(format!("{} {}", command, shell_escape(prompt)))
                    .output()
                    .await
                    .map_err(|e| format!("CLI execution error: {}", e))?;
                
                if output.status.success() {
                    Ok(String::from_utf8_lossy(&output.stdout).to_string())
                } else {
                    Err(format!("CLI error: {}", String::from_utf8_lossy(&output.stderr)))
                }
            }
        ).await;
        
        match result {
            Ok(Ok(text)) => Ok(text),
            Ok(Err(e)) => Err(e),
            Err(_) => Err("CLI timeout after 120s".to_string()),
        }
    }
    
    async fn summarize_via_api(provider: &str, api_key: &str, model: &str, prompt: &str) -> Result<String, String> {
        let client = reqwest::Client::new();
        
        match provider {
            "anthropic" => {
                let resp = client.post("https://api.anthropic.com/v1/messages")
                    .header("x-api-key", api_key)
                    .header("anthropic-version", "2023-06-01")
                    .json(&serde_json::json!({
                        "model": model,
                        "max_tokens": 4096,
                        "messages": [{"role": "user", "content": prompt}]
                    }))
                    .send()
                    .await
                    .map_err(|e| format!("API error: {}", e))?;
                
                let body: serde_json::Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
                body.get("content").and_then(|c| c.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|b| b.get("text"))
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string())
                    .ok_or_else(|| "Unexpected API response format".to_string())
            }
            "openai" => {
                let resp = client.post("https://api.openai.com/v1/chat/completions")
                    .header("Authorization", format!("Bearer {}", api_key))
                    .json(&serde_json::json!({
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}]
                    }))
                    .send()
                    .await
                    .map_err(|e| format!("API error: {}", e))?;
                
                let body: serde_json::Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
                body.get("choices").and_then(|c| c.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|c| c.get("message"))
                    .and_then(|m| m.get("content"))
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string())
                    .ok_or_else(|| "Unexpected API response format".to_string())
            }
            _ => Err(format!("Unsupported provider: {}", provider)),
        }
    }
}

fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/services/activity/reporter.rs src-tauri/src/services/activity/summarizer.rs
git commit -m "feat: add reporter and AI summarizer"
```

---

### Task 6: Tauri Commands

**Files:**
- Create: `src-tauri/src/commands/activity_tracker.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Commands implementation** (complete commands file will be created with all needed Tauri commands for the frontend)

- [ ] **Step 2: Register in mod.rs and lib.rs**

- [ ] **Step 3: Commit**

---

### Task 7: Frontend API Layer + Pages

**Files:**
- Create: `src/lib/api/activity.ts`
- Create: `src/pages/ActivityTrackerPage.tsx`
- Create: `src/components/modules/activity/Dashboard.tsx`
- Create: `src/components/modules/activity/SessionList.tsx`
- Create: `src/components/modules/activity/ReportViewer.tsx`
- Create: `src/components/modules/activity/ToolSettings.tsx`
- Modify: `src/config/modules.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: API layer**
- [ ] **Step 2: Page components**
- [ ] **Step 3: Route registration**
- [ ] **Step 4: Commit**

---

### Task 8: i18n + Integration

**Files:**
- Modify: `src/i18n/locales/zh.json`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/ja.json`
- Modify: `src/i18n/locales/ko.json`
- Modify: `src-tauri/src/lib.rs` (tray + startup)

- [ ] **Step 1: Add i18n keys**
- [ ] **Step 2: Wire up collector startup in lib.rs**
- [ ] **Step 3: Commit**
