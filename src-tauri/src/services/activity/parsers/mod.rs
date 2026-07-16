pub mod claude_code;
pub mod codex;
pub mod generic;

use std::path::Path;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// Build a deterministic fallback session id when a tool doesn't embed one.
/// Uses the tool id + file stem so the same file always maps to the same row
/// (enables upsert instead of duplicate inserts).
pub fn fallback_id(tool_id: &str, path: &Path) -> String {
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    format!("{tool_id}:{stem}")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedActivity {
    pub id: String,
    pub session_id: String,
    pub activity_type: String,
    pub role: Option<String>,
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

    async fn parse_hook_event(
        &self,
        _payload: &HookPayload,
    ) -> Result<Option<ParsedSession>, String> {
        Ok(None)
    }

    fn is_session_file(&self, path: &Path) -> bool;

    fn supports_hooks(&self) -> bool {
        false
    }

    fn watch_dirs(&self) -> Vec<String>;
}
