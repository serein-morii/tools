use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::Utc;
use notify::Watcher;
use serde::Serialize;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::database::dao::activity::{ActivityDao, AiActivity, AiSession};
use crate::database::Database;

use super::parsers::{ActivityParser, HookPayload};

#[derive(Clone, Serialize)]
pub struct CollectorState {
    pub running: bool,
    pub sessions_parsed: u64,
    pub last_sync: Option<i64>,
    pub errors: Vec<String>,
    pub hook_status: String,
}

pub struct ActivityCollector {
    db: Arc<Database>,
    parsers: HashMap<String, Box<dyn ActivityParser>>,
    state: Arc<RwLock<CollectorState>>,
    /// raw_path -> last seen mtime (secs). Skip re-parse when unchanged.
    mtime_cache: Arc<Mutex<HashMap<String, u64>>>,
}

impl ActivityCollector {
    pub fn new(
        db: Arc<Database>,
        parsers: HashMap<String, Box<dyn ActivityParser>>,
    ) -> Self {
        Self {
            db,
            parsers,
            state: Arc::new(RwLock::new(CollectorState {
                running: false,
                sessions_parsed: 0,
                last_sync: None,
                errors: Vec::new(),
                hook_status: "not started".to_string(),
            })),
            mtime_cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start(self: Arc<Self>) {
        {
            let mut state = self.state.write().await;
            state.running = true;
        }

        log::info!("[ActivityCollector] Starting activity collector...");

        // Initial full scan
        let self_clone = self.clone();
        tokio::spawn(async move {
            self_clone.full_scan().await;
        });

        // Periodic full scan every 30 minutes (safety net for missed notify events)
        let self_clone = self.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(1800));
            interval.tick().await; // skip the immediate first tick
            loop {
                interval.tick().await;
                self_clone.full_scan().await;
            }
        });

        // File watchers (notify-based, near real-time)
        let self_clone = self.clone();
        tokio::spawn(async move {
            self_clone.start_watchers().await;
        });

        // HTTP hook listener (real-time event ingestion)
        let self_clone = self.clone();
        tokio::spawn(async move {
            let state_handle = self_clone.clone();
            if let Err(e) = self_clone.start_hook_listener().await {
                let mut state = state_handle.state.write().await;
                state.errors.push(format!("Hook listener error: {}", e));
                state.hook_status = format!("error: {}", e);
            }
        });

