use std::sync::Arc;
use std::thread;
use std::time::Duration;
use chrono::Utc;
use reqwest::Client;
use crate::database::Database;
use crate::database::dao::{TaskDao, ChannelDao, ReminderDao, task::Task, reminder::CreateReminderRequest};
use crate::services::scheduler::cron_parser::get_next_run_time;
use crate::error::Result;

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
    update_task_next_runs(db)?;

    // 2. Create reminders for upcoming executions
    create_upcoming_reminders(db)?;

    // 3. Execute pending reminders
    execute_pending_reminders(db).await?;

    Ok(())
}

fn update_task_next_runs(db: &Arc<Database>) -> Result<()> {
    let conn = db.conn().lock().unwrap();
    let tasks = TaskDao::get_all(&conn)?;
    drop(conn);

    for task in tasks {
        if task.enabled && task.next_run_at.is_none() {
            match get_next_run_time(&task.cron_expr) {
                Ok(Some(next_run)) => {
                    let conn = db.conn().lock().unwrap();
                    conn.execute(
                        "UPDATE tasks SET next_run_at = ?1 WHERE id = ?2",
                        rusqlite::params![next_run, task.id],
                    )?;
                }
                Ok(None) => {
                    log::warn!("No next run time for task {}", task.id);
                }
                Err(e) => {
                    log::error!("Invalid cron for task {}: {}", task.id, e);
                    // Set a default next_run_at to prevent repeated errors
                    let conn = db.conn().lock().unwrap();
                    let default_next = Utc::now().timestamp_millis() + 24 * 60 * 60 * 1000; // 24 hours from now
                    conn.execute(
                        "UPDATE tasks SET next_run_at = ?1 WHERE id = ?2",
                        rusqlite::params![default_next, task.id],
                    )?;
                }
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
        if let Some(next_run) = task.next_run_at {
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

            let conn = db.conn().lock().unwrap();
            match results {
                Ok(res) => {
                    ReminderDao::update_status(&conn, &reminder.id, "sent", &res, None)?;
                    log::info!("Reminder {} sent successfully", reminder.id);
                }
                Err(e) => {
                    ReminderDao::update_status(&conn, &reminder.id, "failed", "[]", Some(&e.to_string()))?;
                    log::error!("Reminder {} failed: {}", reminder.id, e);
                }
            }

            // Update next_run_at
            match get_next_run_time(&task.cron_expr) {
                Ok(Some(next_run)) => {
                    let conn = db.conn().lock().unwrap();
                    conn.execute(
                        "UPDATE tasks SET next_run_at = ?1, last_run_at = ?2 WHERE id = ?3",
                        rusqlite::params![next_run, reminder.scheduled_at, task.id],
                    )?;
                }
                Ok(None) => {
                    log::warn!("No next run time for task {}", task.id);
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

    let mut results = Vec::new();

    for channel_id in channel_ids {
        let channel = ChannelDao::get_by_id(&conn, &channel_id)?;
        if let Some(channel) = channel {
            if !channel.enabled {
                continue;
            }

            let config: serde_json::Value = serde_json::from_str(&channel.config)
                .unwrap_or(serde_json::json!({}));

            let (success, message) = match channel.type_.as_str() {
                "bark" => {
                    let key = config["key"].as_str().unwrap_or("");
                    let server_url = config["serverUrl"].as_str().unwrap_or("https://api.day.app");
                    let group = config["group"].as_str().unwrap_or("Tools");
                    let url = format!("{}/{}", server_url.trim_end_matches('/'), key);
                    let body = serde_json::json!({
                        "title": &task.name,
                        "body": task.description.as_deref().unwrap_or(""),
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
                        &client, webhook_url, secret, &task.name, task.description.as_deref().unwrap_or("")
                    ).await;
                    match result {
                        Ok(msg) => (true, msg),
                        Err(e) => (false, e.to_string()),
                    }
                },
                "wecom" => {
                    let webhook_url = config["webhookUrl"].as_str().unwrap_or("");
                    let result = crate::services::notifier::wecom::send_wecom(
                        &client, webhook_url, &task.name, task.description.as_deref().unwrap_or("")
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
                        &client, webhook_url, secret, &task.name, task.description.as_deref().unwrap_or("")
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