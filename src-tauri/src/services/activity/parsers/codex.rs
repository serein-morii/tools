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
            .map(|p| {
                p.join(".codex")
                    .join("sessions")
                    .to_string_lossy()
                    .to_string()
            })
            .unwrap_or_else(|| "~/.codex/sessions".to_string());
        Self {
            watch_dirs: vec![home],
        }
    }
}

#[async_trait]
impl ActivityParser for CodexParser {
    fn tool_id(&self) -> &str {
        "codex"
    }

    fn watch_dirs(&self) -> Vec<String> {
        self.watch_dirs.clone()
    }

    fn is_session_file(&self, path: &Path) -> bool {
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e == "jsonl" || e == "json")
            .unwrap_or(false)
    }

    async fn parse_session(&self, path: &Path) -> Result<ParsedSession, String> {
        let content = fs::read_to_string(path).map_err(|e| format!("Read error: {}", e))?;

        // CodeX stores sessions as JSONL; each line is {timestamp, type, payload}.
        let events = parse_lines(&content);
        if events.is_empty() {
            return Err("No messages found in CodeX session".to_string());
        }

        let now_ms = Utc::now().timestamp_millis();

        // Session id + cwd come from the session_meta line.
        let (session_id, cwd) = extract_meta(&events, path);
        let (project_name, project_path) = match cwd {
            Some(c) => {
                let name = Path::new(&c)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or(c.clone());
                (Some(name), Some(c))
            }
            None => (infer_project(path), None),
        };

        let title = extract_codex_title(&events);
        let activities = build_codex_activities(&session_id, &events, now_ms);
        let message_count = activities
            .iter()
            .filter(|a| a.activity_type == "message")
            .count() as i32;

        let (started_at, ended_at) = codex_time_range(&events, now_ms);
        let duration_secs = ended_at
            .map(|e| ((e - started_at) / 1000).max(0) as i32)
            .unwrap_or(0);

        let summary = serde_json::json!({
            "msg_count": message_count,
            "tools": activities.iter().filter_map(|a| a.tool_name.clone()).collect::<std::collections::BTreeSet<_>>().into_iter().collect::<Vec<_>>(),
        })
        .to_string();

        Ok(ParsedSession {
            id: session_id,
            tool_id: "codex".to_string(),
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
            raw_json: summary,
        })
    }
}

// ===== Internal event model =====

