use std::sync::Arc;
use std::thread;
use std::time::Duration;
use chrono::{Utc, Datelike, Weekday};
use reqwest::Client;
use serde::Deserialize;
use crate::database::Database;
use crate::database::dao::{TaskDao, ChannelDao, ReminderDao, template::TemplateDao, task::Task, reminder::CreateReminderRequest};
use crate::services::scheduler::cron_parser::get_next_run_time;
use crate::services::scheduler::special_dates::{get_nth_weekday_of_month, get_nth_last_day_of_month, get_last_workday_of_month};
use crate::services::notifier::bark::build_bark_url;
use crate::error::Result;

#[derive(Debug, Deserialize)]
struct CronConfig {
    mode: Option<String>,
    end_condition: Option<EndCondition>,
    special: Option<SpecialConfig>,
}

#[derive(Debug, Deserialize)]
struct SpecialConfig {
    #[serde(rename = "type")]
    type_: Option<String>,
    time: Option<String>,  // 时间设置，如 "09:00"
    #[serde(alias = "nthWeekday")]
    nth_weekday: Option<NthWeekdayConfig>,
    #[serde(alias = "lastDay")]
    last_day: Option<LastDayConfig>,
}

#[derive(Debug, Deserialize)]
struct NthWeekdayConfig {
    #[serde(alias = "nthWeekday")]
    nth: Option<u32>,
    weekday: Option<u32>,
    month: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct LastDayConfig {
    #[serde(rename = "type", alias = "lastDayType")]
    type_: Option<String>,
    #[serde(alias = "nth")]
    nth: Option<u32>,
    month: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct EndCondition {
    type_: String,
    #[serde(rename = "type")]
    type_alias: Option<String>,
    occurrences: Option<i32>,
    until_date: Option<String>,
}

impl EndCondition {
    fn get_type(&self) -> &str {
        self.type_alias.as_ref().unwrap_or(&self.type_)
    }
}

/// Calculate next run time based on special date config
fn get_special_next_run(task: &Task) -> Result<Option<i64>> {
    let cron_config: CronConfig = match serde_json::from_str(&task.cron_config) {
        Ok(config) => {
            log::debug!("Parsed cron_config for task {}: {:?}", task.id, config);
            config
        },
        Err(e) => {
            log::error!("Failed to parse cron_config for task {}: {}", task.id, e);
            return Ok(None);
        }
    };

    // Check if this is a special mode
    if cron_config.mode != Some("special".to_string()) {
        log::debug!("Task {} is not special mode: {:?}", task.id, cron_config.mode);
        return Ok(None);
    }

    let special = cron_config.special.ok_or_else(|| {
        crate::error::ToolsError::InvalidCron("缺少特殊日期配置".to_string())
    })?;

    log::debug!("Special config for task {}: type={:?}, nth_weekday={:?}, last_day={:?}, time={:?}",
        task.id, special.type_, special.nth_weekday, special.last_day, special.time);

    // 获取时间设置，默认 "09:00"
    let time = special.time.as_deref().unwrap_or("09:00");

    let type_ = special.type_.unwrap_or_default();

    match type_.as_str() {
        "nth_weekday" => {
            let nth_weekday = special.nth_weekday.ok_or_else(|| {
                crate::error::ToolsError::InvalidCron("缺少第N周配置".to_string())
            })?;
            let nth = nth_weekday.nth.unwrap_or(1);
            let weekday = nth_weekday.weekday.unwrap_or(1);
            let month = nth_weekday.month;
            log::info!("Calculating nth_weekday for task {}: nth={}, weekday={}, month={:?}, time={}", task.id, nth, weekday, month, time);
            get_nth_weekday_of_month(nth, weekday, month, time).map(Some)
        }
        "last_day" => {
            let last_day = special.last_day.ok_or_else(|| {
                crate::error::ToolsError::InvalidCron("缺少月末配置".to_string())
            })?;
            let day_type = last_day.type_.unwrap_or_default();
            let nth = last_day.nth.unwrap_or(1);
            let month = last_day.month;

            match day_type.as_str() {
                "last_nth" => get_nth_last_day_of_month(nth, month, time).map(Some),
                "last_workday" => get_last_workday_of_month(month, time).map(Some),
                "last_friday" => get_nth_weekday_of_month(4, 5, month, time).map(Some), // 周五是weekday=5
                // 兼容旧配置
                "day" => get_nth_last_day_of_month(nth, month, time).map(Some),
                "weekday" => get_last_workday_of_month(month, time).map(Some),
                "friday" => get_nth_weekday_of_month(4, 5, month, time).map(Some),
                _ => get_nth_last_day_of_month(nth, month, time).map(Some),
            }
        }
        _ => Ok(None),
    }
}

pub fn start_scheduler(db: Arc<Database>) {
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut interval = tokio::time::interval(Duration::from_secs(10));

            loop {
                interval.tick().await;

                if let Err(e) = run_scheduler_cycle(&db).await {
                    log::error!("Scheduler cycle error: {}", e);
                }
            }
        });
    });
}

