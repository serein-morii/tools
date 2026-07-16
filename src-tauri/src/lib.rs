pub mod commands;
mod database;
mod error;
mod services;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use database::{Database, init_schema, migrate_default_templates};
use services::scheduler::{start_scheduler, start_gitlab_scheduler};
use services::activity::collector::ActivityCollector;
use services::activity::parsers::claude_code::ClaudeCodeParser;
use services::activity::parsers::codex::CodexParser;
use services::activity::parsers::generic::GenericParser;
use services::activity::parsers::ActivityParser;
use tauri::Manager;
use tauri::Emitter;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItem};
use tauri::image::Image;

// Global app handle for auto-launch
static APP_HANDLE: once_cell::sync::Lazy<Mutex<Option<tauri::AppHandle>>> = once_cell::sync::Lazy::new(|| Mutex::new(None));

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
            if let Err(e) = migrate_default_templates(&conn) {
                log::error!("Failed to migrate default templates: {}", e);
            }
            drop(conn);
            Arc::new(db)
        }
        Err(e) => {
            log::error!("Failed to initialize database: {}", e);
            std::process::exit(1);
        }
    };

    // Start scheduler
    start_scheduler(db.clone());

    // Start GitLab scheduler
    start_gitlab_scheduler(db.clone());

    // Build activity parsers (collector started inside setup() where tokio runtime is ready)
    let mut parsers: HashMap<String, Box<dyn ActivityParser>> = HashMap::new();
    parsers.insert("claude-code".to_string(), Box::new(ClaudeCodeParser::new()));
    parsers.insert("codex".to_string(), Box::new(CodexParser::new()));
    parsers.insert("gemini-cli".to_string(), Box::new(GenericParser::new("gemini-cli", "~/.gemini/")));
    parsers.insert("qwen-cli".to_string(), Box::new(GenericParser::new("qwen-cli", "~/.qwen/")));
    let collector = Arc::new(ActivityCollector::new(db.clone(), parsers));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--silent"]),
        ))
        .manage(db)
        .manage(collector)
        .invoke_handler(tauri::generate_handler![
            commands::get_tasks,
            commands::get_task,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
            commands::clear_all_tasks,
            commands::toggle_task,
            commands::test_task,
            commands::get_channels,
            commands::get_channel,
            commands::create_channel,
            commands::update_channel,
            commands::delete_channel,
            commands::test_channel_cmd,
            commands::get_pending_reminders,
            commands::get_task_reminders,
            commands::get_reminder_history,
            commands::confirm_reminder,
            commands::submit_reminder_feedback,
            commands::snooze_reminder,
            commands::get_templates,
            commands::get_template,
            commands::create_template,
            commands::update_template,
            commands::delete_template,
            commands::get_settings,
            commands::update_setting,
            commands::set_auto_launch,
            commands::get_auto_launch_status,
            commands::set_window_theme,
            commands::export_backup,
            commands::import_backup,
            commands::write_text_file,
            commands::get_gitlab_config,
            commands::save_gitlab_config,
            commands::test_gitlab_connection,
            commands::trigger_gitlab_scan,
            commands::get_gitlab_scan_history,
            commands::get_gitlab_scan_detail,
            commands::delete_gitlab_scan_history,
            commands::get_gitlab_configured,
            commands::walkin_auto_login,
            commands::walkin_get_captcha,
            commands::walkin_ldap_login,
            commands::walkin_fetch_unit_board,
            commands::walkin_fetch_unit_list,
            commands::walkin_check_login,
            commands::walkin_fetch_workspaces,
            commands::walkin_fetch_related_projects,
            commands::gitlab_get_projects,
            commands::gitlab_get_branches,
            commands::sonar_get_reports,
            commands::sonar_get_files,
            commands::sonar_get_file_coverage,
            commands::sonar_generate_prompt,
            commands::get_ai_coverage,
            commands::get_ai_coverage_authors,
            commands::get_ai_coverage_commits,
            commands::get_ai_commit_detail,
            commands::dts_list_configs,
            commands::dts_get_config,
            commands::dts_get_active_config,
            commands::dts_save_config,
            commands::dts_delete_config,
            commands::dts_activate_config,
            commands::dts_test_connection,
            commands::dts_fetch_token,
            commands::dts_list_tasks,
            commands::dts_start_task,
            commands::dts_stop_task,
            commands::dts_delete_task,
            commands::dts_rename_task,
            commands::dts_reset_offset,
            commands::dts_list_environments,
            commands::dts_list_flush,
            commands::dts_create_flush,
            commands::dts_start_flush,
            commands::dts_delete_flush,
            commands::dts_batch_op,
            commands::dts_batch_rename,
            commands::dts_batch_create_flush,
            commands::dts_batch_flush_op,
            commands::get_desktop_path,
            commands::organize_desktop,
            commands::undo_organize,
            commands::has_undo_data,
            commands::get_builtin_rules,
            commands::get_custom_rules,
            commands::save_custom_rules,
            commands::restore_all_from_folders,
            commands::quick_scan,
            // Activity Tracker
            commands::get_ai_tools,
            commands::update_ai_tool,
            commands::get_sessions,
            commands::get_session_detail,
            commands::load_session_messages,
            commands::get_today_stats,
            commands::sync_now,
            commands::get_collector_status,
            commands::generate_report,
            commands::get_reports,
            commands::delete_report,
            commands::render_report_html,
            commands::get_report_templates,
            commands::save_report_template,
            commands::delete_report_template,
            commands::set_default_report_template,
            commands::get_today_range,
            commands::get_date_range,
            commands::setup_hooks,
            commands::remove_hooks,
            commands::reset_activity_data,
        ])
        .setup(|app| {
            // Start activity collector (tokio runtime is active here)
            let collector = app.state::<Arc<ActivityCollector>>().inner().clone();
            tauri::async_runtime::spawn(async move {
                collector.start().await;
            });

            // Store app handle for auto-launch
            {
                let mut handle = APP_HANDLE.lock().unwrap();
                *handle = Some(app.handle().clone());
            }

            // Build tray menu
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let new_task_item = MenuItem::with_id(app, "new_task", "新建任务", true, None::<&str>)?;
            let scan_item = MenuItem::with_id(app, "scan", "扫描代码", true, None::<&str>)?;
            let dashboard_item = MenuItem::with_id(app, "dashboard", "打开概览", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "打开设置", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&new_task_item)
                .item(&scan_item)
                .separator()
                .item(&dashboard_item)
                .item(&settings_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // Build tray icon
            let tray = TrayIconBuilder::with_id("tools-tray")
                .tooltip("Dev Tools 开发工具")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                    "new_task" => {
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                            let _ = window.emit("tray-action", "new-task");
                        }
                    }
                    "scan" => {
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                            let _ = window.emit("tray-action", "scan");
                        }
                    }
                    "dashboard" => {
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                            let _ = window.emit("tray-action", "dashboard");
                        }
                    }
                    "settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                            let _ = window.emit("tray-action", "settings");
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                });

            // Load dedicated tray icon (32x32 PNG designed for system tray)
            // Falls back to default window icon if the tray icon is not found
            let tray_icon_path = if cfg!(debug_assertions) {
                // In dev mode, the icon is in src-tauri/icons
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/tray-icon.png")
            } else {
                // In production, the icon is bundled as a resource
                std::path::PathBuf::from("icons/tray-icon.png")
            };

            let tray_icon = load_tray_icon(&tray_icon_path)
                .or_else(|| app.default_window_icon().cloned());

            #[cfg(target_os = "macos")]
            {
                if let Some(icon) = tray_icon {
                    tray.icon(icon).icon_as_template(true).build(app)?;
                } else {
                    tray.build(app)?;
                }
            }

            #[cfg(not(target_os = "macos"))]
            {
                if let Some(icon) = tray_icon {
                    tray.icon(icon).build(app)?;
                } else {
                    tray.build(app)?;
                }
            }

            // Intercept window close
            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let db = app_handle.state::<Arc<Database>>();
                        let conn = db.conn().lock().unwrap();
                        let minimize = crate::database::dao::settings::SettingsDao::get_all(&conn)
                            .ok()
                            .and_then(|settings| {
                                settings.iter().find(|item| item.key == "minimize_to_tray").cloned()
                            })
                            .map(|item| item.value == "true")
                            .unwrap_or(true);

                        if minimize {
                            api.prevent_close();
                            if let Some(w) = app_handle.get_webview_window("main") {
                                w.hide().unwrap();
                            }
                        }
                    }
                });
            }

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

/// Load a dedicated tray icon from a PNG file.
/// Uses the `image` crate to decode the PNG, then constructs a tauri Image.
fn load_tray_icon(path: &std::path::Path) -> Option<Image<'static>> {
    let bytes = std::fs::read(path).ok()?;
    let img = image::load_from_memory(&bytes).ok()?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    Some(Image::new_owned(rgba.into_raw(), width, height))
}