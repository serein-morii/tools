use std::sync::Arc;
use std::thread;
use std::time::Duration;
use chrono::Utc;
use crate::database::Database;
use crate::database::dao::{settings::SettingsDao, gitlab_scan::{GitLabScanDao, CreateGitLabScanRequest}, channel::ChannelDao};
use crate::services::gitlab::{GitLabClient, GitLabScanner, ScanConfig, scanner::{FilterMode, ScanRange}};
use crate::services::gitlab::client::GitLabAuth;
use crate::error::Result;

pub fn start_gitlab_scheduler(db: Arc<Database>) {
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut last_check = Utc::now().timestamp();

            loop {
                tokio::time::sleep(Duration::from_secs(60)).await;

                if let Err(e) = run_gitlab_scheduler_cycle(&db, &mut last_check).await {
                    log::error!("GitLab scheduler cycle error: {}", e);
                }
            }
        });
    });
}

async fn run_gitlab_scheduler_cycle(db: &Arc<Database>, last_check: &mut i64) -> Result<()> {
    let now = Utc::now().timestamp();

    // Get GitLab config
    let config = {
        let conn = db.conn().lock().unwrap();
        get_gitlab_config_from_settings(&conn)?
    };

    // Check if GitLab is configured
    if config.url.is_empty() {
        return Ok(());
    }

    // Parse cron schedule
    let cron_expr = config.scan_schedule.clone();
    let schedule = match cron::Schedule::try_from(cron_expr.as_str()) {
        Ok(s) => s,
        Err(e) => {
            log::error!("Invalid GitLab scan schedule '{}': {}", cron_expr, e);
            return Ok(());
        }
    };

    // Check if we should run now
    let should_run = {
        let now_chrono = chrono::Local::now();
        let upcoming: Vec<_> = schedule.after(&now_chrono).take(1).collect();

        if let Some(next_time) = upcoming.first() {
            let next_ts = next_time.timestamp();
            // Run if next scheduled time is within the last minute
            next_ts <= now && next_ts > *last_check
        } else {
            false
        }
    };

    if should_run {
        *last_check = now;
        log::info!("Running scheduled GitLab scan");

        if let Err(e) = run_gitlab_scan(db, &config, "weekly").await {
            log::error!("GitLab scan failed: {}", e);
        }
    }

    Ok(())
}

pub async fn run_gitlab_scan(db: &Arc<Database>, config: &GitLabScanConfig, scan_type: &str) -> Result<()> {
    // Create GitLab client
    let auth = match config.auth_type.as_str() {
        "token" => {
            let token = config.token.clone().unwrap_or_default();
            if token.is_empty() {
                return Err(crate::error::ToolsError::Http("GitLab token not configured".to_string()));
            }
            GitLabAuth::Token(token)
        }
        "password" => {
            let username = config.username.clone().unwrap_or_default();
            let password = config.password.clone().unwrap_or_default();
            if username.is_empty() || password.is_empty() {
                return Err(crate::error::ToolsError::Http("GitLab username/password not configured".to_string()));
            }
            GitLabAuth::Password { username, password }
        }
        _ => return Err(crate::error::ToolsError::Http("Invalid auth type".to_string())),
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
        filter_projects: config.filter_projects.clone(),
        test_keywords: config.test_keywords.clone(),
        scan_range,
    };

    let scanner = GitLabScanner::new(client, scan_config);
    let result = scanner.scan(scan_type).await?;

    // Save scan result
    {
        let conn = db.conn().lock().unwrap();
        let now = Utc::now();
        let scan_range_start = now.format("%Y-%m-%d").to_string();

        let request = CreateGitLabScanRequest {
            scan_type: scan_type.to_string(),
            scan_range_start: Some(scan_range_start),
            scan_range_end: None,
            result: result.clone(),
        };

        GitLabScanDao::create(&conn, request)?;
    }

    // Send notification if channels configured
    if !config.scan_channels.is_empty() {
        if let Err(e) = send_gitlab_notification(db, &config.scan_channels, &result).await {
            log::error!("Failed to send GitLab notification: {}", e);
        }
    }

    Ok(())
}

