use std::sync::Arc;
use std::thread;
use std::time::Duration;
use chrono::Utc;
use crate::database::Database;
use crate::database::dao::{settings::SettingsDao, gitlab_scan::{GitLabScanDao, CreateGitLabScanRequest}, channel::ChannelDao};
use crate::services::gitlab::{GitLabClient, GitLabScanner, ScanConfig, scanner::{FilterMode, ScanRange}};
use crate::services::gitlab::client::GitLabAuth;
use crate::services::walkin::{WalkinClient, WalkinAuth, ProjectMapping};
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
    let mut result = scanner.scan(scan_type).await?;

    // Fetch Walkin metrics if enabled
    if config.walkin_enabled && !config.walkin_url.is_empty() {
        let walkin_auth = WalkinAuth {
            csrf_token: config.walkin_csrf_token.clone(),
            project: config.walkin_project_header.clone(),
            workspace: config.walkin_workspace_name.clone(),
            x_auth_token: config.walkin_x_auth_token.clone(),
        };
        match WalkinClient::new(&config.walkin_url, walkin_auth, config.walkin_dept_name.clone(), config.walkin_workspace_name.clone()) {
            Ok(walkin_client) => {
                match walkin_client.fetch_project_metrics().await {
                    Ok(walkin_data) => {
                        result.merge_walkin_metrics(&walkin_data, &config.walkin_project_mappings);
                    }
                    Err(e) => {
                        log::warn!("Failed to fetch Walkin metrics: {}", e);
                    }
                }
            }
            Err(e) => {
                log::warn!("Failed to create Walkin client: {}", e);
            }
        }
    }

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
    if result.total_lines_added == 0 && result.total_lines_removed == 0 && result.total_commits == 0 {
        return Ok(());
    }

    let title = "【GitLab周报】本周代码提交汇总";

    let test_coverage = if result.total_projects > 0 {
        let pct = (result.test_projects * 100 / result.total_projects);
        format!("{}/{} ({}%)", result.test_projects, result.total_projects, pct)
    } else {
        "0/0".to_string()
    };

    // Format attention projects (only projects without tests)
    let no_test_projects: Vec<_> = result.projects
        .iter()
        .filter(|p| !p.has_test)
        .take(5)
        .collect();

    let attention_section = if no_test_projects.is_empty() {
        "• 所有项目均有单测覆盖".to_string()
    } else {
        let items: Vec<String> = no_test_projects.iter()
            .map(|p| {
                let name = p.project_name.split('/').last().unwrap_or(&p.project_name);
                format!("• {}：{}次提交，无单测", name, p.commits)
            })
            .collect();
        format!("以下项目有代码变更但缺少单测：\n{}", items.join("\n"))
    };

    // Format Walkin quality section
    let walkin_section = if result.walkin_projects_matched > 0 {
        format!(
            "🔍 代码质量\n\
             • 匹配项目：{}个\n\
             • Bug：{}个\n\
             • 漏洞：{}个\n\
             • 代码异味：{}个\n\
             • 平均覆盖率：{}%",
            result.walkin_projects_matched,
            result.walkin_total_bugs,
            result.walkin_total_vulnerabilities,
            result.walkin_total_code_smells,
            result.walkin_avg_coverage.map_or("N/A".to_string(), |c| format!("{:.1}", c))
        )
    } else {
        String::new()
    };

    // Format top 3 contributors
    let top3: Vec<String> = result.developer_stats.iter()
        .take(3)
        .enumerate()
        .map(|(i, dev)| format!("{}. {}：{}次提交", i + 1, dev.name, dev.commits))
        .collect();

    let mut content = format!(
        "📊 统计概览\n\
         • 扫描项目：{}个\n\
         • 代码提交：{}次\n\
         • 参与人员：{}人\n\
         • 单测覆盖：{}\n\n\
         📈 代码变更\n\
         • 新增：+{}行\n\
         • 删除：-{}行\n\n\
         ⚠️ 需关注项目\n\
         {}",
        result.total_projects,
        result.total_commits,
        result.contributors.len(),
        test_coverage,
        result.total_lines_added,
        result.total_lines_removed,
        attention_section,
    );

    if !walkin_section.is_empty() {
        content.push_str(&format!("\n\n{}", walkin_section));
    }

    content.push_str(&format!(
        "\n\n🏆 本周贡献TOP3\n\
         {}\n\n\
         📅 扫描时间：{}",
        top3.join("\n"),
        chrono::Local::now().format("%Y-%m-%d %H:%M")
    ));

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

            let client = reqwest::Client::new();
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
    pub walkin_enabled: bool,
    pub walkin_url: String,
    pub walkin_dept_name: String,
    pub walkin_dept_id: String,
    pub walkin_workspace_name: String,
    pub walkin_csrf_token: String,
    pub walkin_project_header: String,
    pub walkin_x_auth_token: String,
    pub walkin_project_mappings: Vec<ProjectMapping>,
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

    let parse_project_mappings = || -> Vec<ProjectMapping> {
        settings.iter()
            .find(|s| s.key == "walkin_project_mappings")
            .and_then(|s| serde_json::from_str(&s.value).ok())
            .unwrap_or_default()
    };

    Ok(GitLabScanConfig {
        url: get_setting("gitlab_url", ""),
        auth_type: get_setting("gitlab_auth_type", "token"),
        token: get_setting_opt("gitlab_token"),
        username: get_setting_opt("gitlab_username"),
        password: get_setting_opt("gitlab_password"),
        filter_mode: get_setting("gitlab_filter_mode", "include"),
        filter_projects: parse_json_array("gitlab_filter_projects", vec!["basicdata".to_string()]),
        test_keywords: parse_json_array("gitlab_test_keywords", vec!["单测".to_string(), "测试".to_string(), "test".to_string(), "spec".to_string()]),
        scan_schedule: get_setting("gitlab_scan_schedule", "0 9 * * 1"),
        scan_channels: parse_json_array("gitlab_scan_channels", vec![]),
        scan_range_type: get_setting("gitlab_scan_range_type", "week"),
        scan_range_days: get_setting("gitlab_scan_range_days", "7").parse().ok(),
        walkin_enabled: get_setting("walkin_enabled", "false") == "true",
        walkin_url: get_setting("walkin_url", ""),
        walkin_dept_name: get_setting("walkin_dept_name", ""),
        walkin_dept_id: get_setting("walkin_dept_id", ""),
        walkin_workspace_name: get_setting("walkin_workspace_name", ""),
        walkin_csrf_token: get_setting("walkin_csrf_token", ""),
        walkin_project_header: get_setting("walkin_project_header", ""),
        walkin_x_auth_token: get_setting("walkin_x_auth_token", ""),
        walkin_project_mappings: parse_project_mappings(),
    })
}
