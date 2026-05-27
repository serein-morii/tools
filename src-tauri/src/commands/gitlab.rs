use std::sync::Arc;
use tauri::State;
use serde::{Deserialize, Serialize};
use crate::database::{Database, dao::settings::SettingsDao, dao::gitlab_scan::{GitLabScanDao, GitLabScanHistory, CreateGitLabScanRequest}};
use crate::services::gitlab::{GitLabClient, GitLabScanner, ScanConfig, ScanResult, scanner::{FilterMode, ScanRange}};
use crate::services::gitlab::client::GitLabAuth;
use crate::error::{Result, ToolsError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabConfig {
    pub url: String,
    pub auth_type: String,
    pub token: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub filter_mode: String,
    pub filter_projects: Vec<String>,
    pub test_keywords: Vec<String>,
    pub scan_schedule: String,
    pub scan_channels: Vec<String>,
    pub scan_range_type: String,
    pub scan_range_days: Option<i32>,
}

impl Default for GitLabConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            auth_type: "token".to_string(),
            token: None,
            username: None,
            password: None,
            filter_mode: "include".to_string(),
            filter_projects: vec!["basicdata".to_string(), "lmdm".to_string(), "network".to_string()],
            test_keywords: vec!["单测".to_string(), "测试".to_string(), "用例".to_string(), "test".to_string()],
            scan_schedule: "0 9 * * 1".to_string(),
            scan_channels: vec![],
            scan_range_type: "week".to_string(),
            scan_range_days: Some(7),
        }
    }
}

fn get_gitlab_config_from_settings(conn: &rusqlite::Connection) -> Result<GitLabConfig> {
    let settings = SettingsDao::get_all(conn)?;

    let get_setting = |key: &str, default: &str| -> String {
        settings.iter()
            .find(|s| s.key == key)
            .map(|s| s.value.clone())
            .unwrap_or_else(|| default.to_string())
    };

    let get_setting_opt = |key: &str| -> Option<String> {
        settings.iter()
            .find(|s| s.key == key)
            .map(|s| s.value.clone())
            .filter(|v| !v.is_empty() && v != "\"\"")
    };

    let parse_json_array = |key: &str, default: Vec<String>| -> Vec<String> {
        settings.iter()
            .find(|s| s.key == key)
            .and_then(|s| serde_json::from_str(&s.value).ok())
            .unwrap_or(default)
    };

    Ok(GitLabConfig {
        url: get_setting("gitlab_url", ""),
        auth_type: get_setting("gitlab_auth_type", "token"),
        token: get_setting_opt("gitlab_token"),
        username: get_setting_opt("gitlab_username"),
        password: get_setting_opt("gitlab_password"),
        filter_mode: get_setting("gitlab_filter_mode", "include"),
        filter_projects: parse_json_array("gitlab_filter_projects", vec!["basicdata".to_string(), "lmdm".to_string()]),
        test_keywords: parse_json_array("gitlab_test_keywords", vec!["单测".to_string(), "测试".to_string()]),
        scan_schedule: get_setting("gitlab_scan_schedule", "0 9 * * 1"),
        scan_channels: parse_json_array("gitlab_scan_channels", vec![]),
        scan_range_type: get_setting("gitlab_scan_range_type", "week"),
        scan_range_days: get_setting("gitlab_scan_range_days", "7").parse().ok(),
    })
}

