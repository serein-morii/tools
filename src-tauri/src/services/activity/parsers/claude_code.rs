use std::fs::File;
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
            .map(|p| p.join(".claude").join("projects").to_string_lossy().to_string())
            .unwrap_or_else(|| "~/.claude/projects".to_string());
        Self { watch_dirs: vec![home] }
    }
}

#[async_trait]
impl ActivityParser for ClaudeCodeParser {
    fn tool_id(&self) -> &str { "claude-code" }
    fn supports_hooks(&self) -> bool { true }
    fn watch_dirs(&self) -> Vec<String> { self.watch_dirs.clone() }

    fn is_session_file(&self, path: &Path) -> bool {
        path.extension().and_then(|e| e.to_str()).map(|e| e == "jsonl").unwrap_or(false)
    }

    async fn parse_session(&self, path: &Path) -> Result<ParsedSession, String> {
        let events = load_raw_events(path)?;
        if events.is_empty() {
            return Err("No messages in session".to_string());
        }

        let now_ms = Utc::now().timestamp_millis();
        let session_id = extract_session_id(path, &events);
        let title = extract_title(&events);
        let project_name = derive_project_name(path);
        let project_path = path.parent().and_then(|p| p.parent()).map(|p| p.to_string_lossy().to_string());

        let (started_at, ended_at) = time_range(&events, now_ms);
        let duration_secs = ended_at.map(|e| ((e - started_at) / 1000).max(0) as i32).unwrap_or(0);

        // message_count = number of real conversation turns (user text + assistant turns)
        let message_count = events.iter().filter(|e| e.is_message_turn()).count() as i32;

        let activities = build_activities(&session_id, &events, now_ms);

        let summary = serde_json::json!({
            "msg_count": message_count,
            "tools": activities.iter().filter_map(|a| a.tool_name.clone()).collect::<std::collections::BTreeSet<_>>().into_iter().collect::<Vec<_>>(),
            "file_count": activities.iter().filter(|a| a.file_path.is_some()).count(),
        }).to_string();

        Ok(ParsedSession {
            id: session_id,
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
            raw_json: summary,
        })
    }
}

// ===== Public API (used by frontend load_session_messages) =====

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClaudeMessage {
    pub role: String,
    pub content: String,
    pub ts: Option<i64>,
}

/// Load all messages from a Claude Code JSONL session file (frontend conversation view).
pub fn load_messages(path: &Path) -> Result<Vec<ClaudeMessage>, String> {
    let events = load_raw_events(path)?;
    Ok(events.iter().filter_map(|e| e.to_claude_message()).collect())
}

// ===== Internal: raw event model =====

#[derive(Debug, Clone)]
struct RawEvent {
    role: String,           // "user" | "assistant" | "tool"
    content: serde_json::Value, // message.content (string or array)
    ts: Option<i64>,
}

impl RawEvent {
    fn is_message_turn(&self) -> bool {
        // user text turns and assistant turns count as conversation rounds;
        // pure tool_result (role=="tool") does not.
        self.role != "tool"
    }

    fn to_claude_message(&self) -> Option<ClaudeMessage> {
        let text = extract_text(&self.content);
        if text.trim().is_empty() {
            return None;
        }
        Some(ClaudeMessage {
            role: self.role.clone(),
            content: text,
            ts: self.ts,
        })
    }
}

/// Read and normalize all message lines from a Claude Code JSONL file.
fn load_raw_events(path: &Path) -> Result<Vec<RawEvent>, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open: {e}"))?;
    let reader = BufReader::new(file);
    let mut events = Vec::new();

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Read error: {e}"))?;
        let value: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if value.get("isMeta").and_then(|v| v.as_bool()) == Some(true) {
            continue;
        }

        // Only real message lines carry a "message" field; skip attachments,
        // snapshots, mode/permission/summary metadata, etc.
        let message = match value.get("message") {
            Some(m) => m,
            None => continue,
        };

        let mut role = message.get("role").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();

        // Claude wraps tool_result inside user messages; reclassify as "tool".
        if role == "user" {
            if let Some(serde_json::Value::Array(items)) = message.get("content") {
                let all_tool_results = !items.is_empty()
                    && items.iter().all(|item| {
                        item.get("type").and_then(|v| v.as_str()) == Some("tool_result")
                    });
                if all_tool_results {
                    role = "tool".to_string();
                }
            }
        }

        let content = message.get("content").cloned().unwrap_or(serde_json::Value::Null);
        let ts = value.get("timestamp").and_then(parse_timestamp_to_ms);

        events.push(RawEvent { role, content, ts });
    }

    Ok(events)
}

fn extract_session_id(path: &Path, events: &[RawEvent]) -> String {
    // Claude Code JSONL embeds "sessionId" on every line and uses it as the filename.
    if let Some(id) = read_session_id_from_file(path) {
        return id;
    }
    let _ = events; // (events don't carry the id after normalization; file is authoritative)
    fallback_id("claude-code", path)
}

