mod commands;
mod database;
mod error;
mod services;

use std::sync::{Arc, Mutex};
use database::{Database, init_schema};
use services::scheduler::{start_scheduler, start_gitlab_scheduler};
use tauri::Manager;
use tauri::Emitter;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItem};

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

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--silent"]),
        ))
        .manage(db)
        .invoke_handler(tauri::generate_handler![
            commands::get_tasks,
            commands::get_task,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
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
            commands::get_notes,
            commands::get_note,
            commands::create_note,
            commands::update_note,
            commands::delete_note,
            commands::search_notes,
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
            commands::walkin_check_login,
        ])
        .setup(|app| {
            // Store app handle for auto-launch
            {
                let mut handle = APP_HANDLE.lock().unwrap();
                *handle = Some(app.handle().clone());
            }

            // Build tray menu
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let new_task_item = MenuItem::with_id(app, "new_task", "新建任务", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&new_task_item)
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

            #[cfg(target_os = "macos")]
            {
                if let Some(icon) = app.default_window_icon() {
                    tray.icon(icon.clone()).icon_as_template(true).build(app)?;
                }
            }

            #[cfg(not(target_os = "macos"))]
            {
                if let Some(icon) = app.default_window_icon() {
                    tray.icon(icon.clone()).build(app)?;
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