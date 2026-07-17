use std::collections::HashMap;
use std::sync::Arc;

use chrono::{Datelike, Local, NaiveDate};
use tauri::State;

use crate::database::dao::activity::{
    ActivityDao, AiReport, AiReportTemplate, AiSession, AiTool,
};
use crate::database::Database;
use crate::services::activity::parsers::claude_code::{load_messages, ClaudeMessage};
use crate::services::activity::collector::ActivityCollector;
use crate::services::activity::reporter::Reporter;
use crate::services::activity::summarizer::{Summarizer, SummaryMethod};
use crate::services::ai::{AiProviderConfig, AiRequest, AiEvent, ProviderRegistry};

// ==================== AI Tools ====================

#[tauri::command]
pub async fn get_ai_tools(db: State<'_, Arc<Database>>) -> Result<Vec<AiTool>, String> {
    let conn = db.conn().lock().unwrap();
    ActivityDao::get_all_tools(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_ai_tool(
    db: State<'_, Arc<Database>>,
    id: String,
    enabled: bool,
    watch_paths: String,
    config: String,
) -> Result<(), String> {
    let conn = db.conn().lock().unwrap();
    ActivityDao::update_tool(&conn, &id, enabled, &watch_paths, &config)
        .map_err(|e| e.to_string())
}

// ==================== Sessions ====================

#[tauri::command]
pub async fn get_sessions(
    db: State<'_, Arc<Database>>,
    tool_id: Option<String>,
    project_name: Option<String>,
    start: i64,
    end: i64,
    limit: i64,
    offset: i64,
) -> Result<Vec<AiSession>, String> {
    let conn = db.conn().lock().unwrap();
    ActivityDao::get_sessions(
        &conn,
        tool_id.as_deref(),
        project_name.as_deref(),
        start,
        end,
        limit,
        offset,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_session_detail(
    db: State<'_, Arc<Database>>,
    id: String,
) -> Result<serde_json::Value, String> {
    let conn = db.conn().lock().unwrap();
    let session = ActivityDao::get_session_by_id(&conn, &id)
        .map_err(|e| e.to_string())?;
    let activities =
        ActivityDao::get_activities_for_session(&conn, &id)
            .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "session": session,
        "activities": activities,
    }))
}

#[tauri::command]
pub async fn load_session_messages(
    raw_path: String,
) -> Result<Vec<ClaudeMessage>, String> {
    let path = std::path::Path::new(&raw_path);
    load_messages(path)
}

#[tauri::command]
pub async fn get_today_stats(
    db: State<'_, Arc<Database>>,
) -> Result<serde_json::Value, String> {
    let now = Local::now();
    let today_start = NaiveDate::from_ymd_opt(now.year(), now.month(), now.day())
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp_millis();
    let today_end = NaiveDate::from_ymd_opt(now.year(), now.month(), now.day())
        .unwrap()
        .and_hms_opt(23, 59, 59)
        .unwrap()
        .and_utc()
        .timestamp_millis();

    let conn = db.conn().lock().unwrap();
    let sessions =
        ActivityDao::get_sessions_in_range(&conn, today_start, today_end)
            .map_err(|e| e.to_string())?;

    let total_sessions = sessions.len();
    let total_messages: i64 = sessions.iter().map(|s| s.message_count as i64).sum();
    let total_duration: i64 = sessions.iter().map(|s| s.duration_secs as i64).sum();

    let mut tool_counts: HashMap<String, u32> = HashMap::new();
    for s in &sessions {
        *tool_counts.entry(s.tool_id.clone()).or_default() += 1;
    }

    let recent: Vec<&AiSession> = sessions.iter().take(10).collect();

    Ok(serde_json::json!({
        "total_sessions": total_sessions,
        "total_messages": total_messages,
        "total_duration_secs": total_duration,
        "total_duration_formatted": format!("{}h {}m", total_duration / 3600, (total_duration % 3600) / 60),
        "tool_distribution": tool_counts,
        "recent_sessions": recent,
    }))
}

// ==================== Sync ====================

#[tauri::command]
pub async fn sync_now(
    collector: State<'_, Arc<ActivityCollector>>,
) -> Result<serde_json::Value, String> {
    let state = collector.sync_now().await;
    Ok(serde_json::json!({
        "sessions_parsed": state.sessions_parsed,
        "last_sync": state.last_sync,
        "errors": state.errors,
    }))
}

#[tauri::command]
pub async fn get_collector_status(
    collector: State<'_, Arc<ActivityCollector>>,
) -> Result<serde_json::Value, String> {
    let state = collector.get_state().await;
    Ok(serde_json::json!({
        "running": state.running,
        "sessions_parsed": state.sessions_parsed,
        "last_sync": state.last_sync,
        "errors": state.errors,
        "hook_status": state.hook_status,
    }))
}

#[tauri::command]
pub async fn reset_activity_data(
    collector: State<'_, Arc<ActivityCollector>>,
) -> Result<serde_json::Value, String> {
    let state = collector.reset_and_rescan().await;
    Ok(serde_json::json!({
        "sessions_parsed": state.sessions_parsed,
        "last_sync": state.last_sync,
        "errors": state.errors,
    }))
}

// ==================== Hooks ====================

/// Hook events we register in ~/.claude/settings.json.
const HOOK_EVENTS: &[&str] = &["SessionStart", "Stop", "PreToolUse", "PostToolUse"];
/// Marker present in every command we write, so remove_hooks only strips ours.
const HOOK_MARKER: &str = "127.0.0.1:19820";

fn hook_command() -> String {
    if cfg!(target_os = "windows") {
        // Read stdin (the hook payload) and POST it to the local listener.
        r#"powershell -NoProfile -Command "$b=[Console]::In.ReadToEnd();try{Invoke-RestMethod -Uri http://127.0.0.1:19820/hook/activity -Method Post -Body $b -ContentType 'application/json' -TimeoutSec 2}catch{}""#
            .to_string()
    } else {
        r#"sh -c 'b=$(cat); curl -s -m 2 -X POST http://127.0.0.1:19820/hook/activity -H "Content-Type: application/json" -d "$b" 2>/dev/null || true'"#
            .to_string()
    }
}

fn claude_settings_path() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("settings.json"))
}

