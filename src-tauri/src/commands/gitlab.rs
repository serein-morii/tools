use std::sync::Arc;
use std::collections::HashSet;
use tauri::{State, AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use crate::database::{Database, dao::settings::SettingsDao, dao::gitlab_scan::{GitLabScanDao, GitLabScanHistory, CreateGitLabScanRequest}, dao::channel::ChannelDao};
use crate::services::gitlab::{GitLabClient, GitLabScanner, ScanConfig, ScanResult, scanner::{FilterMode, ScanRange, ScanProgress}};
use crate::services::gitlab::client::GitLabAuth;
use crate::services::gitlab::notifier::send_scan_notification;
use crate::services::walkin::{WalkinClient, WalkinAuth, ProjectMapping, CaptchaData, WalkinSigninResponse, UnitBoardData, LoginStatusResult, get_captcha, ldap_signin, auto_login, AutoLoginResult, check_walkin_login};
use crate::error::{Result, ToolsError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenProfile {
    pub id: String,
    pub token: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LdapProfile {
    pub id: String,
    pub username: String,
    pub password: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabConfig {
    pub url: String,
    pub auth_type: String,
    // Multi-token support
    pub token_profiles: Vec<TokenProfile>,
    pub selected_token_ids: Vec<String>,
    // Multi-LDAP support
    pub ldap_profiles: Vec<LdapProfile>,
    pub selected_ldap_id: Option<String>,
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
    pub walkin_username: String,
    pub walkin_password: String,
    pub walkin_dept_name: String,
    pub walkin_dept_id: String,
    pub walkin_workspace_name: String,
    pub walkin_csrf_token: String,
    pub walkin_project_header: String,
    pub walkin_x_auth_token: String,
    pub walkin_project_mappings: Vec<ProjectMapping>,
}

impl Default for GitLabConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            auth_type: "token".to_string(),
            token_profiles: vec![
                TokenProfile { id: "token-1".to_string(), token: "yTeXMdEjKoKqvG8ay8VQ".to_string(), label: "孙强".to_string() },
                TokenProfile { id: "token-2".to_string(), token: "Kf8mydzuhw2xDwmhsmM4".to_string(), label: "海兵".to_string() },
            ],
            selected_token_ids: vec!["token-1".to_string(), "token-2".to_string()],
            ldap_profiles: vec![],
            selected_ldap_id: None,
            token: None,
            username: None,
            password: None,
            filter_mode: "include".to_string(),
            filter_projects: vec!["basicdata".to_string(), "lmdm".to_string(), "network".to_string()],
            test_keywords: vec!["单测".to_string(), "测试".to_string(), "用例".to_string(), "test".to_string(), "spec".to_string()],
            scan_schedule: "0 9 * * 1".to_string(),
            scan_channels: vec![],
            scan_range_type: "week".to_string(),
            scan_range_days: Some(7),
            walkin_enabled: false,
            walkin_url: String::new(),
            walkin_username: String::new(),
            walkin_password: String::new(),
            walkin_dept_name: String::new(),
            walkin_dept_id: String::new(),
            walkin_workspace_name: String::new(),
            walkin_csrf_token: String::new(),
            walkin_project_header: String::new(),
            walkin_x_auth_token: String::new(),
            walkin_project_mappings: vec![],
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

    let parse_project_mappings = || -> Vec<ProjectMapping> {
        settings.iter()
            .find(|s| s.key == "walkin_project_mappings")
            .and_then(|s| serde_json::from_str(&s.value).ok())
            .unwrap_or_default()
    };

    let parse_token_profiles = || -> Vec<TokenProfile> {
        settings.iter()
            .find(|s| s.key == "gitlab_token_profiles")
            .and_then(|s| serde_json::from_str(&s.value).ok())
            .unwrap_or_else(|| vec![
                TokenProfile { id: "token-1".to_string(), token: "yTeXMdEjKoKqvG8ay8VQ".to_string(), label: "孙强".to_string() },
                TokenProfile { id: "token-2".to_string(), token: "Kf8mydzuhw2xDwmhsmM4".to_string(), label: "海兵".to_string() },
            ])
    };

    let parse_ldap_profiles = || -> Vec<LdapProfile> {
        settings.iter()
            .find(|s| s.key == "gitlab_ldap_profiles")
            .and_then(|s| serde_json::from_str(&s.value).ok())
            .unwrap_or_default()
    };

    let parse_selected_token_ids = || -> Vec<String> {
        settings.iter()
            .find(|s| s.key == "gitlab_selected_token_ids")
            .and_then(|s| serde_json::from_str(&s.value).ok())
            .unwrap_or_else(|| vec!["token-1".to_string(), "token-2".to_string()])
    };

    Ok(GitLabConfig {
        url: get_setting("gitlab_url", ""),
        auth_type: get_setting("gitlab_auth_type", "token"),
        token_profiles: parse_token_profiles(),
        selected_token_ids: parse_selected_token_ids(),
        ldap_profiles: parse_ldap_profiles(),
        selected_ldap_id: get_setting_opt("gitlab_selected_ldap_id"),
        token: get_setting_opt("gitlab_token"),
        username: get_setting_opt("gitlab_username"),
        password: get_setting_opt("gitlab_password"),
        filter_mode: get_setting("gitlab_filter_mode", "include"),
        filter_projects: parse_json_array("gitlab_filter_projects", vec!["basicdata".to_string(), "lmdm".to_string()]),
        test_keywords: parse_json_array("gitlab_test_keywords", vec!["单测".to_string(), "测试".to_string(), "test".to_string(), "spec".to_string()]),
        scan_schedule: get_setting("gitlab_scan_schedule", "0 9 * * 1"),
        scan_channels: parse_json_array("gitlab_scan_channels", vec![]),
        scan_range_type: get_setting("gitlab_scan_range_type", "week"),
        scan_range_days: get_setting("gitlab_scan_range_days", "7").parse().ok(),
        walkin_enabled: get_setting("walkin_enabled", "false") == "true",
        walkin_url: get_setting("walkin_url", ""),
        walkin_username: get_setting("walkin_username", ""),
        walkin_password: get_setting("walkin_password", ""),
        walkin_dept_name: get_setting("walkin_dept_name", ""),
        walkin_dept_id: get_setting("walkin_dept_id", ""),
        walkin_workspace_name: get_setting("walkin_workspace_name", ""),
        walkin_csrf_token: get_setting("walkin_csrf_token", ""),
        walkin_project_header: get_setting("walkin_project_header", ""),
        walkin_x_auth_token: get_setting("walkin_x_auth_token", ""),
        walkin_project_mappings: parse_project_mappings(),
    })
}

fn save_gitlab_config_to_settings(conn: &rusqlite::Connection, config: &GitLabConfig) -> Result<()> {
    SettingsDao::upsert(conn, "gitlab_url", &config.url)?;
    SettingsDao::upsert(conn, "gitlab_auth_type", &config.auth_type)?;

    // Save token profiles (multi-token support)
    SettingsDao::upsert(conn, "gitlab_token_profiles", &serde_json::to_string(&config.token_profiles).unwrap_or_else(|_| "[]".to_string()))?;
    SettingsDao::upsert(conn, "gitlab_selected_token_ids", &serde_json::to_string(&config.selected_token_ids).unwrap_or_else(|_| "[]".to_string()))?;

    // Save LDAP profiles (multi-LDAP support)
    SettingsDao::upsert(conn, "gitlab_ldap_profiles", &serde_json::to_string(&config.ldap_profiles).unwrap_or_else(|_| "[]".to_string()))?;
    if let Some(ref id) = config.selected_ldap_id {
        SettingsDao::upsert(conn, "gitlab_selected_ldap_id", id)?;
    }

    // Legacy fields
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

    SettingsDao::upsert(conn, "walkin_enabled", &config.walkin_enabled.to_string())?;
    SettingsDao::upsert(conn, "walkin_url", &config.walkin_url)?;
    SettingsDao::upsert(conn, "walkin_username", &config.walkin_username)?;
    SettingsDao::upsert(conn, "walkin_password", &config.walkin_password)?;
    SettingsDao::upsert(conn, "walkin_dept_name", &config.walkin_dept_name)?;
    SettingsDao::upsert(conn, "walkin_dept_id", &config.walkin_dept_id)?;
    SettingsDao::upsert(conn, "walkin_workspace_name", &config.walkin_workspace_name)?;
    SettingsDao::upsert(conn, "walkin_csrf_token", &config.walkin_csrf_token)?;
    SettingsDao::upsert(conn, "walkin_project_header", &config.walkin_project_header)?;
    SettingsDao::upsert(conn, "walkin_x_auth_token", &config.walkin_x_auth_token)?;
    SettingsDao::upsert(conn, "walkin_project_mappings", &serde_json::to_string(&config.walkin_project_mappings).unwrap_or_else(|_| "[]".to_string()))?;

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
pub async fn trigger_gitlab_scan(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    scan_type: String
) -> Result<ScanResult> {
    let (config, channels) = {
        let conn = db.conn().lock().unwrap();
        let config = get_gitlab_config_from_settings(&conn)?;
        let all_channels = ChannelDao::get_all(&conn)?;

        // Filter channels that are enabled and in scan_channels list
        let channels: Vec<_> = all_channels
            .into_iter()
            .filter(|c| c.enabled && config.scan_channels.contains(&c.id))
            .collect();

        (config, channels)
    };

    if config.url.is_empty() {
        return Err(ToolsError::Http("GitLab URL is not configured".to_string()));
    }

    // Get selected token IDs (default to all if empty)
    let selected_token_ids = if config.selected_token_ids.is_empty() {
        config.token_profiles.iter().map(|p| p.id.clone()).collect::<Vec<_>>()
    } else {
        config.selected_token_ids.clone()
    };

    // Get selected tokens
    let selected_tokens: Vec<&TokenProfile> = config.token_profiles
        .iter()
        .filter(|p| selected_token_ids.contains(&p.id))
        .collect();

    if selected_tokens.is_empty() {
        return Err(ToolsError::Http("No token profiles selected".to_string()));
    }

    log::info!("Scanning with {} token(s)", selected_tokens.len());

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

    // Scan with each token and merge results
    let mut merged_result: Option<ScanResult> = None;
    let mut seen_project_ids: std::collections::HashSet<i64> = std::collections::HashSet::new();
    let total_tokens = selected_tokens.len();
    let mut token_idx = 0;

    for token_profile in selected_tokens {
        token_idx += 1;
        log::info!("Scanning with token: {} ({}/{})", token_profile.label, token_idx, total_tokens);

        let auth = GitLabAuth::Token(token_profile.token.clone());
        let client = GitLabClient::new(&config.url, auth)?;

        let scanner = GitLabScanner::new(client, scan_config.clone());

        // Scan with progress callback
        let app_clone = app.clone();
        let token_label = token_profile.label.clone();
        let result = scanner.scan_with_progress(&scan_type, move |progress| {
            let _ = app_clone.emit("gitlab-scan-progress", &ScanProgress {
                current: progress.current,
                total: progress.total,
                project_name: format!("[{}] {}", token_label, progress.project_name),
                commits_scanned: progress.commits_scanned,
                commits_total: progress.commits_total,
                phase: progress.phase.clone(),
            });
        }).await?;

        // Merge results, deduplicating by project_id
        if let Some(ref mut merged) = merged_result {
            for project in result.projects {
                if !seen_project_ids.contains(&project.project_id) {
                    seen_project_ids.insert(project.project_id);
                    merged.projects.push(project);
                }
            }
            // Aggregate totals
            merged.total_commits += result.total_commits;
            merged.total_lines_added += result.total_lines_added;
            merged.total_lines_removed += result.total_lines_removed;
            merged.test_projects += result.test_projects;
            merged.pending_mrs += result.pending_mrs;
            merged.pipeline_total += result.pipeline_total;
            merged.pipeline_success += result.pipeline_success;
            merged.pipeline_failed += result.pipeline_failed;
            // Merge contributors
            for contributor in result.contributors {
                if !merged.contributors.contains(&contributor) {
                    merged.contributors.push(contributor);
                }
            }
            // Merge developer stats
            for dev in result.developer_stats {
                if let Some(existing) = merged.developer_stats.iter_mut().find(|d| d.name == dev.name) {
                    existing.commits += dev.commits;
                    existing.lines_added += dev.lines_added;
                    existing.lines_removed += dev.lines_removed;
                    existing.mrs_created += dev.mrs_created;
                    existing.mrs_pipeline_success += dev.mrs_pipeline_success;
                    existing.mrs_pipeline_failed += dev.mrs_pipeline_failed;
                    for p in dev.projects {
                        if !existing.projects.contains(&p) {
                            existing.projects.push(p);
                        }
                    }
                } else {
                    merged.developer_stats.push(dev);
                }
            }
            // Update project count
            merged.total_projects = merged.projects.len() as i32;
        } else {
            seen_project_ids.extend(result.projects.iter().map(|p| p.project_id));
            merged_result = Some(result);
        }
    }

    let mut result = merged_result.ok_or_else(|| ToolsError::Http("No scan results".to_string()))?;

    // Fetch Walkin metrics if enabled
    log::info!("Walkin config: enabled={}, url={}, has_csrf={}, has_x_auth={}",
        config.walkin_enabled, !config.walkin_url.is_empty(),
        !config.walkin_csrf_token.is_empty(), !config.walkin_x_auth_token.is_empty());

    if config.walkin_enabled && !config.walkin_url.is_empty() {
        if config.walkin_csrf_token.is_empty() || config.walkin_x_auth_token.is_empty() {
            log::warn!("Walkin enabled but missing auth tokens (csrf or x_auth_token)");
        } else {
            let _ = app.emit("gitlab-scan-progress", &ScanProgress {
                current: 0,
                total: 1,
                project_name: "加载 Walkin 代码质量数据...".to_string(),
                commits_scanned: 0,
                commits_total: 0,
                phase: Some("walkin".to_string()),
            });

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
                            log::info!("Fetched {} Walkin projects", walkin_data.len());
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

            let _ = app.emit("gitlab-scan-progress", &ScanProgress {
                current: 1,
                total: 1,
                project_name: "Walkin 数据加载完成".to_string(),
                commits_scanned: 0,
                commits_total: 0,
                phase: Some("walkin".to_string()),
            });
        }
    } else {
        log::info!("Walkin not enabled or URL empty, skipping Walkin metrics fetch");
    }

    // Emit scan complete event
    let _ = app.emit("gitlab-scan-complete", ());

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

    // Send notification if channels are configured and there are code changes
    if !channels.is_empty() && (result.total_lines_added > 0 || result.total_lines_removed > 0 || result.total_commits > 0) {
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
            let coverage_info = match (result.walkin_max_new_coverage, result.walkin_max_coverage) {
                (Some(new_cov), Some(all_cov)) => format!(
                    "• 增量覆盖率：{:.2}%\n                 • 全量覆盖率：{:.2}%",
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

        // Send notification (non-blocking, ignore errors)
        tokio::spawn(async move {
            let _ = send_scan_notification(&channels, &title, &content).await;
        });
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

#[tauri::command]
pub async fn walkin_auto_login(
    url: String,
    username: String,
    password: String,
) -> Result<AutoLoginResult> {
    Ok(auto_login(&url, &username, &password).await)
}

#[tauri::command]
pub async fn walkin_get_captcha(url: String) -> Result<CaptchaData> {
    get_captcha(&url).await
}

#[tauri::command]
pub async fn walkin_ldap_login(
    url: String,
    username: String,
    password: String,
    captcha: String,
    captcha_uuid: String,
) -> Result<WalkinSigninResponse> {
    ldap_signin(&url, &username, &password, &captcha, &captcha_uuid).await
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalkinAuthParams {
    pub csrf_token: String,
    pub project: String,
    pub workspace: String,
    pub x_auth_token: String,
}

#[tauri::command]
pub async fn walkin_fetch_unit_board(
    url: String,
    auth: WalkinAuthParams,
    dept_id: String,
    dept_name: String,
) -> Result<Option<UnitBoardData>> {
    let walkin_auth = WalkinAuth {
        csrf_token: auth.csrf_token,
        project: auth.project,
        workspace: auth.workspace.clone(),
        x_auth_token: auth.x_auth_token,
    };
    let client = WalkinClient::new(&url, walkin_auth, dept_name, auth.workspace)?;
    client.fetch_unit_board(&dept_id).await
}

#[tauri::command]
pub async fn walkin_check_login(
    url: String,
    auth: WalkinAuthParams,
) -> Result<LoginStatusResult> {
    let walkin_auth = WalkinAuth {
        csrf_token: auth.csrf_token,
        project: auth.project,
        workspace: auth.workspace,
        x_auth_token: auth.x_auth_token,
    };
    check_walkin_login(&url, &walkin_auth).await
}