#[derive(Debug, Clone)]
struct CodexEvent {
    kind: EventKind,
    inner: String,         // the resolved item type (payload.type or outer type)
    role: Option<String>,  // for messages
    content: serde_json::Value, // message content (string or array)
    tool_name: Option<String>,
    tool_input: serde_json::Value, // function_call arguments
    tool_output: Option<String>, // function_call_output output
    ts: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
enum EventKind {
    SessionMeta,
    Message,
    FunctionCall,
    FunctionCallOutput,
    Reasoning,
    #[allow(dead_code)]
    Other,
}

fn parse_lines(content: &str) -> Vec<CodexEvent> {
    content
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
        .filter_map(parse_event)
        .collect()
}

fn parse_event(value: serde_json::Value) -> Option<CodexEvent> {
    let ts = value.get("timestamp").and_then(parse_ts);
    let outer_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let payload = value.get("payload").cloned().unwrap_or(serde_json::Value::Null);

    // CodeX nests the real item type inside payload.type (response_item/event_msg
    // wrappers). Fall back to the outer type when payload has none (e.g. session_meta).
    let inner_type = payload
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or(outer_type);

    match inner_type {
        "session_meta" => Some(CodexEvent {
            kind: EventKind::SessionMeta,
            inner: inner_type.to_string(),
            role: None,
            content: payload,
            tool_name: None,
            tool_input: serde_json::Value::Null,
            tool_output: None,
            ts,
        }),
        "user_message" => {
            let msg = payload.get("message").cloned().unwrap_or(serde_json::Value::Null);
            Some(CodexEvent {
                kind: EventKind::Message,
                inner: inner_type.to_string(),
                role: Some("user".to_string()),
                content: msg,
                tool_name: None,
                tool_input: serde_json::Value::Null,
                tool_output: None,
                ts,
            })
        }
        "agent_message" => {
            let msg = payload.get("message").cloned().unwrap_or(serde_json::Value::Null);
            Some(CodexEvent {
                kind: EventKind::Message,
                inner: inner_type.to_string(),
                role: Some("assistant".to_string()),
                content: msg,
                tool_name: None,
                tool_input: serde_json::Value::Null,
                tool_output: None,
                ts,
            })
        }
        "message" => {
            let role = payload.get("role").and_then(|v| v.as_str()).map(|s| s.to_string());
            let content = payload.get("content").cloned().unwrap_or(serde_json::Value::Null);
            Some(CodexEvent {
                kind: EventKind::Message,
                inner: inner_type.to_string(),
                role,
                content,
                tool_name: None,
                tool_input: serde_json::Value::Null,
                tool_output: None,
                ts,
            })
        }
        "function_call" => {
            let name = payload.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
            let args = payload.get("arguments").cloned().unwrap_or(serde_json::Value::Null);
            Some(CodexEvent {
                kind: EventKind::FunctionCall,
                inner: inner_type.to_string(),
                role: Some("assistant".to_string()),
                content: serde_json::Value::Null,
                tool_name: name,
                tool_input: args,
                tool_output: None,
                ts,
            })
        }
        "function_call_output" => {
            let output = payload.get("output").map(|v| {
                if let Some(s) = v.as_str() {
                    s.to_string()
                } else {
                    serde_json::to_string(v).unwrap_or_default()
                }
            });
            Some(CodexEvent {
                kind: EventKind::FunctionCallOutput,
                inner: inner_type.to_string(),
                role: Some("tool".to_string()),
                content: serde_json::Value::Null,
                tool_name: None,
                tool_input: serde_json::Value::Null,
                tool_output: output,
                ts,
            })
        }
        "reasoning" => {
            let text = payload
                .get("text")
                .or_else(|| payload.get("summary"))
                .and_then(|v| v.as_str())
                .map(|s| serde_json::Value::String(s.to_string()))
                .unwrap_or(serde_json::Value::Null);
            Some(CodexEvent {
                kind: EventKind::Reasoning,
                inner: inner_type.to_string(),
                role: Some("assistant".to_string()),
                content: text,
                tool_name: None,
                tool_input: serde_json::Value::Null,
                tool_output: None,
                ts,
            })
        }
        // token_count, turn_context, task_started, task_complete, output_text, etc.
        _ => None,
    }
}

fn extract_meta(events: &[CodexEvent], path: &Path) -> (String, Option<String>) {
    for e in events {
        if e.kind == EventKind::SessionMeta {
            let id = e
                .content
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let cwd = e
                .content
                .get("cwd")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            if let Some(id) = id {
                return (id, cwd);
            }
        }
    }
    (fallback_id("codex", path), None)
}

fn codex_time_range(events: &[CodexEvent], now_ms: i64) -> (i64, Option<i64>) {
    let times: Vec<i64> = events.iter().filter_map(|e| e.ts).collect();
    if times.is_empty() {
        return (now_ms, None);
    }
    let first = *times.first().unwrap();
    let last = times.last().copied();
    (first, last)
}

fn build_codex_activities(session_id: &str, events: &[CodexEvent], now_ms: i64) -> Vec<ParsedActivity> {
    // If streaming user_message/agent_message events exist, the "message" (response_item)
    // events are API echoes that duplicate them (and carry injected AGENTS.md/permissions).
    // Prefer the streaming events; fall back to "message" only when no streaming events exist.
    let has_stream_msgs = events.iter().any(|e| {
        e.kind == EventKind::Message && matches!(e.inner.as_str(), "user_message" | "agent_message")
    });

    let mut out = Vec::new();
    for e in events {
        let ts = e.ts.unwrap_or(now_ms);
        match e.kind {
            EventKind::SessionMeta | EventKind::Other => continue,
            EventKind::Message => {
                if has_stream_msgs && e.inner == "message" {
                    continue;
                }
                // Skip injected system/developer prompts (not real conversation turns).
                if matches!(e.role.as_deref(), Some("developer") | Some("system")) {
                    continue;
                }
                let role = e.role.clone().unwrap_or_else(|| "unknown".to_string());
                let text = codex_extract_text(&e.content);
                if text.trim().is_empty() {
                    continue;
                }
                out.push(ParsedActivity {
                    id: Uuid::new_v4().to_string(),
                    session_id: session_id.to_string(),
                    activity_type: "message".to_string(),
                    role: Some(role),
                    content_preview: truncate(&text, 500),
                    tool_name: None,
                    file_path: None,
                    lines_added: None,
                    lines_removed: None,
                    timestamp: ts,
                    metadata: "{}".to_string(),
                });
            }
            EventKind::Reasoning => {
                let text = codex_extract_text(&e.content);
                if text.trim().is_empty() {
                    continue;
                }
                out.push(ParsedActivity {
                    id: Uuid::new_v4().to_string(),
                    session_id: session_id.to_string(),
                    activity_type: "message".to_string(),
                    role: Some("assistant".to_string()),
                    content_preview: truncate(&format!("[思考] {text}"), 500),
                    tool_name: None,
                    file_path: None,
                    lines_added: None,
                    lines_removed: None,
                    timestamp: ts,
                    metadata: "{}".to_string(),
                });
            }
            EventKind::FunctionCall => {
                let name = e.tool_name.clone().unwrap_or_else(|| "unknown".to_string());
                let (file_path, summary) = summarize_codex_call(&name, &e.tool_input);
                out.push(ParsedActivity {
                    id: Uuid::new_v4().to_string(),
                    session_id: session_id.to_string(),
                    activity_type: "tool_call".to_string(),
                    role: Some("assistant".to_string()),
                    content_preview: summary,
                    tool_name: Some(name),
                    file_path,
                    lines_added: None,
                    lines_removed: None,
                    timestamp: ts,
                    metadata: e.tool_input.to_string(),
                });
            }
            EventKind::FunctionCallOutput => {
                let text = e.tool_output.clone().unwrap_or_default();
                if text.trim().is_empty() {
                    continue;
                }
                out.push(ParsedActivity {
                    id: Uuid::new_v4().to_string(),
                    session_id: session_id.to_string(),
                    activity_type: "tool_result".to_string(),
                    role: Some("tool".to_string()),
                    content_preview: truncate(&text, 500),
                    tool_name: None,
                    file_path: None,
                    lines_added: None,
                    lines_removed: None,
                    timestamp: ts,
                    metadata: "{}".to_string(),
                });
            }
        }
    }
    out
}

/// CodeX message content can be a string or an array of {type,text} blocks.
fn codex_extract_text(content: &serde_json::Value) -> String {
    match content {
        serde_json::Value::String(s) => s.to_string(),
        serde_json::Value::Array(items) => items
            .iter()
            .filter_map(|b| {
                b.get("text")
                    .or_else(|| b.get("content"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .collect::<Vec<_>>()
            .join("\n"),
        serde_json::Value::Object(map) => {
            map.get("text").and_then(|v| v.as_str()).unwrap_or_default().to_string()
        }
        _ => String::new(),
    }
}

fn summarize_codex_call(name: &str, args: &serde_json::Value) -> (Option<String>, String) {
    // CodeX function_call arguments are usually a JSON string (shell commands, patch, etc.).
    let arg_str = if let Some(s) = args.as_str() {
        s.to_string()
    } else {
        serde_json::to_string(args).unwrap_or_default()
    };

    // Heuristic file path detection for shell-driven calls.
    let file_path = extract_path_from_args(&arg_str);

    let summary = match name {
        "shell" | "local_shell" | "exec" => format!("[{name}] {}", truncate(&arg_str, 200)),
        "apply_patch" | "update_plan" => format!("[{name}] {}", truncate(&arg_str, 200)),
        _ => format!("[{name}] {}", truncate(&arg_str, 200)),
    };
    (file_path, summary)
}

fn extract_path_from_args(arg_str: &str) -> Option<String> {
    // Look for a quoted or trailing file path in a shell command.
    let trimmed = arg_str.trim();
    // Try double-quoted path
    if let Some(start) = trimmed.find('"') {
        if let Some(end) = trimmed[start + 1..].find('"') {
            let candidate = &trimmed[start + 1..start + 1 + end];
            if looks_like_path(candidate) {
                return Some(candidate.to_string());
            }
        }
    }
    // Try last token
    let last = trimmed.split_whitespace().last()?;
    if looks_like_path(last) {
        return Some(last.trim_matches(|c: char| !c.is_alphanumeric() && c != '/' && c != '\\' && c != ':' && c != '.' && c != '_' && c != '-').to_string());
    }
    None
}

fn looks_like_path(s: &str) -> bool {
    (s.contains('/') || s.contains('\\') || s.contains('.')) && s.len() < 512
}

fn extract_codex_title(events: &[CodexEvent]) -> String {
    // Prefer real user_message streaming events (the actual user prompt).
    for e in events {
        if e.kind == EventKind::Message && e.inner == "user_message" {
            let text = codex_extract_text(&e.content);
            if !text.trim().is_empty() {
                return preview_title(&text);
            }
        }
    }
    // Fallback: any user-role message.
    for e in events {
        if e.kind == EventKind::Message && e.role.as_deref() == Some("user") {
            let text = codex_extract_text(&e.content);
            if !text.trim().is_empty() {
                return preview_title(&text);
            }
        }
    }
    "Untitled".to_string()
}

fn preview_title(text: &str) -> String {
    let preview: String = text.chars().take(100).collect();
    if text.chars().count() > 100 {
        format!("{}...", preview)
    } else {
        preview
    }
}

fn infer_project(path: &Path) -> Option<String> {
    path.parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
}

fn truncate(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

fn parse_ts(value: &serde_json::Value) -> Option<i64> {
    if let Some(n) = value.as_i64() {
        return Some(if n > 1_000_000_000_000 { n } else { n * 1000 });
    }
    if let Some(n) = value.as_f64() {
        let n = n as i64;
        return Some(if n > 1_000_000_000_000 { n } else { n * 1000 });
    }
    let raw = value.as_str()?;
    chrono::DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                let p = e.path();
                if p.is_dir() {
                    walk(&p, out);
                } else {
                    out.push(p);
                }
            }
        }
    }

    #[tokio::test]
    #[ignore]
    async fn parse_real_codex_file() {
        let home = dirs::home_dir().expect("home dir");
        let root = home.join(".codex").join("sessions");
        let mut files = Vec::new();
        walk(&root, &mut files);
        let file = match files.into_iter().find(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl")) {
            Some(f) => f,
            None => {
                eprintln!("[codex test] no .jsonl file under {}, skipping", root.display());
                return;
            }
        };

        let parser = CodexParser::new();
        let session = parser.parse_session(&file).await.expect("parse should succeed");
        let nonempty = session
            .activities
            .iter()
            .filter(|a| a.role.is_some() && !a.content_preview.is_empty())
            .count();
        eprintln!(
            "[codex test] {} -> id={} title={:?} msgs={} activities={} nonempty={} started={}",
            file.file_name().unwrap().to_string_lossy(),
            session.id,
            session.title,
            session.message_count,
            session.activities.len(),
            nonempty,
            session.started_at
        );
        assert!(nonempty > 0, "CodeX parser produced only empty activities");
    }
}
