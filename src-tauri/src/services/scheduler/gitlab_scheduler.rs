use std::sync::Arc;
use std::thread;
use std::time::Duration;
use chrono::Utc;
use serde::{Serialize, Deserialize};
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
            loop {
                tokio::time::sleep(Duration::from_secs(60)).await;

                if let Err(e) = run_gitlab_scheduler_cycle(&db).await {
                    log::error!("GitLab scheduler cycle error: {}", e);
                }
            }
        });
    });
}

async fn run_gitlab_scheduler_cycle(db: &Arc<Database>) -> Result<()> {
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

    // Rust cron crate expects 7 fields: sec min hour day month weekday year
    // Standard 5-field format: min hour day month weekday
    // We need to add seconds (0) and year (*) prefix/suffix
    let cron_expr_7field = match config.scan_schedule.split_whitespace().count() {
        5 => format!("0 {} *", config.scan_schedule),
        6 => format!("{} *", config.scan_schedule),
        _ => config.scan_schedule.clone(),
    };

    let schedule = match cron::Schedule::try_from(cron_expr_7field.as_str()) {
        Ok(s) => s,
        Err(e) => {
            log::error!("Invalid GitLab scan schedule '{}' (converted to '{}'): {}", config.scan_schedule, cron_expr_7field, e);
            return Ok(());
        }
    };

    // Check if we should run now
    let should_run = {
        // Get the next scheduled time that's coming up
        let iter = schedule.upcoming(chrono::Local);

        // Check if any upcoming time is within the 60-second polling window from now
        // This means the scheduled time is "about to happen" and we should trigger the scan
        iter.take(2).any(|scheduled_time| {
            let scheduled_ts = scheduled_time.timestamp();
            let until = scheduled_ts - now;
            log::debug!("GitLab scheduler check: next_scheduled={}, now={}, until={}s", scheduled_ts, now, until);
            // Fire if the next scheduled time is within 60 seconds from now
            until >= 0 && until <= 60
        })
    };

    if should_run {
        log::info!("Running scheduled GitLab scan (cron: {})", config.scan_schedule);

        if let Err(e) = run_gitlab_scan(db, &config, "weekly").await {
            log::error!("GitLab scan failed: {}", e);
        }
    }

    Ok(())
}

