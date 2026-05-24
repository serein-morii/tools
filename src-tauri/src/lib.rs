mod commands;
mod database;
mod error;

use std::sync::Arc;
use database::{Database, init_schema};

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

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(db)
        .invoke_handler(tauri::generate_handler![
            commands::get_tasks,
            commands::get_task,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
            commands::toggle_task,
        ])
        .setup(|app| {
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