#[tauri::command]
pub async fn setup_hooks() -> Result<serde_json::Value, String> {
    let path = claude_settings_path().ok_or_else(|| "Cannot locate home dir".to_string())?;

    // Ensure ~/.claude exists.
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {}", parent.display(), e))?;
    }

    // Read existing settings (or start fresh). Never clobber user config.
    let mut settings: serde_json::Value = if let Ok(text) = std::fs::read_to_string(&path) {
        serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Backup once before first write.
    let backup = path.with_extension("json.bak");
    if !backup.exists() {
        if let Ok(text) = std::fs::read_to_string(&path) {
            let _ = std::fs::write(&backup, text);
        }
    }

    let cmd = hook_command();
    let hooks_obj = settings
        .as_object_mut()
        .ok_or_else(|| "settings.json is not an object".to_string())?
        .entry("hooks".to_string())
        .or_insert_with(|| serde_json::json!({}));

    let hooks_map = hooks_obj
        .as_object_mut()
        .ok_or_else(|| "settings.hooks is not an object".to_string())?;

    let mut added = Vec::new();
    for event in HOOK_EVENTS {
        let entry = serde_json::json!([
            { "matcher": "", "hooks": [ { "type": "command", "command": cmd } ] }
        ]);
        hooks_map.insert((*event).to_string(), entry);
        added.push((*event).to_string());
    }

    let pretty = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, pretty).map_err(|e| format!("write {}: {}", path.display(), e))?;

    Ok(serde_json::json!({
        "path": path.to_string_lossy(),
        "events": added,
        "backup": backup.to_string_lossy(),
    }))
}

#[tauri::command]
pub async fn remove_hooks() -> Result<serde_json::Value, String> {
    let path = claude_settings_path().ok_or_else(|| "Cannot locate home dir".to_string())?;
    if !path.exists() {
        return Ok(serde_json::json!({ "removed": 0, "note": "settings.json not found" }));
    }

    let text = std::fs::read_to_string(&path).map_err(|e| format!("read {}: {}", path.display(), e))?;
    let mut settings: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("parse: {}", e))?;

    let mut removed = 0usize;
    if let Some(hooks) = settings.get_mut("hooks").and_then(|h| h.as_object_mut()) {
        // Drop whole events whose command carries our marker.
        let owned: Vec<String> = hooks.keys().cloned().collect();
        for event in owned {
            if let Some(arr) = hooks.get_mut(&event).and_then(|v| v.as_array_mut()) {
                arr.retain(|entry| {
                    let cmd = entry
                        .get("hooks")
                        .and_then(|h| h.as_array())
                        .and_then(|a| a.first())
                        .and_then(|h| h.get("command"))
                        .and_then(|c| c.as_str())
                        .unwrap_or("");
                    !cmd.contains(HOOK_MARKER)
                });
                if arr.is_empty() {
                    hooks.remove(&event);
                    removed += 1;
                }
            }
        }
        if hooks.is_empty() {
            if let Some(obj) = settings.as_object_mut() {
                obj.remove("hooks");
            }
        }
    }

    let pretty = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, pretty).map_err(|e| format!("write {}: {}", path.display(), e))?;

    Ok(serde_json::json!({ "removed": removed, "path": path.to_string_lossy() }))
}