async fn run_scheduler_cycle(db: &Arc<Database>) -> Result<()> {
    // 1. Update next_run_at for tasks without it
    if let Err(e) = update_task_next_runs(db) {
        log::error!("update_task_next_runs error: {}", e);
        return Err(e);
    }

    // 2. Create reminders for upcoming executions
    if let Err(e) = create_upcoming_reminders(db) {
        log::error!("create_upcoming_reminders error: {}", e);
        return Err(e);
    }

    // 3. Execute pending reminders
    if let Err(e) = execute_pending_reminders(db).await {
        log::error!("execute_pending_reminders error: {}", e);
        return Err(e);
    }

    Ok(())
}

fn update_task_next_runs(db: &Arc<Database>) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    let tasks = TaskDao::get_all(&conn)?;
    drop(conn);

    for task in tasks {
        if task.enabled && task.next_run_at.is_none() {
            // First try special date calculation
            let next_run = match get_special_next_run(&task) {
                Ok(Some(time)) => Some(time),
                Ok(None) => {
                    // Fall back to standard cron
                    match get_next_run_time(&task.cron_expr) {
                        Ok(time) => time,
                        Err(e) => {
                            log::error!("Invalid cron for task {}: {}", task.id, e);
                            let default_next = Utc::now().timestamp_millis() + 24 * 60 * 60 * 1000;
                            Some(default_next)
                        }
                    }
                }
                Err(e) => {
                    log::error!("Special date error for task {}: {}", task.id, e);
                    let default_next = Utc::now().timestamp_millis() + 24 * 60 * 60 * 1000;
                    Some(default_next)
                }
            };

            if let Some(next_run) = next_run {
                let conn = db.conn().lock().unwrap();
                conn.execute(
                    "UPDATE tasks SET next_run_at = ?1 WHERE id = ?2",
                    rusqlite::params![next_run, task.id],
                )?;
                log::info!("Set next_run_at for task {} to {}", task.id, next_run);
            }
        }
    }

    Ok(())
}