fn read_session_id_from_file(path: &Path) -> Option<String> {
    let file = File::open(path).ok()?;
    let reader = BufReader::new(file);
    for line in reader.lines().flatten() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
            if let Some(id) = v.get("sessionId").and_then(|v| v.as_str()) {
                return Some(id.to_string());
            }
        }
    }
    None
}

fn derive_project_name(path: &Path) -> Option<String> {
    // ~/.claude/projects/<encoded-project>/<session>.jsonl
    // The encoded dir name (e.g. "D--dev-project-java-temp-tools") decodes to the cwd.
    path.parent()
        .and_then(|p| p.file_name())
        .map(|n| decode_project_dir(&n.to_string_lossy()))
}

fn decode_project_dir(dir: &str) -> String {
    // Claude Code encodes cwd by replacing path separators and ':' with '-'.
    // e.g. "D--dev-project-java-temp-tools" -> "D:\dev\project\java\temp_tools"
    // We can't perfectly invert it, but turning '-' runs back into separators gives
    // a readable project tail. Keep the last segment for a clean project name.
    let decoded = dir.replace("--", ":/").replace('-', "/");
    decoded.rsplit('/').next().unwrap_or(dir).to_string()
}

fn time_range(events: &[RawEvent], now_ms: i64) -> (i64, Option<i64>) {
    let first = events.first().and_then(|e| e.ts).unwrap_or(now_ms);
    let last = events.last().and_then(|e| e.ts);
    (first, last)
}

// ===== Activity building (rich extraction per design §5.4) =====

fn build_activities(session_id: &str, events: &[RawEvent], now_ms: i64) -> Vec<ParsedActivity> {
    let mut out = Vec::new();
    for ev in events {
        let ts = ev.ts.unwrap_or(now_ms);
        match &ev.content {
            serde_json::Value::String(s) => {
                if !s.trim().is_empty() {
                    out.push(ParsedActivity {
                        id: Uuid::new_v4().to_string(),
                        session_id: session_id.to_string(),
                        activity_type: "message".to_string(),
                        role: Some(ev.role.clone()),
                        content_preview: truncate(s, 500),
                        tool_name: None,
                        file_path: None,
                        lines_added: None,
                        lines_removed: None,
                        timestamp: ts,
                        metadata: "{}".to_string(),
                    });
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    if let Some(act) = build_activity_from_block(session_id, &ev.role, item, ts) {
                        out.push(act);
                    }
                }
            }
            _ => {}
        }
    }
    out
}

fn build_activity_from_block(
    session_id: &str,
    role: &str,
    item: &serde_json::Value,
    ts: i64,
) -> Option<ParsedActivity> {
    let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match item_type {
        "text" => {
            let text = item.get("text").and_then(|v| v.as_str()).unwrap_or("");
            if text.trim().is_empty() {
                return None;
            }
            Some(activity(session_id, "message", Some(role.to_string()), text, None, None, ts))
        }
        "thinking" => {
            // Don't drop thinking turns; record them so assistant activity isn't empty.
            let text = item.get("thinking").and_then(|v| v.as_str()).unwrap_or("");
            if text.trim().is_empty() {
                return None;
            }
            Some(activity(session_id, "message", Some("assistant".to_string()), &format!("[思考] {}", text), None, None, ts))
        }
        "tool_use" => {
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
            let input = item.get("input").cloned().unwrap_or(serde_json::Value::Null);
            let (file_path, summary) = summarize_tool_use(&name, &input);
            Some(ParsedActivity {
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
                metadata: input.to_string(),
            })
        }
        "tool_result" => {
            // tool_result lives in a user message; surface as a tool activity.
            let text = extract_text(item.get("content").unwrap_or(&serde_json::Value::Null));
            if text.trim().is_empty() {
                return None;
            }
            Some(activity(session_id, "tool_result", Some("tool".to_string()), &text, None, None, ts))
        }
        _ => {
            // Unknown block: best-effort text extraction so nothing is silently lost.
            let text = extract_text(item);
            if text.trim().is_empty() {
                return None;
            }
            Some(activity(session_id, "message", Some(role.to_string()), &text, None, None, ts))
        }
    }
}

fn activity(
    session_id: &str,
    activity_type: &str,
    role: Option<String>,
    content: &str,
    tool_name: Option<String>,
    file_path: Option<String>,
    ts: i64,
) -> ParsedActivity {
    ParsedActivity {
        id: Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        activity_type: activity_type.to_string(),
        role,
        content_preview: truncate(content, 500),
        tool_name,
        file_path,
        lines_added: None,
        lines_removed: None,
        timestamp: ts,
        metadata: "{}".to_string(),
    }
}