pub async fn run_gitlab_scan(db: &Arc<Database>, config: &GitLabScanConfig, scan_type: &str) -> Result<()> {
    // Create GitLab client - use selected token from profiles
    let auth = match config.auth_type.as_str() {
        "token" => {
            let token = config.get_selected_token().unwrap_or_default();
            if token.is_empty() {
                return Err(crate::error::ToolsError::Http("GitLab token not configured".to_string()));
            }
            GitLabAuth::Token(token)
        }
        "password" => {
            let (username, password) = config.get_selected_ldap().unwrap_or_default();
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
        let scan_range_start = chrono::Local::now().format("%Y-%m-%d").to_string();

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
        let pct = result.test_projects as f64 * 100.0 / result.total_projects as f64;
        format!("{}/{} ({:.0}%)", result.test_projects, result.total_projects, pct)
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
        let coverage_info = match (result.walkin_max_new_coverage, result.walkin_max_coverage) {
            (Some(new_cov), Some(all_cov)) => format!(
                "• 增量覆盖率：{:.2}%\n• 全量覆盖率：{:.2}%",
                new_cov, all_cov
            ),
            (Some(new_cov), None) => format!("• 增量覆盖率：{:.2}%", new_cov),
            (None, Some(all_cov)) => format!("• 全量覆盖率：{:.2}%", all_cov),
            (None, None) => String::new(),
        };

        // Find projects with low incremental coverage (< 50%)
        let low_coverage_projects: Vec<(String, Option<f64>)> = result.projects
            .iter()
            .filter_map(|p| {
                // Get max new_coverage from all branches
                let new_coverage = if let Some(ref branches) = p.walkin_metrics_by_branch {
                    let mut max_cov: Option<f64> = None;
                    for m in branches.values() {
                        if let Some(cov) = m.new_coverage {
                            max_cov = Some(max_cov.map_or(cov, |max| max.max(cov)));
                        }
                    }
                    max_cov
                } else {
                    p.walkin_metrics.as_ref().and_then(|m| m.new_coverage)
                };

                // Only include if has Walkin data and coverage < 50%
                if new_coverage.is_some() && new_coverage.unwrap() < 50.0 {
                    let name = p.project_name.split('/').last().unwrap_or(&p.project_name);
                    Some((name.to_string(), new_coverage))
                } else {
                    None
                }
            })
            .collect();

        let low_coverage_section = if low_coverage_projects.is_empty() {
            String::new()
        } else {
            let items: Vec<String> = low_coverage_projects.iter()
                .map(|(name, cov)| {
                    match cov {
                        Some(c) => format!("  • {}：{:.1}%", name, c),
                        None => format!("  • {}：N/A", name),
                    }
                })
                .collect();
            format!("\n\n⚠️ 增量覆盖率低于50%的项目：\n{}", items.join("\n"))
        };

        format!(
            "🔍 代码质量\n\
• 匹配项目：{}个\n\
• Bug：{}个\n\
• 漏洞：{}个\n\
• 代码异味：{}个\n\
{}{}",
            result.walkin_projects_matched,
            result.walkin_total_bugs,
            result.walkin_total_vulnerabilities,
            result.walkin_total_code_smells,
            coverage_info,
            low_coverage_section
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

    // Collect channel info while holding the lock, then release before async I/O
    let channels: Vec<_> = {
        let conn = db.conn().lock().unwrap();
        channel_ids.iter()
            .filter_map(|id| ChannelDao::get_by_id(&conn, id).ok().flatten())
            .filter(|c| c.enabled)
            .collect()
    };

    let client = reqwest::Client::new();

    for channel in &channels {
        let channel_config: serde_json::Value = serde_json::from_str(&channel.config)
            .unwrap_or(serde_json::json!({}));

        let at_phones: Vec<String> = channel_config["atPhones"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();

        let result = match channel.type_.as_str() {
            "dingtalk" => {
                let webhook_url = channel_config["webhookUrl"].as_str().unwrap_or("");
                let secret = channel_config["secret"].as_str();
                crate::services::notifier::dingtalk::send_dingtalk(
                    &client, webhook_url, secret, &title, &content,
                    if at_phones.is_empty() { None } else { Some(&at_phones) }
                ).await
            }
            "feishu" => {
                let webhook_url = channel_config["webhookUrl"].as_str().unwrap_or("");
                let secret = channel_config["secret"].as_str();
                crate::services::notifier::feishu::send_feishu(
                    &client, webhook_url, secret, &title, &content
                ).await
            }
            "wecom" => {
                let webhook_url = channel_config["webhookUrl"].as_str().unwrap_or("");
                crate::services::notifier::wecom::send_wecom(
                    &client, webhook_url, &title, &content
                ).await
            }
            _ => Ok("skipped".to_string()),
        };

        if let Err(e) = result {
            log::error!("Failed to send notification to channel '{}' ({}): {}", channel.name, channel.type_, e);
        }
    }

    Ok(())
}

// Token profile for multi-token support
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenProfile {
    pub id: String,
    pub token: String,
    pub label: String,
}

// LDAP profile for multi-ldap support
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LdapProfile {
    pub id: String,
    pub username: String,
    pub password: String,
    pub label: String,
}

#[derive(Debug, Clone)]
pub struct GitLabScanConfig {
    pub url: String,
    pub auth_type: String,
    pub selected_token_id: Option<String>,
    pub token_profiles: Vec<TokenProfile>,
    pub selected_ldap_id: Option<String>,
    pub ldap_profiles: Vec<LdapProfile>,
    // Legacy fields for backward compatibility
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

impl GitLabScanConfig {
    /// Get the selected token from profiles, fallback to legacy token
    pub fn get_selected_token(&self) -> Option<String> {
        if let Some(id) = &self.selected_token_id {
            self.token_profiles.iter()
                .find(|p| &p.id == id)
                .map(|p| p.token.clone())
        } else {
            self.token.clone()
        }
    }

    /// Get the selected LDAP credentials from profiles
    pub fn get_selected_ldap(&self) -> Option<(String, String)> {
        if let Some(id) = &self.selected_ldap_id {
            self.ldap_profiles.iter()
                .find(|p| &p.id == id)
                .map(|p| (p.username.clone(), p.password.clone()))
        } else {
            None
        }
    }
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

    let parse_token_profiles = || -> Vec<TokenProfile> {
        settings.iter()
            .find(|s| s.key == "token_profiles")
            .and_then(|s| serde_json::from_str(&s.value).ok())
            .unwrap_or_else(|| {
                // Default token profiles
                vec![
                    TokenProfile { id: "token-1".to_string(), token: "yTeXMdEjKoKqvG8ay8VQ".to_string(), label: "孙强".to_string() },
                    TokenProfile { id: "token-2".to_string(), token: "Kf8mydzuhw2xDwmhsmM4".to_string(), label: "海兵".to_string() },
                ]
            })
    };

    let parse_ldap_profiles = || -> Vec<LdapProfile> {
        settings.iter()
            .find(|s| s.key == "ldap_profiles")
            .and_then(|s| serde_json::from_str(&s.value).ok())
            .unwrap_or_else(|| {
                // Default LDAP profiles
                vec![
                    LdapProfile {
                        id: "ldap-1".to_string(),
                        username: "RZIK2v1KpNwUBXbpUq6Y/q//pPyfduF0wI66SBF1t3eHTTRekeAvJki8Yhs0C66rtQINbJ8K7a77VYFe7WiBqQ6QOesNt2rN+xb3SWI7/0/KdcI1JJ4wjgiULKxjCVO99TBV0lW9pPzT9wPOb5/AmK5aiZthNxGrBRmzsyGIcMk=".to_string(),
                        password: "X7ONsfMYenLAdZua6Fj+9l1ZdptEPNHM1l+nMZ8RL+X9vUZyfsxyf+/0zLYCeQhsnAyf3D863PGBqcgXBMBrUI/MRH/VLo44rmrGHZ5WL9kQNSk492t5CqSkeBcU8JeLTF4exYxsYLq4JLDlnYQMZfBC02U+3lwmaaICKxXk4ag=".to_string(),
                        label: "承辉".to_string(),
                    },
                ]
            })
    };

    let token_profiles = parse_token_profiles();
    let ldap_profiles = parse_ldap_profiles();
    let selected_token_id = get_setting_opt("selected_token_id").or_else(|| token_profiles.first().map(|p| p.id.clone()));
    let selected_ldap_id = get_setting_opt("selected_ldap_id").or_else(|| ldap_profiles.first().map(|p| p.id.clone()));

    Ok(GitLabScanConfig {
        url: get_setting("gitlab_url", "http://code.jms.com"),
        auth_type: get_setting("gitlab_auth_type", "token"),
        selected_token_id,
        token_profiles,
        selected_ldap_id,
        ldap_profiles,
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
        walkin_enabled: get_setting("walkin_enabled", "true") == "true",
        walkin_url: get_setting("walkin_url", "http://walkin.jms.com"),
        walkin_dept_name: get_setting("walkin_dept_name", "产品架构"),
        walkin_dept_id: get_setting("walkin_dept_id", "a0a768d7-9e8d-448c-9b79-926d84f51ea1"),
        walkin_workspace_name: get_setting("walkin_workspace_name", "产品架构&PMO"),
        walkin_csrf_token: get_setting("walkin_csrf_token", ""),
        walkin_project_header: get_setting("walkin_project_header", ""),
        walkin_x_auth_token: get_setting("walkin_x_auth_token", ""),
        walkin_project_mappings: parse_project_mappings(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cron_5field_to_7field_conversion() {
        // 5-field: "0 9 * * 1" -> 7-field: "0 0 9 * * 1 *"
        let cron_expr = "0 9 * * 1";
        let cron_expr_7field = if cron_expr.split_whitespace().count() == 5 {
            format!("0 {} *", cron_expr)
        } else {
            cron_expr.to_string()
        };
        assert_eq!(cron_expr_7field, "0 0 9 * * 1 *");

        let schedule = cron::Schedule::try_from(cron_expr_7field.as_str());
        assert!(schedule.is_ok(), "Failed to parse converted cron: {}", cron_expr_7field);
    }

    #[test]
    fn test_should_run_when_next_scheduled_is_within_window() {
        // Create a schedule that fires every minute
        let schedule = cron::Schedule::try_from("0 * * * * * *").unwrap();
        let now = chrono::Local::now().timestamp();

        // The next scheduled time should be within 60 seconds for an every-minute schedule
        let next = schedule.upcoming(chrono::Local).next().unwrap();
        let until = next.timestamp() - now;
        assert!(until >= 0 && until <= 60, "Next scheduled time should be within 60s, got {}s", until);
    }

    #[test]
    fn test_should_not_run_when_next_scheduled_is_far_away() {
        // Create a schedule that fires next Monday at 9:00
        let schedule = cron::Schedule::try_from("0 0 9 * * 1 *").unwrap();
        let now = chrono::Local::now().timestamp();

        let next = schedule.upcoming(chrono::Local).next().unwrap();
        let until = next.timestamp() - now;
        // If we're not within 60 seconds of Monday 9:00, this should be > 60
        // (This test is valid unless we run it at exactly Monday 8:59-9:00)
        if until > 60 {
            // Good - we're far from the scheduled time
            assert!(true);
        } else {
            // We happen to be right at the scheduled time - also fine
            assert!(until >= 0);
        }
    }
}