fn save_gitlab_config_to_settings(conn: &rusqlite::Connection, config: &GitLabConfig) -> Result<()> {
    SettingsDao::upsert(conn, "gitlab_url", &config.url)?;
    SettingsDao::upsert(conn, "gitlab_auth_type", &config.auth_type)?;

    if let Some(token) = &config.token {
        SettingsDao::upsert(conn, "gitlab_token", token)?;
    }
    if let Some(username) = &config.username {
        SettingsDao::upsert(conn, "gitlab_username", username)?;
    }
    if let Some(password) = &config.password {
        SettingsDao::upsert(conn, "gitlab_password", password)?;
    }

    SettingsDao::upsert(conn, "gitlab_filter_mode", &config.filter_mode)?;
    SettingsDao::upsert(conn, "gitlab_filter_projects", &serde_json::to_string(&config.filter_projects).unwrap_or_else(|_| "[]".to_string()))?;
    SettingsDao::upsert(conn, "gitlab_test_keywords", &serde_json::to_string(&config.test_keywords).unwrap_or_else(|_| "[]".to_string()))?;
    SettingsDao::upsert(conn, "gitlab_scan_schedule", &config.scan_schedule)?;
    SettingsDao::upsert(conn, "gitlab_scan_channels", &serde_json::to_string(&config.scan_channels).unwrap_or_else(|_| "[]".to_string()))?;
    SettingsDao::upsert(conn, "gitlab_scan_range_type", &config.scan_range_type)?;

    if let Some(days) = config.scan_range_days {
        SettingsDao::upsert(conn, "gitlab_scan_range_days", &days.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_gitlab_config(db: State<'_, Arc<Database>>) -> Result<GitLabConfig> {
    let conn = db.conn().lock().unwrap();
    get_gitlab_config_from_settings(&conn)
}

#[tauri::command]
pub fn save_gitlab_config(db: State<'_, Arc<Database>>, config: GitLabConfig) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    save_gitlab_config_to_settings(&conn, &config)
}

#[tauri::command]
pub async fn test_gitlab_connection(config: GitLabConfig) -> Result<bool> {
    let auth = match config.auth_type.as_str() {
        "token" => {
            let token = config.token.clone().unwrap_or_default();
            if token.is_empty() {
                return Err(ToolsError::Http("Token is required".to_string()));
            }
            GitLabAuth::Token(token)
        }
        "password" => {
            let username = config.username.clone().unwrap_or_default();
            let password = config.password.clone().unwrap_or_default();
            if username.is_empty() || password.is_empty() {
                return Err(ToolsError::Http("Username and password are required".to_string()));
            }
            GitLabAuth::Password { username, password }
        }
        _ => return Err(ToolsError::Http("Invalid auth type".to_string())),
    };

    let client = GitLabClient::new(&config.url, auth)?;
    client.test_connection().await
}

#[tauri::command]
pub async fn trigger_gitlab_scan(db: State<'_, Arc<Database>>, scan_type: String) -> Result<ScanResult> {
    let config = {
        let conn = db.conn().lock().unwrap();
        get_gitlab_config_from_settings(&conn)?
    };

    if config.url.is_empty() {
        return Err(ToolsError::Http("GitLab URL is not configured".to_string()));
    }

    let auth = match config.auth_type.as_str() {
        "token" => GitLabAuth::Token(config.token.clone().unwrap_or_default()),
        "password" => GitLabAuth::Password {
            username: config.username.clone().unwrap_or_default(),
            password: config.password.clone().unwrap_or_default(),
        },
        _ => return Err(ToolsError::Http("Invalid auth type".to_string())),
    };

    let client = GitLabClient::new(&config.url, auth)?;

    let filter_mode = match config.filter_mode.as_str() {
        "include" => FilterMode::Include,
        "exclude" => FilterMode::Exclude,
        _ => FilterMode::All,
    };

    let scan_range = match config.scan_range_type.as_str() {
        "days" => ScanRange::Days(config.scan_range_days.unwrap_or(7)),
        _ => ScanRange::Week,
    };

    let scan_config = ScanConfig {
        filter_mode,
        filter_projects: config.filter_projects,
        test_keywords: config.test_keywords,
        scan_range,
    };

    let scanner = GitLabScanner::new(client, scan_config);
    let result = scanner.scan(&scan_type).await?;

    // Save scan result to history
    {
        let conn = db.conn().lock().unwrap();
        let now = chrono::Utc::now();
        let scan_range_start = now.format("%Y-%m-%d").to_string();

        let request = CreateGitLabScanRequest {
            scan_type: scan_type.clone(),
            scan_range_start: Some(scan_range_start),
            scan_range_end: None,
            result: result.clone(),
        };

        GitLabScanDao::create(&conn, request)?;
    }

    Ok(result)
}

#[tauri::command]
pub fn get_gitlab_scan_history(db: State<'_, Arc<Database>>, limit: Option<i32>) -> Result<Vec<GitLabScanHistory>> {
    let conn = db.conn().lock().unwrap();
    GitLabScanDao::get_all(&conn, limit)
}

#[tauri::command]
pub fn get_gitlab_scan_detail(db: State<'_, Arc<Database>>, id: String) -> Result<GitLabScanHistory> {
    let conn = db.conn().lock().unwrap();
    GitLabScanDao::get_by_id(&conn, &id)?
        .ok_or_else(|| ToolsError::TaskNotFound(id))
}

#[tauri::command]
pub fn delete_gitlab_scan_history(db: State<'_, Arc<Database>>, id: String) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    GitLabScanDao::delete(&conn, &id)
}

#[tauri::command]
pub fn get_gitlab_configured(db: State<'_, Arc<Database>>) -> Result<bool> {
    let conn = db.conn().lock().unwrap();
    let config = get_gitlab_config_from_settings(&conn)?;
    Ok(!config.url.is_empty() && (config.token.is_some() || (config.username.is_some() && config.password.is_some())))
}
