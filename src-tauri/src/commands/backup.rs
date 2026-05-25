use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::database::{dao::backup::{BackupCounts, BackupDao, BackupData}, Database};
use crate::error::{Result, ToolsError};

#[derive(Debug, Deserialize)]
pub struct ExportBackupRequest {
    pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ImportBackupRequest {
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct BackupExportResult {
    pub path: String,
    pub counts: BackupCounts,
}

#[derive(Debug, Serialize)]
pub struct BackupImportResult {
    pub counts: BackupCounts,
}

#[tauri::command]
pub fn export_backup(db: State<'_, Arc<Database>>, request: Option<ExportBackupRequest>) -> Result<BackupExportResult> {
    let path = match request.and_then(|item| item.path) {
        Some(path) if !path.trim().is_empty() => PathBuf::from(path),
        _ => default_backup_path()?,
    };

    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err(ToolsError::Backup(format!("Backup directory does not exist: {}", parent.display())));
        }
    }

    let conn = db.conn().lock().unwrap();
    let data = BackupDao::export_data(&conn)?;
    let counts = BackupCounts {
        tasks: data.tasks.len(),
        channels: data.channels.len(),
        templates: data.templates.len(),
        settings: data.settings.len(),
        quick_notes: data.quick_notes.len(),
    };
    let content = serde_json::to_string_pretty(&data)?;
    std::fs::write(&path, content)?;

    Ok(BackupExportResult {
        path: path.to_string_lossy().to_string(),
        counts,
    })
}

#[tauri::command]
pub fn import_backup(db: State<'_, Arc<Database>>, request: ImportBackupRequest) -> Result<BackupImportResult> {
    let content = std::fs::read_to_string(&request.path)?;
    let data: BackupData = serde_json::from_str(&content)?;
    let mut conn = db.conn().lock().unwrap();
    let counts = BackupDao::import_data(&mut conn, data)?;

    Ok(BackupImportResult { counts })
}

fn default_backup_path() -> Result<PathBuf> {
    let downloads = dirs::download_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| ToolsError::Backup("Cannot resolve backup directory".to_string()))?;
    Ok(downloads.join(format!("tools-backup-{}.json", Utc::now().format("%Y%m%d-%H%M%S"))))
}