fn create_upcoming_reminders(db: &Arc<Database>) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    let tasks = TaskDao::get_enabled(&conn)?;
    drop(conn);

    let now = Utc::now().timestamp_millis();
    let lookahead = now + 60 * 1000; // 1 minute ahead

    for task in tasks {
        // Check end condition before creating reminder
        if check_end_condition_with_count(&task, db)? {
            // Disable the task since it has reached its end condition
            let conn = db.conn().lock().unwrap();
            conn.execute(
                "UPDATE tasks SET enabled = 0, status = 'completed' WHERE id = ?1",
                rusqlite::params![task.id],
            )?;
            log::info!("Task {} has reached end condition, disabled", task.id);
            continue;
        }

        if let Some(next_run) = task.next_run_at {
            // If next_run_at is in the past, update it to the next valid time
            if next_run <= now {
                // First try special date calculation
                let new_next_run = match get_special_next_run(&task) {
                    Ok(Some(time)) => Some(time),
                    Ok(None) => {
                        // Fall back to standard cron
                        match get_next_run_time(&task.cron_expr) {
                            Ok(time) => time,
                            Err(e) => {
                                log::error!("Invalid cron for task {}: {}", task.id, e);
                                None
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Special date error for task {}: {}", task.id, e);
                        match get_next_run_time(&task.cron_expr) {
                            Ok(time) => time,
                            Err(_) => None,
                        }
                    }
                };

                match new_next_run {
                    Some(new_time) => {
                        let conn = db.conn().lock().unwrap();
                        conn.execute(
                            "UPDATE tasks SET next_run_at = ?1 WHERE id = ?2",
                            rusqlite::params![new_time, task.id],
                        )?;
                        log::info!("Updated expired next_run_at for task {} to {}", task.id, new_time);
                        drop(conn);
                        continue;
                    }
                    None => {
                        log::warn!("No next run time for task {}, disabling", task.id);
                        let conn = db.conn().lock().unwrap();
                        conn.execute(
                            "UPDATE tasks SET enabled = 0, status = 'completed' WHERE id = ?1",
                            rusqlite::params![task.id],
                        )?;
                        drop(conn);
                        continue;
                    }
                }
            }

            if next_run > now && next_run <= lookahead {
                // Check if reminder already exists
                let conn = db.conn().lock().unwrap();
                let exists: bool = conn.query_row(
                    "SELECT COUNT(*) > 0 FROM reminders WHERE task_id = ?1 AND scheduled_at = ?2",
                    rusqlite::params![task.id, next_run],
                    |row| row.get(0),
                )?;

                if !exists {
                    ReminderDao::create(&conn, CreateReminderRequest {
                        task_id: task.id.clone(),
                        scheduled_at: next_run,
                    })?;
                    log::info!("Created reminder for task {} at {}", task.id, next_run);
                }
                drop(conn);
            }
        }
    }

    Ok(())
}

async fn execute_pending_reminders(db: &Arc<Database>) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    let reminders = ReminderDao::get_pending(&conn)?;
    drop(conn);

    for reminder in reminders {
        // Get task info
        let conn = db.conn().lock().unwrap();
        let task = TaskDao::get_by_id(&conn, &reminder.task_id)?;
        drop(conn);

        if let Some(task) = task {
            let results = send_notification_for_task(db, &task).await;

            {
                let conn = db.conn().lock().unwrap();
                match results {
                    Ok(res) => {
                        if channel_results_have_success(&res) {
                            ReminderDao::update_status(&conn, &reminder.id, "sent", &res, None)?;
                            log::info!("Reminder {} sent successfully", reminder.id);
                        } else {
                            ReminderDao::update_status(&conn, &reminder.id, "failed", &res, Some("所有通知渠道发送失败"))?;
                            log::error!("Reminder {} failed: all channels failed", reminder.id);
                        }
                    }
                    Err(e) => {
                        ReminderDao::update_status(&conn, &reminder.id, "failed", "[]", Some(&e.to_string()))?;
                        log::error!("Reminder {} failed: {}", reminder.id, e);
                    }
                }
            }

            match get_next_run_time(&task.cron_expr) {
                Ok(Some(next_run)) => {
                    // Check end condition after this execution
                    if check_end_condition_with_count(&task, db)? {
                        let conn = db.conn().lock().unwrap();
                        conn.execute(
                            "UPDATE tasks SET enabled = 0, status = 'completed', last_run_at = ?1 WHERE id = ?2",
                            rusqlite::params![reminder.scheduled_at, task.id],
                        )?;
                        log::info!("Task {} completed after reaching end condition", task.id);
                    } else {
                        let conn = db.conn().lock().unwrap();
                        conn.execute(
                            "UPDATE tasks SET next_run_at = ?1, last_run_at = ?2 WHERE id = ?3",
                            rusqlite::params![next_run, reminder.scheduled_at, task.id],
                        )?;
                        log::info!("Updated next_run_at for task {} to {}", task.id, next_run);
                    }
                }
                Ok(None) => {
                    log::warn!("No next run time for task {}", task.id);
                    // No next run time means the task has completed naturally
                    let conn = db.conn().lock().unwrap();
                    conn.execute(
                        "UPDATE tasks SET enabled = 0, status = 'completed', last_run_at = ?1 WHERE id = ?2",
                        rusqlite::params![reminder.scheduled_at, task.id],
                    )?;
                }
                Err(e) => {
                    log::error!("Invalid cron for task {}: {}", task.id, e);
                    // Set a default next_run_at
                    let conn = db.conn().lock().unwrap();
                    let default_next = Utc::now().timestamp_millis() + 24 * 60 * 60 * 1000;
                    conn.execute(
                        "UPDATE tasks SET next_run_at = ?1, last_run_at = ?2 WHERE id = ?3",
                        rusqlite::params![default_next, reminder.scheduled_at, task.id],
                    )?;
                }
            }
        }
    }

    Ok(())
}