        log::info!("[ActivityCollector] Collector started successfully");
    }

    pub async fn sync_now(&self) -> CollectorState {
        self.full_scan().await;
        self.get_state().await
    }

    /// Wipe all sessions + activities and re-import from scratch with the
    /// (fixed) parsers. Used by the "rebuild data" button.
    pub async fn reset_and_rescan(&self) -> CollectorState {
        {
            let conn = self.db.conn().lock().unwrap();
            if let Err(e) = ActivityDao::delete_all_activity_data(&conn) {
                log::error!("[ActivityCollector] reset failed: {}", e);
            }
        }
        self.mtime_cache.lock().unwrap().clear();
        self.full_scan().await;
        self.get_state().await
    }

    pub async fn get_state(&self) -> CollectorState {
        let state = self.state.read().await;
        state.clone()
    }

    // ===== Internal =====

    async fn full_scan(&self) {
        log::info!("[ActivityCollector] Starting full scan...");

        let tools = {
            let conn = self.db.conn().lock().unwrap();
            ActivityDao::get_enabled_tools(&conn).unwrap_or_default()
        };

        // Build (tool_id, watch_dirs) list from DB tools; fall back to all parsers.
        let scan_list: Vec<(String, Vec<String>)> = if tools.is_empty() {
            self.parsers
                .iter()
                .map(|(id, p)| (id.clone(), p.watch_dirs()))
                .collect()
        } else {
            tools
                .iter()
                .filter_map(|t| {
                    self.parsers
                        .get(&t.id)
                        .map(|p| (t.id.clone(), p.watch_dirs()))
                })
                .collect()
        };

        let mut parsed = 0u64;

        for (tool_id, watch_dirs) in &scan_list {
            let Some(parser) = self.parsers.get(tool_id) else {
                continue;
            };
            for watch_dir in watch_dirs {
                let dir = expand_path(watch_dir);
                let mut files = Vec::new();
                collect_session_files(PathBuf::from(&dir), parser.as_ref(), &mut files);

                for file in files {
                    let key = file.to_string_lossy().to_string();
                    let mtime = file_mtime(&file);

                    // Skip unchanged files (mtime cache).
                    let skip = {
                        let cache = self.mtime_cache.lock().unwrap();
                        matches!((mtime, cache.get(&key)), (Some(m), Some(c)) if m == *c)
                    };
                    if skip {
                        continue;
                    }

                    if self.parse_and_upsert(parser.as_ref(), &file).await {
                        parsed += 1;
                    }
                    if let Some(m) = mtime {
                        self.mtime_cache.lock().unwrap().insert(key, m);
                    }
                }
            }
        }

        let mut state = self.state.write().await;
        state.sessions_parsed = parsed;
        state.last_sync = Some(Utc::now().timestamp_millis());
        log::info!(
            "[ActivityCollector] Full scan complete. Upserted {} sessions.",
            parsed
        );
    }

    /// Parse one file and upsert its session + activities.
    async fn parse_and_upsert(&self, parser: &dyn ActivityParser, path: &Path) -> bool {
        let session = match parser.parse_session(path).await {
            Ok(s) => s,
            Err(e) => {
                log::warn!(
                    "[ActivityCollector] Parse error for {}: {}",
                    path.display(),
                    e
                );
                return false;
            }
        };

        let conn = self.db.conn().lock().unwrap();
        let created_at = Utc::now().timestamp_millis();

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
            created_at,
        };

        if let Err(e) = ActivityDao::upsert_session(&conn, &db_session) {
            log::error!("[ActivityCollector] upsert session {}: {}", session.id, e);
            return false;
        }

        let activities: Vec<AiActivity> = session
            .activities
            .iter()
            .map(|a| AiActivity {
                id: a.id.clone(),
                session_id: session.id.clone(),
                activity_type: a.activity_type.clone(),
                role: a.role.clone(),
                content_preview: Some(a.content_preview.clone()),
                tool_name: a.tool_name.clone(),
                file_path: a.file_path.clone(),
                lines_added: a.lines_added,
                lines_removed: a.lines_removed,
                timestamp: a.timestamp,
                metadata: a.metadata.clone(),
            })
            .collect();

        if let Err(e) = ActivityDao::replace_activities(&conn, &session.id, &activities) {
            log::error!(
                "[ActivityCollector] replace activities {}: {}",
                session.id,
                e
            );
        }
        true
    }

    /// Locate the parser responsible for a changed file (by watch dir containment).
    fn find_parser_for_path(&self, path: &Path) -> Option<String> {
        for (tool_id, parser) in &self.parsers {
            if !parser.is_session_file(path) {
                continue;
            }
            for wd in parser.watch_dirs() {
                let dir = expand_path(&wd);
                if path.starts_with(&dir) {
                    return Some(tool_id.clone());
                }
            }
        }
        None
    }

    async fn handle_file_change(&self, path: &Path) {
        let Some(tool_id) = self.find_parser_for_path(path) else {
            return;
        };
        let Some(parser) = self.parsers.get(&tool_id) else {
            return;
        };
        let key = path.to_string_lossy().to_string();
        // notify fires on every append; always re-parse + upsert (deterministic id
        // means this updates the growing session rather than duplicating it).
        if self.parse_and_upsert(parser.as_ref(), path).await {
            if let Some(m) = file_mtime(path) {
                self.mtime_cache.lock().unwrap().insert(key, m);
            }
        }
    }

    async fn start_watchers(self: Arc<Self>) {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<PathBuf>();

        let mut watcher =
            match notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
                if let Ok(event) = res {
                    if matches!(
                        event.kind,
                        notify::EventKind::Create(_) | notify::EventKind::Modify(_)
                    ) {
                        for path in event.paths {
                            let _ = tx.send(path);
                        }
                    }
                }
            }) {
                Ok(w) => w,
                Err(e) => {
                    log::error!("[ActivityCollector] notify init failed: {}", e);
                    return;
                }
            };

        let mut watched = 0usize;
        for (_id, parser) in &self.parsers {
            for wd in parser.watch_dirs() {
                let dir = expand_path(&wd);
                let p = PathBuf::from(&dir);
                if p.exists() {
                    match watcher.watch(&p, notify::RecursiveMode::Recursive) {
                        Ok(()) => watched += 1,
                        Err(e) => log::warn!("[ActivityCollector] watch {}: {}", dir, e),
                    }
                }
            }
        }
        log::info!("[ActivityCollector] notify watching {} dirs", watched);

        let self_clone = self.clone();
        tokio::spawn(async move {
            let _watcher = watcher; // keep the watcher alive for the task lifetime
            while let Some(path) = rx.recv().await {
                // Debounce: coalesce events arriving within 600ms.
                let mut paths = vec![path];
                let deadline = tokio::time::Instant::now() + Duration::from_millis(600);
                loop {
                    match tokio::time::timeout_at(deadline, rx.recv()).await {
                        Ok(Some(p)) => paths.push(p),
                        _ => break,
                    }
                }
                let mut seen = std::collections::HashSet::new();
                for p in paths {
                    if seen.insert(p.clone()) {
                        self_clone.handle_file_change(&p).await;
                    }
                }
            }
        });
    }

    async fn start_hook_listener(self: Arc<Self>) -> Result<(), String> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:19820")
            .await
            .map_err(|e| format!("Failed to bind hook listener: {}", e))?;

        {
            let mut state = self.state.write().await;
            state.hook_status = "listening on 127.0.0.1:19820".to_string();
        }
        log::info!("[ActivityCollector] Hook listener started on 127.0.0.1:19820");

        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let self_clone = self.clone();
                    tokio::spawn(async move {
                        if let Err(e) = handle_hook_request(stream, self_clone).await {
                            log::warn!("[ActivityCollector] hook request error: {}", e);
                        }
                    });
                }
                Err(e) => {
                    log::error!("[ActivityCollector] Hook accept error: {}", e);
                }
            }
        }
    }

    /// Record a real-time hook event as an activity (and upsert its session).
    async fn record_hook_event(&self, payload: HookPayload) {
        let tool_id = if payload.tool.is_empty() {
            "claude-code".to_string()
        } else {
            payload.tool.clone()
        };
        let session_id = payload
            .session_id
            .clone()
            .unwrap_or_else(|| format!("hook-{}", Uuid::new_v4()));
        let ts = payload.timestamp.unwrap_or_else(|| Utc::now().timestamp_millis());
        let event = payload.event.clone();

        let conn = self.db.conn().lock().unwrap();

        let exists = ActivityDao::session_exists(&conn, &session_id).unwrap_or(false);
        if !exists {
            let created_at = Utc::now().timestamp_millis();
            let s = AiSession {
                id: session_id.clone(),
                tool_id: tool_id.clone(),
                project_name: None,
                project_path: None,
                title: Some(event.clone()),
                message_count: 0,
                duration_secs: 0,
                started_at: ts,
                ended_at: Some(ts),
                source: "hook".to_string(),
                raw_path: None,
                summary: None,
                tags: "[]".to_string(),
                metadata: "{}".to_string(),
                created_at,
            };
            let _ = ActivityDao::upsert_session(&conn, &s);
        } else {
            let _ = ActivityDao::update_session_ended(&conn, &session_id, ts, 0, 0);
        }

        let tool_name = payload
            .data
            .as_ref()
            .and_then(|v| v.get("tool_name"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let data_str = payload
            .data
            .as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_default())
            .unwrap_or_default();

        let activity = AiActivity {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.clone(),
            activity_type: if tool_name.is_some() {
                "tool_call".to_string()
            } else {
                "hook_event".to_string()
            },
            role: Some("system".to_string()),
            content_preview: Some(format!("[{}] {}", event, truncate_str(&data_str, 500))),
            tool_name,
            file_path: None,
            lines_added: None,
            lines_removed: None,
            timestamp: ts,
            metadata: "{}".to_string(),
        };
        let _ = ActivityDao::insert_activities(&conn, std::slice::from_ref(&activity));
    }
}

