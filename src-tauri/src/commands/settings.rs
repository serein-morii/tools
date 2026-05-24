use std::sync::Arc;

use serde::Deserialize;
use tauri::{Manager, State};

use crate::database::{dao::settings::{Setting, SettingsDao}, Database};
use crate::error::Result;

#[derive(Debug, Deserialize)]
pub struct UpdateSettingRequest {
    pub key: String,
    pub value: String,
}

#[tauri::command]
pub fn get_settings(db: State<'_, Arc<Database>>) -> Result<Vec<Setting>> {
    let conn = db.conn().lock().unwrap();
    SettingsDao::get_all(&conn)
}

#[tauri::command]
pub fn update_setting(db: State<'_, Arc<Database>>, request: UpdateSettingRequest) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    SettingsDao::update(&conn, &request.key, &request.value)
}

#[tauri::command]
pub fn set_auto_launch(enabled: bool) -> Result<bool> {
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_autostart::ManagerExt;
        let app_handle = crate::APP_HANDLE.lock().unwrap();
        if let Some(app) = app_handle.as_ref() {
            let manager = app.autolaunch();
            if enabled {
                manager.enable()?;
            } else {
                manager.disable()?;
            }
            return Ok(enabled);
        }
        Err(crate::error::ToolsError::AutoLaunch("App handle not available".to_string()))
    }

    #[cfg(target_os = "windows")]
    {
        use winreg::RegKey;
        use winreg::enums::*;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
        let (key, _) = hkcu.create_subkey(path)?;
        let app_name = "Tools";
        if enabled {
            let exe_path = std::env::current_exe()?;
            key.set_value(app_name, &exe_path.to_string_lossy().to_string())?;
        } else {
            let _ = key.delete_value(app_name);
        }
        Ok(enabled)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = enabled;
        Ok(false)
    }
}

#[tauri::command]
pub fn get_auto_launch_status() -> Result<bool> {
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_autostart::ManagerExt;
        let app_handle = crate::APP_HANDLE.lock().unwrap();
        if let Some(app) = app_handle.as_ref() {
            let manager = app.autolaunch();
            return Ok(manager.is_enabled()?);
        }
        Ok(false)
    }

    #[cfg(target_os = "windows")]
    {
        use winreg::RegKey;
        use winreg::enums::*;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
        let key = hkcu.open_subkey(path)?;
        let app_name = "Tools";
        Ok(key.get_value::<String, _>(app_name).is_ok())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(false)
    }
}

#[tauri::command]
pub fn set_window_theme(app: tauri::AppHandle, theme: String) -> Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        match theme.as_str() {
            "light" => {
                window.set_theme(Some(tauri::Theme::Light))?;
            }
            "dark" => {
                window.set_theme(Some(tauri::Theme::Dark))?;
            }
            "system" | _ => {
                window.set_theme(None)?;
            }
        }
    }
    Ok(())
}
