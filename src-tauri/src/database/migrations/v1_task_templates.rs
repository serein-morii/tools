//! Business-specific template migration (extracted from schema.rs)
//! Customize task template auto-creation logic per project needs.

use chrono::Utc;
use rusqlite::Connection;
use uuid::Uuid;
use crate::error::Result;

pub fn migrate_default_templates(conn: &Connection) -> Result<()> {
    let now = Utc::now().timestamp_millis();

    let mut stmt = conn.prepare(
        "SELECT id, name, description, template_id FROM tasks"
    )?;

    let tasks: Vec<(String, String, Option<String>, Option<String>)> = stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })?.filter_map(|r| r.ok()).collect();

    let task_configs: Vec<(&str, &str, &str, &str)> = vec![
        ("QP月点价", "🦄", "QP月点价是否完成",
         "今天是 {date}（本月第 {week_of_month} 周的星期 {weekday_num}），请及时查看{description}！🎯"),
        ("期货当月头寸", "🐶", "期货当月头寸是否处理",
         "今天是 {date}（本月第 {day_of_month} 天），请及时查看{description}！🎯"),
    ];

    let miner_configs: Vec<(&str, &str, &str)> = vec![
        ("下单", "🐯", "矿均价保值头寸是否下单"),
        ("下指令", "🦁", "矿均价保值头寸是否下指令"),
    ];

    for (task_id, task_name, _description, existing_template_id) in tasks {
        let (emoji, desc, body_tpl) = if task_name.contains("矿均价保值头寸") {
            let existing = _description.as_deref().unwrap_or("");
            let mut found = ("🦁", "矿均价保值头寸是否下指令", "今天是 {date}（本月倒数第 {days_remaining} 天），请及时查看{description}！🎯");
            for (kw, em, d) in &miner_configs {
                if existing.contains(kw) {
                    let b = if *kw == "下单" {
                        "今天是 {date}（本月第 {day_of_month} 天），请及时查看{description}！🎯"
                    } else {
                        "今天是 {date}（本月倒数第 {days_remaining} 天），请及时查看{description}！🎯"
                    };
                    found = (*em, *d, b);
                    break;
                }
            }
            found
        } else {
            let mut found = None;
            for cfg in &task_configs {
                if task_name.contains(cfg.0) {
                    found = Some(*cfg);
                    break;
                }
            }
            match found {
                Some((_, e, d, b)) => (e, d, b),
                None => continue,
            }
        };

        let title_tpl = format!("{}提醒来啦!📣📣📣", emoji);

        conn.execute(
            "UPDATE tasks SET description = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![desc, now, task_id],
        )?;

        if let Some(tid) = existing_template_id {
            conn.execute(
                "UPDATE templates SET title_template = ?1, body_template = ?2, updated_at = ?3 WHERE id = ?4",
                rusqlite::params![title_tpl, body_tpl, now, tid],
            )?;
        } else {
            let template_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO templates (id, name, description, category, title_template, body_template, default_channels, tags, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                rusqlite::params![
                    template_id,
                    format!("{}默认模板", task_name),
                    Some(format!("{}的自动提醒模板", task_name)),
                    "builtin",
                    title_tpl,
                    body_tpl,
                    "[]",
                    "[]",
                    now,
                ],
            )?;
            conn.execute(
                "UPDATE tasks SET template_id = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![template_id, now, task_id],
            )?;
        }
    }

    Ok(())
}
