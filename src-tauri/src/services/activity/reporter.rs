use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde_json::json;
use uuid::Uuid;

use crate::database::dao::activity::{ActivityDao, AiReport, AiSession, UserMessageRow};
use crate::database::Database;

pub struct Reporter {
    db: Arc<Database>,
}

impl Reporter {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Build stats JSON from a list of sessions
    pub fn build_stats(&self, sessions: &[AiSession]) -> serde_json::Value {
        let total_sessions = sessions.len();
        let total_messages: i64 = sessions.iter().map(|s| s.message_count as i64).sum();
        let total_duration: i64 = sessions.iter().map(|s| s.duration_secs as i64).sum();

        // Tool distribution
        let mut tool_counts: HashMap<String, u32> = HashMap::new();
        for s in sessions {
            *tool_counts.entry(s.tool_id.clone()).or_default() += 1;
        }

        // Project distribution
        let mut project_counts: HashMap<String, u32> = HashMap::new();
        for s in sessions {
            if let Some(ref name) = s.project_name {
                *project_counts.entry(name.clone()).or_default() += 1;
            }
        }

        json!({
            "total_sessions": total_sessions,
            "total_messages": total_messages,
            "total_duration_secs": total_duration,
            "total_duration_formatted": format_duration(total_duration),
            "tool_distribution": tool_counts,
            "project_distribution": project_counts,
            "session_ids": sessions.iter().map(|s| s.id.clone()).collect::<Vec<_>>(),
        })
    }

    /// Build the prompt for AI summarization. Includes the user's actual
    /// questions from each session so the summary reflects what they worked on.
    pub fn build_report_prompt(
        &self,
        report_type: &str,
        range_start: i64,
        range_end: i64,
        stats: &serde_json::Value,
        sessions: &[AiSession],
        user_messages: &[UserMessageRow],
        language: &str,
    ) -> String {
        let date_range = format_date_range(range_start, range_end);

        // Group user messages by session (preserve session order). Apply a char
        // budget so we include as many questions as possible without overflowing
        // the model's context window.
        const BUDGET: usize = 120_000;
        let mut budget = BUDGET;
        let mut truncated = false;
        let mut session_questions = String::new();
        for s in sessions {
            if budget == 0 {
                truncated = true;
                break;
            }
            let tool = &s.tool_id;
            let title = s.title.as_deref().unwrap_or("Untitled");
            let project = s.project_name.as_deref().unwrap_or("-");
            let mins = s.duration_secs / 60;
            session_questions.push_str(&format!(
                "### [{tool}] {title}\n项目: {project} | {msgs} 轮 | {mins} 分钟\n",
                msgs = s.message_count
            ));
            let mut q_idx = 0u32;
            for m in user_messages.iter().filter(|m| m.session_id == s.id) {
                if budget == 0 {
                    session_questions.push_str("- （更多提问已省略）\n");
                    truncated = true;
                    break;
                }
                q_idx += 1;
                let q: String = m.content.chars().take(400).collect();
                let line = format!("{q_idx}. {q}\n");
                if line.len() > budget {
                    session_questions.push_str("- （更多提问已省略）\n");
                    budget = 0;
                    truncated = true;
                    break;
                }
                session_questions.push_str(&line);
                budget = budget.saturating_sub(line.len());
            }
            if q_idx == 0 {
                session_questions.push_str("- （无提问记录）\n");
            }
            session_questions.push('\n');
        }
        if truncated {
            session_questions.push_str("（已达到内容上限，部分提问未全部列出）\n");
        }

        let lang_instruction = match language {
            "zh" => "输出语言：中文",
            "en" => "Output language: English",
            "ja" => "出力言語：日本語",
            "ko" => "출력 언어: 한국어",
            _ => "输出语言：中文",
        };

        let label = report_label(report_type);
        format!(
            r#"你是一个专业的工作总结助手。请根据以下用户在 AI 工具中的提问记录，生成{label}。

## 时间范围
{date_range}

## 整体数据
- AI 工具使用总时长：{total_duration}
- 总会话数：{total_sessions}
- 总对话轮次：{total_messages}

## 各工具使用分布
```json
{tool_distribution}
```

## 会话与提问记录（用户的真实提问，按时间顺序）
{session_questions}

## 要求
1. 重点总结用户在这段时间内**关注了哪些问题、做了什么工作**，从提问中提炼工作主题和意图
2. 按项目 / 工作类型归类组织
3. 不需要详细描述每个任务的实现过程和结果，聚焦"做了什么"
4. 标注涉及的 AI 工具
5. 输出格式为 Markdown，结构化
6. {lang_instruction}
7. 不要添加超出提问记录的内容
"#,
            label = label,
            date_range = date_range,
            total_duration = stats
                .get("total_duration_formatted")
                .and_then(|v| v.as_str())
                .unwrap_or("0"),
            total_sessions = stats.get("total_sessions").unwrap_or(&json!(0)),
            total_messages = stats.get("total_messages").unwrap_or(&json!(0)),
            tool_distribution = serde_json::to_string_pretty(
                stats.get("tool_distribution").unwrap_or(&json!({}))
            )
            .unwrap_or_default(),
            session_questions = session_questions,
            lang_instruction = lang_instruction,
        )
    }

    /// Save a report to database
    pub fn save_report(
        &self,
        report_type: &str,
        range_start: i64,
        range_end: i64,
        content: &str,
        stats: &serde_json::Value,
        summary_method: &str,
        summary_tool: &str,
    ) -> Result<AiReport, String> {
        let conn = self.db.conn().lock().unwrap();
        let report = AiReport {
            id: Uuid::new_v4().to_string(),
            report_type: report_type.to_string(),
            title: format!(
                "{} ({})",
                report_label(report_type),
                format_date_range(range_start, range_end)
            ),
            range_start,
            range_end,
            content: Some(content.to_string()),
            stats: stats.to_string(),
            session_ids: stats
                .get("session_ids")
                .map(|v| v.to_string())
                .unwrap_or_default(),
            summary_method: Some(summary_method.to_string()),
            summary_tool: Some(summary_tool.to_string()),
            generated_at: Some(Utc::now().timestamp_millis()),
            created_at: Utc::now().timestamp_millis(),
        };

        ActivityDao::insert_report(&conn, &report).map_err(|e| e.to_string())?;
        Ok(report)
    }

    /// Get sessions for a time range (used by commands)
    pub fn get_sessions_in_range(
        &self,
        start: i64,
        end: i64,
    ) -> Result<Vec<AiSession>, String> {
        let conn = self.db.conn().lock().unwrap();
        ActivityDao::get_sessions_in_range(&conn, start, end)
            .map_err(|e| e.to_string())
    }
}

fn report_label(report_type: &str) -> String {
    match report_type {
        "daily" => "日报".to_string(),
        "weekly" => "周报".to_string(),
        "monthly" => "月报".to_string(),
        _ => report_type.to_string(),
    }
}

fn format_duration(secs: i64) -> String {
    let hours = secs / 3600;
    let mins = (secs % 3600) / 60;
    format!("{}h {}m", hours, mins)
}

fn format_date_range(start: i64, end: i64) -> String {
    let start_dt = DateTime::from_timestamp(start / 1000, ((start % 1000) * 1_000_000) as u32)
        .unwrap_or_default()
        .naive_utc();
    let end_dt = DateTime::from_timestamp(end / 1000, ((end % 1000) * 1_000_000) as u32)
        .unwrap_or_default()
        .naive_utc();
    format!(
        "{} - {}",
        start_dt.format("%Y-%m-%d"),
        end_dt.format("%Y-%m-%d")
    )
}