async fn handle_hook_request(
    mut stream: tokio::net::TcpStream,
    collector: Arc<ActivityCollector>,
) -> std::io::Result<()> {
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};

    let (r, mut w) = stream.split();
    let mut reader = BufReader::new(r);

    let mut request_line = String::new();
    reader.read_line(&mut request_line).await?;

    let mut content_length = 0usize;
    loop {
        let mut header = String::new();
        let n = reader.read_line(&mut header).await?;
        if n == 0 || header == "\r\n" || header == "\n" {
            break;
        }
        if header.to_lowercase().starts_with("content-length:") {
            content_length = header
                .split(':')
                .nth(1)
                .and_then(|v| v.trim().parse().ok())
                .unwrap_or(0);
        }
    }

    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        reader.read_exact(&mut body).await?;
    }

    let body_str = String::from_utf8_lossy(&body);
    log::info!("[ActivityCollector] Hook received: {}", body_str);

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&body_str) {
        let payload = parse_hook_payload(value);
        collector.record_hook_event(payload).await;
    }

    let response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 14\r\n\r\n{\"status\":\"ok\"}";
    w.write_all(response.as_bytes()).await?;
    Ok(())
}

// ===== Helpers =====

/// Normalize a raw hook payload (Claude Code sends hook_event_name/session_id/etc.
/// on stdin; our own hooks may send tool/event). Tolerant of both shapes.
fn parse_hook_payload(v: serde_json::Value) -> HookPayload {
    let tool = v
        .get("tool")
        .and_then(|x| x.as_str())
        .unwrap_or("claude-code")
        .to_string();
    let event = v
        .get("event")
        .and_then(|x| x.as_str())
        .or_else(|| v.get("hook_event_name").and_then(|x| x.as_str()))
        .unwrap_or("hook")
        .to_string();
    let session_id = v
        .get("session_id")
        .and_then(|x| x.as_str())
        .or_else(|| v.get("sessionId").and_then(|x| x.as_str()))
        .map(|s| s.to_string());
    let timestamp = v.get("timestamp").and_then(|t| {
        t.as_i64().or_else(|| {
            t.as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.timestamp_millis())
        })
    });
    HookPayload {
        tool,
        event,
        session_id,
        timestamp,
        data: Some(v),
    }
}

fn collect_session_files(dir: PathBuf, parser: &dyn ActivityParser, files: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_session_files(path, parser, files);
        } else if parser.is_session_file(&path) {
            files.push(path);
        }
    }
}

fn file_mtime(path: &Path) -> Option<u64> {
    std::fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}

fn truncate_str(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

fn expand_path(path: &str) -> String {
    if path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(&path[2..]).to_string_lossy().to_string();
        }
    }
    path.to_string()
}
