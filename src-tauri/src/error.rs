use thiserror::Error;

#[derive(Error, Debug)]
pub enum ToolsError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Task not found: {0}")]
    TaskNotFound(String),

    #[error("Template not found: {0}")]
    TemplateNotFound(String),

    #[error("Channel not found: {0}")]
    ChannelNotFound(String),

    #[error("Invalid cron expression: {0}")]
    InvalidCron(String),

    #[error("Notification failed: {0}")]
    NotificationFailed(String),
}

pub type Result<T> = std::result::Result<T, ToolsError>;