// ==================== Reports ====================

#[tauri::command]
pub async fn generate_report(
    app: tauri::AppHandle,
    db: State<'_, Arc<Database>>,
    report_type: String,
    range_start: i64,
    range_end: i64,
    summary_method: String,
    summary_tool: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    template_id: Option<String>,
) -> Result<serde_json::Value, String> {
    use tauri::Emitter;
    let emit = |stage: &str, message: String| {
        let _ = app.emit(
            "report-gen-progress",
            serde_json::json!({ "stage": stage, "message": message }),
        );
    };

    emit("query", "查询时间范围内的会话数据...".to_string());
    let reporter = Reporter::new(db.inner().clone());
    let sessions = match reporter.get_sessions_in_range(range_start, range_end) {
        Ok(s) => s,
        Err(e) => {
            emit("error", format!("查询失败: {}", e));
            return Err(e);
        }
    };

    if sessions.is_empty() {
        emit("error", "该时间范围内没有活动记录".to_string());
        return Err("No activity records in this time range.".to_string());
    }
    emit("query", format!("找到 {} 个会话", sessions.len()));

    emit("stats", "构建统计数据...".to_string());
    let stats = reporter.build_stats(&sessions);

    emit("prompt", "收集用户提问记录...".to_string());
    let user_messages = {
        let conn = db.conn().lock().unwrap();
        ActivityDao::get_user_messages_in_range(&conn, range_start, range_end).unwrap_or_default()
    };
    emit("prompt", format!("已收集 {} 条用户提问，构建 Prompt...", user_messages.len()));
    // Load the prompt template (by id, else default, else built-in fallback).
    let template_body = {
        let conn = db.conn().lock().unwrap();
        let t = template_id
            .as_deref()
            .and_then(|id| ActivityDao::get_report_template(&conn, id).ok())
            .or_else(|| ActivityDao::get_default_report_template(&conn).ok().flatten());
        t.map(|t| t.body).unwrap_or_default()
    };
    let prompt = reporter.build_report_prompt(
        &report_type, range_start, range_end, &stats, &sessions, &user_messages, &template_body,
    );
    emit(
        "prompt",
        format!("Prompt 已构建（{} 字符）", prompt.chars().count()),
    );

    let method_label = match summary_method.as_str() {
        "ai" => format!("AI: {}", summary_tool.as_deref().unwrap_or("claude-cli")),
        "cli" => format!("CLI: {}", summary_tool.as_deref().unwrap_or("claude")),
        "api" => format!("API: {}", summary_tool.as_deref().unwrap_or("anthropic")),
        _ => "手动模式".to_string(),
    };
    emit("summarize", format!("调用 {} 进行总结...", method_label));

    let summary_result = if summary_method == "ai" {
        // Use unified AI module
        let provider_id = summary_tool.clone().unwrap_or_else(|| "claude-cli".to_string());
        let config_str = model.clone().unwrap_or_else(|| "{}".to_string());
        let config: AiProviderConfig = serde_json::from_str(&config_str)
            .map_err(|e| format!("Invalid AI config: {}", e))?;

        // Note: Creates a new registry instance. The Tauri-managed singleton is available via
        // app state but the reporter doesn't currently accept it as a parameter.
        // Functionally identical since providers are stateless.
        let registry = ProviderRegistry::new();
        let provider = registry.get(&provider_id)
            .ok_or_else(|| format!("Unknown AI provider: {}", provider_id))?;

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<AiEvent>();
        let request = AiRequest {
            prompt: prompt.clone(),
            provider_config: config,
            continue_session: false,
        };
        let handle = tokio::spawn(async move { provider.call_streaming(request, tx).await });
        while let Some(event) = rx.recv().await {
            match event {
                AiEvent::Progress { stage, message } => {
                    let _ = app.emit("report-gen-progress", serde_json::json!({"stage": stage, "message": message}));
                }
                AiEvent::Thinking { tokens } => {
                    let _ = app.emit("report-gen-stream", serde_json::json!({"kind": "thinking", "tokens": tokens}));
                }
                AiEvent::TextDelta { text } => {
                    let _ = app.emit("report-gen-stream", serde_json::json!({"kind": "text", "text": text}));
                }
                AiEvent::Done => {
                    let _ = app.emit("report-gen-stream", serde_json::json!({"kind": "done"}));
                }
            }
        }
        handle.await.map_err(|e| format!("AI task error: {}", e))?
            .map(|r| r.output)
            .map_err(|e| format!("{}", e))
    } else if summary_method == "manual" {
        Ok(prompt.clone())
    } else {
        // Legacy backward compat: still support old "cli"/"api" mode
        match summary_method.as_str() {
            "cli" => {
                let cmd = summary_tool.clone().unwrap_or_else(|| "claude".to_string());
                Summarizer::summarize_cli_streaming(&cmd, &prompt, &app).await
            }
            "api" => {
                let provider = summary_tool.clone().unwrap_or_else(|| "anthropic".to_string());
                let key = api_key.unwrap_or_default();
                let m = model.unwrap_or_else(|| {
                    if provider == "anthropic" { "claude-sonnet-4-20250514".to_string() }
                    else { "gpt-4o".to_string() }
                });
                Summarizer::summarize(&prompt, &SummaryMethod::Api { provider, api_key: key, model: m }).await
            }
            _ => Ok(prompt.clone()),
        }
    };

    match summary_result {
        Ok(content) => {
            emit("save", "保存报告...".to_string());
            let report = reporter
                .save_report(&report_type, range_start, range_end, &content, &stats, &summary_method, &summary_tool.unwrap_or_default())
                .map_err(|e| {
                    emit("error", format!("保存失败: {}", e));
                    e
                })?;
            emit("done", "报告已生成并保存".to_string());
            Ok(serde_json::json!({ "report": report, "stats": stats, "prompt": prompt }))
        }
        Err(e) => {
            emit("error", format!("总结失败: {}（已保存 Prompt 供手动使用）", e));
            let _ = reporter.save_report(
                &report_type, range_start, range_end,
                &format!("[Generation failed: {}]\n\n## Prompt\n\n{}", e, prompt),
                &stats, "manual", "",
            );
            Err(format!("Auto-summary failed, saved prompt for manual use. Error: {}", e))
        }
    }
}