async fn send_notification_for_task(db: &Arc<Database>, task: &Task) -> Result<String> {
    let client = Client::new();
    let conn = db.conn().lock().unwrap();
    let channel_ids: Vec<String> = serde_json::from_str(&task.channel_ids)?;

    // Get template and render messages
    let (title, content) = if let Some(template_id) = &task.template_id {
        if let Ok(Some(template)) = TemplateDao::get_by_id(&conn, template_id) {
            let rendered_title = render_template(&template.title_template, task);
            let rendered_body = render_template(&template.body_template, task);
            (rendered_title, rendered_body)
        } else {
            (task.name.clone(), task.description.clone().unwrap_or_default())
        }
    } else {
        (task.name.clone(), task.description.clone().unwrap_or_default())
    };

    let mut results = Vec::new();

    for channel_id in channel_ids {
        let channel = ChannelDao::get_by_id(&conn, &channel_id)?;
        if let Some(channel) = channel {
            if !channel.enabled {
                continue;
            }

            let config: serde_json::Value = serde_json::from_str(&channel.config)
                .unwrap_or(serde_json::json!({}));

            // Get at_phones from channel config
            let at_phones: Vec<String> = config["atPhones"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();

            let (success, message) = match channel.type_.as_str() {
                "bark" => {
                    let key = config["key"].as_str().unwrap_or("");
                    let server_url = config["serverUrl"].as_str().unwrap_or("https://api.day.app");
                    let group = config["group"].as_str().unwrap_or("Tools");
                    let url = build_bark_url(server_url, key)?;
                    let body = serde_json::json!({
                        "title": &title,
                        "body": &content,
                        "group": group,
                        "sound": "bell",
                    });
                    let result = client.post(&url).json(&body).send().await;
                    match result {
                        Ok(resp) => {
                            let status = resp.status();
                            let text = resp.text().await.unwrap_or_default();
                            if status.is_success() {
                                (true, format!("发送成功: {}", text))
                            } else {
                                (false, format!("发送失败: {}", text))
                            }
                        }
                        Err(e) => (false, e.to_string()),
                    }
                },
                "feishu" => {
                    let webhook_url = config["webhookUrl"].as_str().unwrap_or("");
                    let secret = config["secret"].as_str();
                    let result = crate::services::notifier::feishu::send_feishu(
                        &client, webhook_url, secret, &title, &content
                    ).await;
                    match result {
                        Ok(msg) => (true, msg),
                        Err(e) => (false, e.to_string()),
                    }
                },
                "wecom" => {
                    let webhook_url = config["webhookUrl"].as_str().unwrap_or("");
                    let result = crate::services::notifier::wecom::send_wecom(
                        &client, webhook_url, &title, &content
                    ).await;
                    match result {
                        Ok(msg) => (true, msg),
                        Err(e) => (false, e.to_string()),
                    }
                },
                "dingtalk" => {
                    let webhook_url = config["webhookUrl"].as_str().unwrap_or("");
                    let secret = config["secret"].as_str();
                    let result = crate::services::notifier::dingtalk::send_dingtalk(
                        &client, webhook_url, secret, &title, &content,
                        if at_phones.is_empty() { None } else { Some(&at_phones) }
                    ).await;
                    match result {
                        Ok(msg) => (true, msg),
                        Err(e) => (false, e.to_string()),
                    }
                },
                _ => (false, format!("未知渠道类型: {}", channel.type_)),
            };

            results.push(serde_json::json!({
                "channel_id": channel_id,
                "channel_name": channel.name,
                "success": success,
                "message": message
            }));
        }
    }
    drop(conn);

    Ok(serde_json::to_string(&results)?)
}

fn channel_results_have_success(results: &str) -> bool {
    serde_json::from_str::<Vec<serde_json::Value>>(results)
        .map(|items| items.iter().any(|item| item["success"].as_bool() == Some(true)))
        .unwrap_or(false)
}

/// Check end condition with execution count from database
fn check_end_condition_with_count(task: &Task, db: &Arc<Database>) -> Result<bool> {
    let cron_config: CronConfig = match serde_json::from_str(&task.cron_config) {
        Ok(config) => config,
        Err(_) => return Ok(false),
    };

    let end_condition = match cron_config.end_condition {
        Some(ec) => ec,
        None => return Ok(false),
    };

    match end_condition.get_type() {
        "never" => Ok(false),
        "after_occurrences" => {
            if let Some(max_occurrences) = end_condition.occurrences {
                let conn = db.conn().lock().unwrap();
                let count: i32 = conn.query_row(
                    "SELECT COUNT(*) FROM reminder_history WHERE task_id = ?1",
                    rusqlite::params![task.id],
                    |row| row.get(0),
                )?;
                Ok(count >= max_occurrences)
            } else {
                Ok(false)
            }
        }
        "until_date" => {
            if let Some(until_date_str) = &end_condition.until_date {
                match chrono::NaiveDate::parse_from_str(until_date_str, "%Y-%m-%d") {
                    Ok(until_date) => {
                        let now = Utc::now().date_naive();
                        Ok(now > until_date)
                    }
                    Err(_) => Ok(false),
                }
            } else {
                Ok(false)
            }
        }
        _ => Ok(false),
    }
}

/// Render template with variables
fn render_template(template: &str, task: &Task) -> String {
    let now = chrono::Local::now();
    let date = now.format("%Y年%m月%d日").to_string();
    let time = now.format("%H:%M").to_string();
    let weekday = match now.weekday() {
        Weekday::Mon => "星期一",
        Weekday::Tue => "星期二",
        Weekday::Wed => "星期三",
        Weekday::Thu => "星期四",
        Weekday::Fri => "星期五",
        Weekday::Sat => "星期六",
        Weekday::Sun => "星期日",
    };

    // Calculate week of month
    let day_of_month = now.day();
    let week_of_month = (day_of_month - 1) / 7 + 1;

    // Calculate days remaining in month
    let days_in_month = get_days_in_month(now.year(), now.month());
    let days_remaining = days_in_month - day_of_month;

    let mut result = template.to_string();
    result = result.replace("{task_name}", &task.name);
    result = result.replace("{date}", &date);
    result = result.replace("{time}", &time);
    result = result.replace("{weekday}", weekday);
    result = result.replace("{week_of_month}", &week_of_month.to_string());
    result = result.replace("{day_of_month}", &day_of_month.to_string());
    result = result.replace("{days_remaining}", &days_remaining.to_string());

    if let Some(desc) = &task.description {
        result = result.replace("{description}", desc);
    } else {
        result = result.replace("{description}", "");
    }

    result
}

fn get_days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

/// Test task notification - send notification immediately for testing
pub async fn test_task_notification(db: &Arc<Database>, task_id: &str) -> Result<String> {
    // Get all needed data first, then release lock before async operation
    let (_task, title, content, channels) = {
        let conn = db.conn().lock().unwrap();
        let task = TaskDao::get_by_id(&conn, task_id)?
            .ok_or_else(|| crate::error::ToolsError::TaskNotFound(task_id.to_string()))?;

        let channel_ids: Vec<String> = serde_json::from_str(&task.channel_ids)?;

        // Get template and render messages
        let (title, content) = if let Some(template_id) = &task.template_id {
            if let Ok(Some(template)) = TemplateDao::get_by_id(&conn, template_id) {
                let rendered_title = render_template(&template.title_template, &task);
                let rendered_body = render_template(&template.body_template, &task);
                (rendered_title, rendered_body)
            } else {
                (task.name.clone(), task.description.clone().unwrap_or_default())
            }
        } else {
            (task.name.clone(), task.description.clone().unwrap_or_default())
        };

        // Get all channels
        let mut channels = Vec::new();
        for channel_id in &channel_ids {
            if let Ok(Some(channel)) = ChannelDao::get_by_id(&conn, channel_id) {
                if channel.enabled {
                    let config: serde_json::Value = serde_json::from_str(&channel.config)
                        .unwrap_or(serde_json::json!({}));
                    channels.push((channel.id, channel.name, channel.type_, config));
                }
            }
        }

        (task, title, content, channels)
    };

    // Now send notifications without holding the lock
    let client = Client::new();
    let mut results = Vec::new();

    for (channel_id, channel_name, channel_type, config) in channels {
        let at_phones: Vec<String> = config["atPhones"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();

        let (success, message) = match channel_type.as_str() {
            "bark" => {
                let key = config["key"].as_str().unwrap_or("");
                let server_url = config["serverUrl"].as_str().unwrap_or("https://api.day.app");
                let group = config["group"].as_str().unwrap_or("Tools");
                let url = build_bark_url(server_url, key)?;
                let body = serde_json::json!({
                    "title": &title,
                    "body": &content,
                    "group": group,
                    "sound": "bell",
                });
                let result = client.post(&url).json(&body).send().await;
                match result {
                    Ok(resp) => {
                        let status = resp.status();
                        let text = resp.text().await.unwrap_or_default();
                        if status.is_success() {
                            (true, format!("发送成功: {}", text))
                        } else {
                            (false, format!("发送失败: {}", text))
                        }
                    }
                    Err(e) => (false, e.to_string()),
                }
            },
            "feishu" => {
                let webhook_url = config["webhookUrl"].as_str().unwrap_or("");
                let secret = config["secret"].as_str();
                let result = crate::services::notifier::feishu::send_feishu(
                    &client, webhook_url, secret, &title, &content
                ).await;
                match result {
                    Ok(msg) => (true, msg),
                    Err(e) => (false, e.to_string()),
                }
            },
            "wecom" => {
                let webhook_url = config["webhookUrl"].as_str().unwrap_or("");
                let result = crate::services::notifier::wecom::send_wecom(
                    &client, webhook_url, &title, &content
                ).await;
                match result {
                    Ok(msg) => (true, msg),
                    Err(e) => (false, e.to_string()),
                }
            },
            "dingtalk" => {
                let webhook_url = config["webhookUrl"].as_str().unwrap_or("");
                let secret = config["secret"].as_str();
                let result = crate::services::notifier::dingtalk::send_dingtalk(
                    &client, webhook_url, secret, &title, &content,
                    if at_phones.is_empty() { None } else { Some(&at_phones) }
                ).await;
                match result {
                    Ok(msg) => (true, msg),
                    Err(e) => (false, e.to_string()),
                }
            },
            _ => (false, format!("未知渠道类型: {}", channel_type)),
        };

        results.push(serde_json::json!({
            "channel_id": channel_id,
            "channel_name": channel_name,
            "success": success,
            "message": message
        }));
    }

    Ok(serde_json::to_string(&results)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_results_are_successful_only_when_at_least_one_channel_succeeds() {
        let results = r#"[
            {"channel_id":"1","success":false,"message":"请求失败"},
            {"channel_id":"2","success":true,"message":"发送成功"}
        ]"#;

        assert!(channel_results_have_success(results));
    }

    #[test]
    fn channel_results_are_failed_when_all_channels_fail() {
        let results = r#"[
            {"channel_id":"1","success":false,"message":"请求失败"},
            {"channel_id":"2","success":false,"message":"请求失败"}
        ]"#;

        assert!(!channel_results_have_success(results));
    }
}