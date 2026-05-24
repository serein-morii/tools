use thiserror::Error;

#[derive(Error, Debug)]
pub enum ToolsError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(String),

    #[error("Task not found: {0}")]
    TaskNotFound(String),


    #[error("Channel not found: {0}")]
    ChannelNotFound(String),

    #[error("Invalid cron expression: {0}")]
    InvalidCron(String),

    #[error("Notification failed: {0}")]
    NotificationFailed(String),

    #[error("Backup failed: {0}")]
    Backup(String),

    #[error("Auto-launch error: {0}")]
    AutoLaunch(String),

    #[error("Window error: {0}")]
    Window(String),
}

impl From<tauri::Error> for ToolsError {
    fn from(err: tauri::Error) -> Self {
        ToolsError::Window(err.to_string())
    }
}

impl From<tauri_plugin_autostart::Error> for ToolsError {
    fn from(err: tauri_plugin_autostart::Error) -> Self {
        ToolsError::AutoLaunch(err.to_string())
    }
}

#[cfg(target_os = "windows")]
impl From<winreg::Error> for ToolsError {
    fn from(err: winreg::Error) -> Self {
        ToolsError::AutoLaunch(err.to_string())
    }
}

impl From<reqwest::Error> for ToolsError {
    fn from(err: reqwest::Error) -> Self {
        ToolsError::Http(err.to_string())
    }
}

impl serde::Serialize for ToolsError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, ToolsError>;