async fn send_gitlab_notification(
    db: &Arc<Database>,
    channel_ids: &[String],
    result: &crate::services::gitlab::scanner::ScanResult
) -> Result<()> {
    let client = reqwest::Client::new();

    // Build notification message
    let title = "【GitLab周报】本周代码提交汇总".to_string();
    let test_coverage = if result.total_projects > 0 {
        format!("{}/{} ({}%)",
            result.test_projects,
            result.total_projects,
            (result.test_projects * 100 / result.total_projects)
        )
    } else {
        "0/0".to_string()
    };

    let content = format!(
        "📊 统计概览\n\
         • 扫描项目：{}个\n\
         • 代码提交：{}次\n\
         • 参与人员：{}人\n\
         • 单测覆盖：{}\n\n\
         📈 代码变更\n\
         • 新增：+{}行\n\
         • 删除：-{}行\n\n\
         ⚠️ 需关注项目\n\
         {}\n\n\
         🏆 本周贡献TOP3\n\
         {}\n\n\
         📅 扫描时间：{}",
        result.total_projects,
        result.total_commits,
        result.contributors.len(),
        test_coverage,
        result.total_lines_added,
        result.total_lines_removed,
        format_attention_projects(&result.projects),
        format_top_contributors(&result.contributors, &result.projects),
        chrono::Local::now().format("%Y-%m-%d %H:%M")
    );

    let conn = db.conn().lock().unwrap();

    for channel_id in channel_ids {
        if let Ok(Some(channel)) = ChannelDao::get_by_id(&conn, channel_id) {
            if !channel.enabled {
                continue;
            }

            let config: serde_json::Value = serde_json::from_str(&channel.config)
                .unwrap_or(serde_json::json!({}));

            let at_phones: Vec<String> = config["atPhones"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();

            let _ = match channel.type_.as_str() {
                "dingtalk" => {
                    let webhook_url = config["webhookUrl"].as_str().unwrap_or("");
                    let secret = config["secret"].as_str();
                    crate::services::notifier::dingtalk::send_dingtalk(
                        &client, webhook_url, secret, &title, &content,
                        if at_phones.is_empty() { None } else { Some(&at_phones) }
                    ).await
                }
                "feishu" => {
                    let webhook_url = config["webhookUrl"].as_str().unwrap_or("");
                    let secret = config["secret"].as_str();
                    crate::services::notifier::feishu::send_feishu(
                        &client, webhook_url, secret, &title, &content
                    ).await
                }
                "wecom" => {
                    let webhook_url = config["webhookUrl"].as_str().unwrap_or("");
                    crate::services::notifier::wecom::send_wecom(
                        &client, webhook_url, &title, &content
                    ).await
                }
                _ => Ok("skipped".to_string()),
            };
        }
    }

    Ok(())
}

fn format_attention_projects(projects: &[crate::services::gitlab::scanner::ProjectScanResult]) -> String {
    let no_test: Vec<_> = projects.iter()
        .filter(|p| !p.has_test)
        .take(3)
        .collect();

    let pending_mrs: Vec<_> = projects.iter()
        .filter(|p| p.pending_mrs > 0)
        .take(2)
        .collect();

    let mut lines = Vec::new();

    for p in no_test {
        let name = p.project_name.split('/').last().unwrap_or(&p.project_name);
        lines.push(format!("• {}：{}次提交，未发现单测", name, p.commits));
    }

    for p in pending_mrs {
        let name = p.project_name.split('/').last().unwrap_or(&p.project_name);
        lines.push(format!("• {}：{}个MR待审核", name, p.pending_mrs));
    }

    if lines.is_empty() {
        "• 无需关注项目".to_string()
    } else {
        lines.join("\n")
    }
}

fn format_top_contributors(
    contributors: &[String],
    projects: &[crate::services::gitlab::scanner::ProjectScanResult]
) -> String {
    use std::collections::HashMap;

    let mut commit_counts: HashMap<&str, i32> = HashMap::new();
    for project in projects {
        // This is a simplified count - in reality we'd track per-contributor
        let per_contributor = project.commits / project.contributors.len().max(1) as i32;
        for c in &project.contributors {
            *commit_counts.entry(c.as_str()).or_insert(0) += per_contributor;
        }
    }

    let mut sorted: Vec<_> = commit_counts.iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(a.1));

    sorted.iter()
        .take(3)
        .enumerate()
        .map(|(i, (name, count))| format!("{}. {}：{}次提交", i + 1, name, count))
        .collect::<Vec<_>>()
        .join("\n")
}

#[derive(Debug, Clone)]
pub struct GitLabScanConfig {
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

fn get_gitlab_config_from_settings(conn: &rusqlite::Connection) -> Result<GitLabScanConfig> {
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

    Ok(GitLabScanConfig {
        url: get_setting("gitlab_url", ""),
        auth_type: get_setting("gitlab_auth_type", "token"),
        token: get_setting_opt("gitlab_token"),
        username: get_setting_opt("gitlab_username"),
        password: get_setting_opt("gitlab_password"),
        filter_mode: get_setting("gitlab_filter_mode", "include"),
        filter_projects: parse_json_array("gitlab_filter_projects", vec!["basicdata".to_string()]),
        test_keywords: parse_json_array("gitlab_test_keywords", vec!["单测".to_string(), "测试".to_string()]),
        scan_schedule: get_setting("gitlab_scan_schedule", "0 9 * * 1"),
        scan_channels: parse_json_array("gitlab_scan_channels", vec![]),
        scan_range_type: get_setting("gitlab_scan_range_type", "week"),
        scan_range_days: get_setting("gitlab_scan_range_days", "7").parse().ok(),
    })
}
