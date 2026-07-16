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

    #[allow(dead_code)]
    pub fn with_dirs(tool_id: &str, dirs: Vec<String>) -> Self {
        Self {
            tool_id: tool_id.to_string(),
            watch_dirs: dirs,
        }
    }
}

#[async_trait]
impl ActivityParser for GenericParser {
    fn tool_id(&self) -> &str {
        &self.tool_id
    }

    fn watch_dirs(&self) -> Vec<String> {
        self.watch_dirs.clone()
    }

    fn is_session_file(&self, path: &Path) -> bool {
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| matches!(e, "json" | "jsonl" | "log" | "txt"))
            .unwrap_or(false)
    }

    async fn parse_session(&self, path: &Path) -> Result<ParsedSession, String> {
        let content = fs::read_to_string(path).map_err(|e| format!("Read error: {}", e))?;
        let now_ms = Utc::now().timestamp_millis();

        let messages = try_parse_any_messages(&content);

        let title = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string());

        let project_name = path
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string());

        Ok(ParsedSession {
            id: Uuid::new_v4().to_string(),
            tool_id: self.tool_id.clone(),
            title,
            project_name: project_name.clone(),
            project_path: project_name,
            message_count: messages.len() as i32,
            duration_secs: 0,
            started_at: now_ms,
            ended_at: None,
            source: "watch".to_string(),
            raw_path: Some(path.to_string_lossy().to_string()),
            activities: messages
                .iter()
                .enumerate()
                .map(|(i, m)| ParsedActivity {
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
                })
                .collect(),
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
            let lines: Vec<serde_json::Value> = content
                .lines()
                .filter(|l| !l.trim().is_empty())
                .filter_map(|l| serde_json::from_str(l).ok())
                .collect();
            let roles = extract_roles_from_array(&lines);
            if !roles.is_empty() {
                return roles;
            }

            // Plain text fallback
            return vec![RawMessage {
                role: "note".to_string(),
                preview: content.chars().take(500).collect(),
            }];
        }
    };

    extract_roles_from_value(&json_value)
}

fn extract_roles_from_value(value: &serde_json::Value) -> Vec<RawMessage> {
    let candidates = ["messages", "conversation", "history", "data", "sessions"];
    for key in candidates {
        if let Some(arr) = value.get(key).and_then(|v| v.as_array()) {
            let roles = extract_roles_from_array(arr);
            if !roles.is_empty() {
                return roles;
            }
        }
    }

    if let Some(arr) = value.as_array() {
        return extract_roles_from_array(arr);
    }

    vec![]
}

fn extract_roles_from_array(arr: &[serde_json::Value]) -> Vec<RawMessage> {
    arr.iter()
        .filter_map(|item| {
            let role = item
                .get("role")
                .or_else(|| item.get("type"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            let preview = item
                .get("content")
                .and_then(|c| {
                    if let Some(s) = c.as_str() {
                        Some(s.to_string())
                    } else if let Some(arr) = c.as_array() {
                        Some(
                            arr.iter()
                                .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                                .collect::<Vec<_>>()
                                .join("\n"),
                        )
                    } else {
                        None
                    }
                })
                .unwrap_or_default();

            let truncated: String = preview.chars().take(500).collect();
            Some(RawMessage {
                role,
                preview: truncated,
            })
        })
        .collect()
}