/// Extract file_path + a short summary from a tool_use input block.
fn summarize_tool_use(name: &str, input: &serde_json::Value) -> (Option<String>, String) {
    let pick_str = |keys: &[&str]| -> Option<String> {
        keys.iter()
            .find_map(|k| input.get(*k).and_then(|v| v.as_str()).map(|s| s.to_string()))
    };

    let file_path = match name {
        "Read" | "Write" | "Edit" | "MultiEdit" | "NotebookEdit" => pick_str(&["file_path", "notebook_path", "path"]),
        "Grep" | "Glob" => pick_str(&["path", "file"]),
        _ => pick_str(&["file_path", "path", "file"]),
    };

    let summary = match name {
        "Bash" => {
            let cmd = input.get("command").and_then(|v| v.as_str()).unwrap_or("");
            format!("[Bash] {}", truncate(cmd, 200))
        }
        "Edit" | "MultiEdit" => {
            let fp = file_path.clone().unwrap_or_default();
            format!("[{name}] {fp}")
        }
        "Write" => {
            let fp = file_path.clone().unwrap_or_default();
            format!("[Write] {fp}")
        }
        "Read" => {
            let fp = file_path.clone().unwrap_or_default();
            format!("[Read] {fp}")
        }
        _ => {
            let compact = serde_json::to_string(input).unwrap_or_default();
            truncate(&compact, 200)
        }
    };
    (file_path, summary)
}

fn truncate(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

fn extract_title(events: &[RawEvent]) -> String {
    for e in events {
        if e.role == "user" {
            let text = extract_text(&e.content);
            if text.trim().is_empty() {
                continue;
            }
            let preview: String = text.chars().take(80).collect();
            return if text.chars().count() > 80 { format!("{preview}...") } else { preview };
        }
    }
    "Untitled".to_string()
}

// ===== Utility functions =====

fn parse_timestamp_to_ms(value: &serde_json::Value) -> Option<i64> {
    if let Some(n) = value.as_i64() {
        return Some(if n > 1_000_000_000_000 { n } else { n * 1000 });
    }
    if let Some(n) = value.as_f64() {
        let n = n as i64;
        return Some(if n > 1_000_000_000_000 { n } else { n * 1000 });
    }
    // RFC3339 string
    let raw = value.as_str()?;
    chrono::DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

fn extract_text(content: &serde_json::Value) -> String {
    match content {
        serde_json::Value::String(text) => text.to_string(),
        serde_json::Value::Array(items) => items.iter()
            .filter_map(extract_text_from_item)
            .filter(|t| !t.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        serde_json::Value::Object(map) => {
            map.get("text").and_then(|v| v.as_str()).unwrap_or_default().to_string()
        }
        _ => String::new(),
    }
}

fn extract_text_from_item(item: &serde_json::Value) -> Option<String> {
    let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");

    if item_type == "tool_use" {
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
        return Some(format!("[调用工具: {name}]"));
    }

    if item_type == "tool_result" {
        if let Some(content) = item.get("content") {
            let text = extract_text(content);
            if !text.is_empty() { return Some(text); }
        }
        return None;
    }

    if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
        return Some(text.to_string());
    }
    if let Some(text) = item.get("thinking").and_then(|v| v.as_str()) {
        return Some(format!("[思考] {text}"));
    }
    if let Some(text) = item.get("input_text").and_then(|v| v.as_str()) {
        return Some(text.to_string());
    }
    if let Some(text) = item.get("output_text").and_then(|v| v.as_str()) {
        return Some(text.to_string());
    }
    if let Some(content) = item.get("content") {
        let text = extract_text(content);
        if !text.is_empty() { return Some(text); }
    }

    None
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
    async fn parse_real_claude_file() {
        let home = dirs::home_dir().expect("home dir");
        let root = home.join(".claude").join("projects");
        let mut files = Vec::new();
        walk(&root, &mut files);
        let file = match files.into_iter().find(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl")) {
            Some(f) => f,
            None => {
                eprintln!("[claude test] no .jsonl under {}, skipping", root.display());
                return;
            }
        };

        let parser = ClaudeCodeParser::new();
        let session = parser.parse_session(&file).await.expect("parse should succeed");
        let tool_calls = session.activities.iter().filter(|a| a.activity_type == "tool_call").count();
        let nonempty = session
            .activities
            .iter()
            .filter(|a| a.role.is_some() && !a.content_preview.is_empty())
            .count();
        eprintln!(
            "[claude test] {} -> id={} title={:?} msgs={} activities={} tool_calls={} nonempty={}",
            file.file_name().unwrap().to_string_lossy(),
            session.id,
            session.title,
            session.message_count,
            session.activities.len(),
            tool_calls,
            nonempty
        );
        assert!(!session.id.contains(':'), "session id should be the real sessionId, not a fallback");
        assert!(nonempty > 0, "claude parser produced only empty activities");
    }
}