#[tauri::command]
pub async fn get_reports(
    db: State<'_, Arc<Database>>,
    report_type: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<AiReport>, String> {
    let conn = db.conn().lock().unwrap();
    ActivityDao::get_reports(&conn, report_type.as_deref(), limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_report(
    db: State<'_, Arc<Database>>,
    id: String,
) -> Result<(), String> {
    let conn = db.conn().lock().unwrap();
    ActivityDao::delete_report(&conn, &id).map_err(|e| e.to_string())
}

// ==================== Report Templates ====================

#[tauri::command]
pub async fn get_report_templates(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<AiReportTemplate>, String> {
    let conn = db.conn().lock().unwrap();
    ActivityDao::get_all_report_templates(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_report_template(
    db: State<'_, Arc<Database>>,
    id: Option<String>,
    name: String,
    body: String,
    is_default: Option<bool>,
) -> Result<AiReportTemplate, String> {
    let now = chrono::Local::now().timestamp_millis();
    // New template if no id (or empty id); the built-in "default" can be edited in place.
    let id = match id {
        Some(s) if !s.trim().is_empty() => s,
        _ => uuid::Uuid::new_v4().to_string(),
    };
    let tpl = AiReportTemplate {
        id: id.clone(),
        name,
        body,
        is_default: is_default.unwrap_or(false),
        created_at: now,
        updated_at: now,
    };
    {
        let conn = db.conn().lock().unwrap();
        ActivityDao::upsert_report_template(&conn, &tpl).map_err(|e| e.to_string())?;
        if tpl.is_default {
            ActivityDao::set_default_report_template(&conn, &id).map_err(|e| e.to_string())?;
        }
    }
    Ok(tpl)
}

#[tauri::command]
pub async fn delete_report_template(
    db: State<'_, Arc<Database>>,
    id: String,
) -> Result<(), String> {
    let conn = db.conn().lock().unwrap();
    ActivityDao::delete_report_template(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_default_report_template(
    db: State<'_, Arc<Database>>,
    id: String,
) -> Result<(), String> {
    let conn = db.conn().lock().unwrap();
    ActivityDao::set_default_report_template(&conn, &id).map_err(|e| e.to_string())
}

// ==================== Report Rendering ====================

#[tauri::command]
pub async fn render_report_html(
    content: String,
    title: String,
    theme: Option<String>,
) -> Result<String, String> {
    Ok(report_to_html_document(
        &title,
        &content,
        theme.as_deref().unwrap_or("github"),
    ))
}

/// Available HTML export themes (id -> label), surfaced to the frontend.
#[tauri::command]
pub async fn list_report_themes() -> Vec<(String, String)> {
    vec![
        ("github".to_string(), "GitHub 风".to_string()),
        ("dark".to_string(), "暗色".to_string()),
        ("elegant".to_string(), "典雅文档".to_string()),
        ("minimal".to_string(), "极简".to_string()),
        ("colorful".to_string(), "彩色".to_string()),
    ]
}

/// CSS for a given theme. Falls back to the GitHub light theme.
fn theme_css(theme: &str) -> &'static str {
    match theme {
        "dark" => r#"
  :root { color-scheme: dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
         font-size: 14px; max-width: 760px; margin: 0 auto; padding: 48px 24px; line-height: 1.75;
         color: #e6edf3; background: #0d1117; }
  h1,h2,h3,h4 { color: #f0f6fc; font-weight: 600; line-height: 1.3; margin-top: 1.4em; margin-bottom: .5em; }
  h1 { font-size: 1.7em; border-bottom: 1px solid #30363d; padding-bottom: .3em; }
  h2 { font-size: 1.35em; border-bottom: 1px solid #30363d; padding-bottom: .3em; }
  h3 { font-size: 1.12em; }
  a { color: #58a6ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { font-family: "Cascadia Code", Consolas, "Courier New", monospace; background: #161b22; color: #e6edf3; padding: .15em .4em; border-radius: 6px; font-size: .9em; }
  pre { background: #161b22; padding: 16px; border-radius: 8px; border: 1px solid #30363d; overflow-x: auto; }
  pre code { background: none; padding: 0; color: inherit; }
  blockquote { border-left: 4px solid #30363d; margin: 1em 0; padding: .4em 1em; color: #8b949e; background: #161b22; border-radius: 0 6px 6px 0; }
  table { border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid #30363d; padding: 6px 13px; }
  th { background: #161b22; font-weight: 600; }
  ul, ol { padding-left: 1.6em; }
  hr { border: none; border-top: 1px solid #30363d; margin: 1.5em 0; }
"#,
        "elegant" => r#"
  body { font-family: Georgia, "Songti SC", "SimSun", serif; font-size: 15px; max-width: 680px;
         margin: 48px auto; padding: 0 32px; line-height: 1.85; color: #2c2c2c; background: #fdfcf8; }
  h1,h2,h3,h4 { font-family: Georgia, "Songti SC", serif; color: #1a1a1a; font-weight: bold; margin-top: 1.4em; margin-bottom: .5em; }
  h1 { font-size: 1.75em; text-align: center; border-bottom: 2px solid #b8a07a; padding-bottom: .35em; margin-bottom: .7em; }
  h2 { font-size: 1.3em; border-bottom: 1px solid #d8d0c0; padding-bottom: .25em; }
  h3 { font-size: 1.1em; color: #6b5a3e; }
  a { color: #8a6d3b; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { font-family: "Cascadia Code", Consolas, monospace; background: #f3efe6; color: #6b5a3e; padding: .15em .4em; border-radius: 4px; font-size: .9em; }
  pre { background: #f3efe6; padding: 14px; border-radius: 6px; border-left: 3px solid #b8a07a; overflow-x: auto; }
  pre code { background: none; color: inherit; }
  blockquote { border-left: 3px solid #b8a07a; margin: 1em 0; padding: .5em 1em; color: #5a5a5a; font-style: italic; background: #f8f5ee; }
  table { border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid #d8d0c0; padding: 6px 13px; }
  th { background: #f3efe6; }
  ul, ol { padding-left: 1.6em; }
  hr { border: none; border-top: 1px solid #d8d0c0; margin: 1.5em 0; }
"#,
        "minimal" => r#"
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
         font-size: 14px; max-width: 680px; margin: 64px auto; padding: 0 28px; line-height: 1.8;
         color: #333; background: #fafafa; }
  h1,h2,h3,h4 { font-weight: 600; color: #111; margin-top: 1.7em; margin-bottom: .4em; letter-spacing: -0.01em; }
  h1 { font-size: 1.85em; }
  h2 { font-size: 1.3em; }
  h3 { font-size: 1.05em; color: #555; }
  a { color: #0070f3; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { font-family: "SFMono-Regular", Consolas, monospace; background: #ececec; padding: .15em .4em; border-radius: 3px; font-size: .88em; }
  pre { background: #ececec; padding: 14px; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #ddd; margin: 1em 0; padding: 0 1em; color: #777; }
  table { border-collapse: collapse; margin: 1em 0; }
  th, td { border-bottom: 1px solid #e0e0e0; padding: 8px 13px; }
  th { border-bottom: 2px solid #333; }
  ul, ol { padding-left: 1.6em; }
  hr { border: none; border-top: 1px solid #e0e0e0; margin: 2em 0; }
"#,
        "colorful" => r#"
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
         font-size: 14px; max-width: 760px; margin: 32px auto; padding: 0 24px; line-height: 1.75;
         color: #2d3748; background: #f7fafc; }
  h1 { font-size: 1.6em; color: #fff; background: linear-gradient(135deg, #667eea, #764ba2); padding: 14px 18px; border-radius: 10px; margin-top: 1.2em; font-weight: 700; }
  h2 { font-size: 1.3em; color: #553c9a; border-left: 4px solid #667eea; padding-left: 10px; margin-top: 1.5em; font-weight: 700; }
  h3 { font-size: 1.12em; color: #667eea; margin-top: 1.3em; font-weight: 700; }
  h4 { color: #6b46c1; font-weight: 700; }
  a { color: #667eea; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { font-family: "Cascadia Code", Consolas, monospace; background: #edf2f7; color: #d53f8c; padding: .15em .4em; border-radius: 4px; font-size: .9em; }
  pre { background: #1a202c; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
  pre code { background: none; color: inherit; padding: 0; }
  blockquote { border-left: 4px solid #667eea; margin: 1em 0; padding: .5em 1em; background: #edf2f7; border-radius: 0 6px 6px 0; color: #4a5568; }
  table { border-collapse: collapse; margin: 1em 0; border-radius: 6px; overflow: hidden; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 13px; }
  th { background: #667eea; color: #fff; }
  ul, ol { padding-left: 1.6em; }
  hr { border: none; border-top: 2px solid #e2e8f0; margin: 1.5em 0; }
"#,
        // "github" (default) and unknown -> GitHub light
        _ => r#"
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
         font-size: 13px; max-width: 720px; margin: 24px auto; padding: 0 20px; line-height: 1.65;
         color: #1f2328; background: #ffffff; }
  h1,h2,h3,h4 { line-height: 1.25; margin-top: 1.3em; margin-bottom: 0.5em; font-weight: 600; }
  h1 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: .3em; }
  h2 { font-size: 1.25em; border-bottom: 1px solid #d0d7de; padding-bottom: .3em; }
  h3 { font-size: 1.08em; }
  a { color: #0969da; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { font-family: "Cascadia Code", Consolas, "Courier New", monospace;
          background: #f6f8fa; padding: .15em .4em; border-radius: 6px; font-size: .9em; }
  pre { background: #f6f8fa; padding: 16px; border-radius: 8px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #d0d7de; margin: 1em 0; padding: 0 1em; color: #57606a; }
  table { border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid #d0d7de; padding: 6px 13px; }
  th { background: #f6f8fa; font-weight: 600; }
  ul, ol { padding-left: 1.6em; }
  hr { border: none; border-top: 1px solid #d0d7de; margin: 1.5em 0; }
  @media (prefers-color-scheme: dark) {
    body { color: #e6edf3; background: #0d1117; }
    h1, h2 { border-color: #30363d; }
    a { color: #58a6ff; }
    code, pre, th { background: #161b22; }
    blockquote { border-color: #30363d; color: #8b949e; }
    th, td { border-color: #30363d; }
    hr { border-color: #30363d; }
  }
"#,
    }
}

/// Convert a Markdown report into a standalone, themed HTML document.
fn report_to_html_document(title: &str, markdown: &str, theme: &str) -> String {
    use pulldown_cmark::{html, Options, Parser};

    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    let parser = Parser::new_ext(markdown, options);
    let mut body = String::new();
    html::push_html(&mut body, parser);

    let css = theme_css(theme);
    format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>{css}</style>
</head>
<body>
{body}
</body>
</html>"#,
        title = html_escape(title),
        css = css,
        body = body
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

// ==================== Date Helpers ====================

#[tauri::command]
pub async fn get_today_range() -> Result<serde_json::Value, String> {
    let now = Local::now();
    let start = NaiveDate::from_ymd_opt(now.year(), now.month(), now.day())
        .unwrap().and_hms_opt(0, 0, 0).unwrap().and_local_timezone(Local).single().unwrap().timestamp_millis();
    let end = NaiveDate::from_ymd_opt(now.year(), now.month(), now.day())
        .unwrap().and_hms_opt(23, 59, 59).unwrap().and_local_timezone(Local).single().unwrap().timestamp_millis();
    Ok(serde_json::json!({ "start": start, "end": end, "label": now.format("%Y-%m-%d").to_string() }))
}

#[tauri::command]
pub async fn get_date_range(
    range_type: String,
    offset: Option<i32>,
) -> Result<serde_json::Value, String> {
    let now = Local::now();
    let _offset = offset.unwrap_or(0);

    match range_type.as_str() {
        "today" => {
            let start = NaiveDate::from_ymd_opt(now.year(), now.month(), now.day())
                .unwrap().and_hms_opt(0, 0, 0).unwrap().and_local_timezone(Local).single().unwrap().timestamp_millis();
            let end = NaiveDate::from_ymd_opt(now.year(), now.month(), now.day())
                .unwrap().and_hms_opt(23, 59, 59).unwrap().and_local_timezone(Local).single().unwrap().timestamp_millis();
            Ok(serde_json::json!({ "start": start, "end": end, "label": format!("Today ({})", now.format("%Y-%m-%d")) }))
        }
        "yesterday" => {
            let yesterday = now - chrono::Duration::days(1);
            let start = NaiveDate::from_ymd_opt(yesterday.year(), yesterday.month(), yesterday.day())
                .unwrap().and_hms_opt(0, 0, 0).unwrap().and_local_timezone(Local).single().unwrap().timestamp_millis();
            let end = NaiveDate::from_ymd_opt(yesterday.year(), yesterday.month(), yesterday.day())
                .unwrap().and_hms_opt(23, 59, 59).unwrap().and_local_timezone(Local).single().unwrap().timestamp_millis();
            Ok(serde_json::json!({ "start": start, "end": end, "label": format!("Yesterday ({})", yesterday.format("%Y-%m-%d")) }))
        }
        "this_week" => {
            let days_from_monday = now.weekday().num_days_from_monday() as i64;
            let monday = now - chrono::Duration::days(days_from_monday);
            let start = NaiveDate::from_ymd_opt(monday.year(), monday.month(), monday.day())
                .unwrap().and_hms_opt(0, 0, 0).unwrap().and_local_timezone(Local).single().unwrap().timestamp_millis();
            let end = NaiveDate::from_ymd_opt(now.year(), now.month(), now.day())
                .unwrap().and_hms_opt(23, 59, 59).unwrap().and_local_timezone(Local).single().unwrap().timestamp_millis();
            Ok(serde_json::json!({ "start": start, "end": end, "label": format!("This Week ({})", monday.format("%Y-%m-%d")) }))
        }
        "this_month" => {
            let start = NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
                .unwrap().and_hms_opt(0, 0, 0).unwrap().and_local_timezone(Local).single().unwrap().timestamp_millis();
            let end = NaiveDate::from_ymd_opt(now.year(), now.month(), now.day())
                .unwrap().and_hms_opt(23, 59, 59).unwrap().and_local_timezone(Local).single().unwrap().timestamp_millis();
            Ok(serde_json::json!({ "start": start, "end": end, "label": format!("This Month ({})", now.format("%Y-%m")) }))
        }
        _ => Err(format!("Unknown range type: {}", range_type)),
    }
}
