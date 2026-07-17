use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::error::{ToolsError, Result};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiTool {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub watch_paths: String,
    pub parser_type: String,
    pub config: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiSession {
    pub id: String,
    pub tool_id: String,
    pub project_name: Option<String>,
    pub project_path: Option<String>,
    pub title: Option<String>,
    pub message_count: i32,
    pub duration_secs: i32,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub source: String,
    pub raw_path: Option<String>,
    pub summary: Option<String>,
    pub tags: String,
    pub metadata: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiActivity {
    pub id: String,
    pub session_id: String,
    pub activity_type: String,
    pub role: Option<String>,
    pub content_preview: Option<String>,
    pub tool_name: Option<String>,
    pub file_path: Option<String>,
    pub lines_added: Option<i32>,
    pub lines_removed: Option<i32>,
    pub timestamp: i64,
    pub metadata: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiReport {
    pub id: String,
    pub report_type: String,
    pub title: String,
    pub range_start: i64,
    pub range_end: i64,
    pub content: Option<String>,
    pub stats: String,
    pub session_ids: String,
    pub summary_method: Option<String>,
    pub summary_tool: Option<String>,
    pub generated_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiReportTemplate {
    pub id: String,
    pub name: String,
    pub body: String,
    pub is_default: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// The default report prompt template. Uses `{{placeholder}}` tokens that are
/// substituted by the reporter before sending to the AI.
pub const DEFAULT_REPORT_TEMPLATE_BODY: &str = r#"你是一个专业的工作总结助手。请根据以下用户在 AI 工具中的提问记录，生成{{report_type}}。

## 时间范围
{{date_range}}

## 整体数据
- AI 工具使用总时长：{{total_duration}}
- 总会话数：{{total_sessions}}
- 总对话轮次：{{total_messages}}

## 各工具使用分布
```json
{{tool_distribution}}
```

## 会话与提问记录（用户的真实提问，按时间顺序）
{{session_questions}}

## 要求
1. 重点总结用户在这段时间内**关注了哪些问题、做了什么工作**，从提问中提炼工作主题和意图
2. 按项目 / 工作类型归类组织
3. 不需要详细描述每个任务的实现过程和结果，聚焦"做了什么"
4. 标注涉及的 AI 工具
5. 输出格式为 Markdown，结构化
6. 输出语言：中文
7. 不要添加超出提问记录的内容
"#;

pub struct ActivityDao;

#[allow(dead_code)]
impl ActivityDao {
    // ==================== AiTool ====================

    pub fn get_all_tools(conn: &Connection) -> Result<Vec<AiTool>> {
        let mut stmt = conn
            .prepare("SELECT id, name, enabled, watch_paths, parser_type, config, created_at, updated_at FROM ai_tools ORDER BY name")?;
        let rows = stmt.query_map([], |row| {
            Ok(AiTool {
                id: row.get(0)?,
                name: row.get(1)?,
                enabled: row.get::<_, i32>(2)? != 0,
                watch_paths: row.get(3)?,
                parser_type: row.get(4)?,
                config: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| ToolsError::Database(e))
    }

    pub fn get_enabled_tools(conn: &Connection) -> Result<Vec<AiTool>> {
        let mut stmt = conn
            .prepare("SELECT id, name, enabled, watch_paths, parser_type, config, created_at, updated_at FROM ai_tools WHERE enabled = 1 ORDER BY name")?;
        let rows = stmt.query_map([], |row| {
            Ok(AiTool {
                id: row.get(0)?,
                name: row.get(1)?,
                enabled: true,
                watch_paths: row.get(2)?,
                parser_type: row.get(3)?,
                config: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| ToolsError::Database(e))
    }

    pub fn update_tool(
        conn: &Connection,
        id: &str,
        enabled: bool,
        watch_paths: &str,
        config: &str,
    ) -> Result<()> {
        conn.execute(
            "UPDATE ai_tools SET enabled = ?, watch_paths = ?, config = ?, updated_at = ? WHERE id = ?",
            rusqlite::params![
                enabled as i32,
                watch_paths,
                config,
                chrono::Utc::now().timestamp_millis(),
                id
            ],
        )?;
        Ok(())
    }

    // ==================== AiSession ====================

    pub fn insert_session(conn: &Connection, session: &AiSession) -> Result<()> {
        conn.execute(
            "INSERT INTO ai_sessions (id, tool_id, project_name, project_path, title, message_count, duration_secs, started_at, ended_at, source, raw_path, summary, tags, metadata, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            rusqlite::params![
                session.id,
                session.tool_id,
                session.project_name,
                session.project_path,
                session.title,
                session.message_count,
                session.duration_secs,
                session.started_at,
                session.ended_at,
                session.source,
                session.raw_path,
                session.summary,
                session.tags,
                session.metadata,
                session.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn session_exists(conn: &Connection, id: &str) -> Result<bool> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM ai_sessions WHERE id = ?1",
            [id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Insert or update a session (deterministic id enables upsert on re-parse).
    /// Preserves `summary`, `tags`, and `created_at` across rescans.
    pub fn upsert_session(conn: &Connection, session: &AiSession) -> Result<()> {
        // Create the row if it doesn't exist yet (sets created_at, default summary/tags).
        conn.execute(
            "INSERT OR IGNORE INTO ai_sessions (id, tool_id, project_name, project_path, title, message_count, duration_secs, started_at, ended_at, source, raw_path, summary, tags, metadata, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, '[]', ?12, ?13)",
            rusqlite::params![
                session.id,
                session.tool_id,
                session.project_name,
                session.project_path,
                session.title,
                session.message_count,
                session.duration_secs,
                session.started_at,
                session.ended_at,
                session.source,
                session.raw_path,
                session.metadata,
                session.created_at,
            ],
        )?;
        // Refresh mutable fields only (leave summary/tags/created_at untouched).
        conn.execute(
            "UPDATE ai_sessions SET tool_id = ?2, project_name = ?3, project_path = ?4, title = ?5, message_count = ?6, duration_secs = ?7, started_at = ?8, ended_at = ?9, source = ?10, raw_path = ?11, metadata = ?12 WHERE id = ?1",
            rusqlite::params![
                session.id,
                session.tool_id,
                session.project_name,
                session.project_path,
                session.title,
                session.message_count,
                session.duration_secs,
                session.started_at,
                session.ended_at,
                session.source,
                session.raw_path,
                session.metadata,
            ],
        )?;
        Ok(())
    }

    pub fn delete_activities_for_session(conn: &Connection, session_id: &str) -> Result<()> {
        conn.execute(
            "DELETE FROM ai_activities WHERE session_id = ?1",
            [session_id],
        )?;
        Ok(())
    }

    /// Replace all activities for a session (delete + re-insert). Used on re-parse
    /// of a growing session file so activities stay in sync with the latest content.
    pub fn replace_activities(
        conn: &Connection,
        session_id: &str,
        activities: &[AiActivity],
    ) -> Result<()> {
        conn.execute(
            "DELETE FROM ai_activities WHERE session_id = ?1",
            [session_id],
        )?;
        for activity in activities {
            conn.execute(
                "INSERT OR IGNORE INTO ai_activities (id, session_id, activity_type, role, content_preview, tool_name, file_path, lines_added, lines_removed, timestamp, metadata)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                rusqlite::params![
                    activity.id,
                    activity.session_id,
                    activity.activity_type,
                    activity.role,
                    activity.content_preview,
                    activity.tool_name,
                    activity.file_path,
                    activity.lines_added,
                    activity.lines_removed,
                    activity.timestamp,
                    activity.metadata,
                ],
            )?;
        }
        Ok(())
    }

    /// Wipe all sessions + activities (for the "rebuild data" action).
    /// Keeps ai_tools and ai_reports intact. VACUUM reclaims disk space from
    /// the previously bloated metadata rows.
    pub fn delete_all_activity_data(conn: &Connection) -> Result<()> {
        conn.execute("DELETE FROM ai_activities", [])?;
        conn.execute("DELETE FROM ai_sessions", [])?;
        // Best-effort vacuum; ignore errors (e.g. if a statement is still open).
        let _ = conn.execute_batch("VACUUM");
        Ok(())
    }

    pub fn get_sessions(
        conn: &Connection,
        tool_id: Option<&str>,
        project_name: Option<&str>,
        start: i64,
        end: i64,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AiSession>> {
        // NOTE: metadata is intentionally omitted (selected as '') for list queries -
        // old sessions stored multi-MB raw_json there, which would balloon the IPC
        // payload. The list view never uses metadata.
        let mut sql = String::from(
            "SELECT id, tool_id, project_name, project_path, title, message_count, duration_secs, started_at, ended_at, source, raw_path, summary, tags, '' AS metadata, created_at FROM ai_sessions WHERE started_at >= ?1 AND started_at <= ?2",
        );
        // Build params dynamically so placeholder indices always match the bound values.
        let mut params: Vec<Box<dyn rusqlite::ToSql>> =
            vec![Box::new(start), Box::new(end)];
        let mut idx = 3;

        if let Some(tid) = tool_id {
            sql.push_str(&format!(" AND tool_id = ?{idx}"));
            params.push(Box::new(tid.to_string()));
            idx += 1;
        }
        if let Some(pn) = project_name {
            sql.push_str(&format!(" AND project_name = ?{idx}"));
            params.push(Box::new(pn.to_string()));
            idx += 1;
        }

        sql.push_str(&format!(
            " ORDER BY started_at DESC LIMIT ?{idx} OFFSET ?{}",
            idx + 1
        ));
        params.push(Box::new(limit));
        params.push(Box::new(offset));

        let params_ref: Vec<&dyn rusqlite::ToSql> =
            params.iter().map(|b| b.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_ref.as_slice(), |row| {
            Ok(AiSession {
                id: row.get(0)?,
                tool_id: row.get(1)?,
                project_name: row.get(2)?,
                project_path: row.get(3)?,
                title: row.get(4)?,
                message_count: row.get(5)?,
                duration_secs: row.get(6)?,
                started_at: row.get(7)?,
                ended_at: row.get(8)?,
                source: row.get(9)?,
                raw_path: row.get(10)?,
                summary: row.get(11)?,
                tags: row.get(12)?,
                metadata: row.get(13)?,
                created_at: row.get(14)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| ToolsError::Database(e))
    }

    pub fn get_session_count(
        conn: &Connection,
        tool_id: Option<&str>,
        start: i64,
        end: i64,
    ) -> Result<i64> {
        let mut sql = String::from(
            "SELECT COUNT(*) FROM ai_sessions WHERE started_at >= ?1 AND started_at <= ?2",
        );
        if tool_id.is_some() {
            sql.push_str(" AND tool_id = ?3");
        }
        let count: i64 = if let Some(tid) = tool_id {
            conn.query_row(&sql, rusqlite::params![start, end, tid], |row| row.get(0))?
        } else {
            conn.query_row(&sql, rusqlite::params![start, end], |row| row.get(0))?
        };
        Ok(count)
    }

    pub fn get_session_by_id(conn: &Connection, id: &str) -> Result<AiSession> {
        conn.query_row(
            "SELECT id, tool_id, project_name, project_path, title, message_count, duration_secs, started_at, ended_at, source, raw_path, summary, tags, '' AS metadata, created_at FROM ai_sessions WHERE id = ?1",
            [id],
            |row| {
                Ok(AiSession {
                    id: row.get(0)?,
                    tool_id: row.get(1)?,
                    project_name: row.get(2)?,
                    project_path: row.get(3)?,
                    title: row.get(4)?,
                    message_count: row.get(5)?,
                    duration_secs: row.get(6)?,
                    started_at: row.get(7)?,
                    ended_at: row.get(8)?,
                    source: row.get(9)?,
                    raw_path: row.get(10)?,
                    summary: row.get(11)?,
                    tags: row.get(12)?,
                    metadata: row.get(13)?,
                    created_at: row.get(14)?,
                })
            },
        ).map_err(|e| ToolsError::Database(e))
    }

    pub fn update_session_ended(
        conn: &Connection,
        id: &str,
        ended_at: i64,
        message_count: i32,
        duration_secs: i32,
    ) -> Result<()> {
        conn.execute(
            "UPDATE ai_sessions SET ended_at = ?1, message_count = ?2, duration_secs = ?3 WHERE id = ?4",
            rusqlite::params![ended_at, message_count, duration_secs, id],
        )?;
        Ok(())
    }

    pub fn update_session_summary(conn: &Connection, id: &str, summary: &str) -> Result<()> {
        conn.execute(
            "UPDATE ai_sessions SET summary = ?1 WHERE id = ?2",
            rusqlite::params![summary, id],
        )?;
        Ok(())
    }

    // ==================== AiActivity ====================

    pub fn insert_activities(conn: &Connection, activities: &[AiActivity]) -> Result<()> {
        for activity in activities {
            conn.execute(
                "INSERT OR IGNORE INTO ai_activities (id, session_id, activity_type, role, content_preview, tool_name, file_path, lines_added, lines_removed, timestamp, metadata)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                rusqlite::params![
                    activity.id,
                    activity.session_id,
                    activity.activity_type,
                    activity.role,
                    activity.content_preview,
                    activity.tool_name,
                    activity.file_path,
                    activity.lines_added,
                    activity.lines_removed,
                    activity.timestamp,
                    activity.metadata,
                ],
            )?;
        }
        Ok(())
    }

    pub fn get_activities_for_session(conn: &Connection, session_id: &str) -> Result<Vec<AiActivity>> {
        let mut stmt = conn.prepare(
            "SELECT id, session_id, activity_type, role, content_preview, tool_name, file_path, lines_added, lines_removed, timestamp, metadata FROM ai_activities WHERE session_id = ?1 ORDER BY timestamp",
        )?;
        let rows = stmt.query_map([session_id], |row| {
            Ok(AiActivity {
                id: row.get(0)?,
                session_id: row.get(1)?,
                activity_type: row.get(2)?,
                role: row.get(3)?,
                content_preview: row.get(4)?,
                tool_name: row.get(5)?,
                file_path: row.get(6)?,
                lines_added: row.get(7)?,
                lines_removed: row.get(8)?,
                timestamp: row.get(9)?,
                metadata: row.get(10)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| ToolsError::Database(e))
    }

    // ==================== AiReport ====================

    pub fn insert_report(conn: &Connection, report: &AiReport) -> Result<()> {
        conn.execute(
            "INSERT INTO ai_reports (id, report_type, title, range_start, range_end, content, stats, session_ids, summary_method, summary_tool, generated_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                report.id,
                report.report_type,
                report.title,
                report.range_start,
                report.range_end,
                report.content,
                report.stats,
                report.session_ids,
                report.summary_method,
                report.summary_tool,
                report.generated_at,
                report.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_reports(
        conn: &Connection,
        report_type: Option<&str>,
        limit: i64,
    ) -> Result<Vec<AiReport>> {
        let mut sql = String::from(
            "SELECT id, report_type, title, range_start, range_end, content, stats, session_ids, summary_method, summary_tool, generated_at, created_at FROM ai_reports",
        );
        if report_type.is_some() {
            sql.push_str(" WHERE report_type = ?1 ORDER BY range_start DESC LIMIT ?2");
        } else {
            sql.push_str(" ORDER BY range_start DESC LIMIT ?1");
        }

        let mut stmt = conn.prepare(&sql)?;
        let map_row = |row: &rusqlite::Row<'_>| -> std::result::Result<AiReport, rusqlite::Error> {
            Ok(AiReport {
                id: row.get(0)?,
                report_type: row.get(1)?,
                title: row.get(2)?,
                range_start: row.get(3)?,
                range_end: row.get(4)?,
                content: row.get(5)?,
                stats: row.get(6)?,
                session_ids: row.get(7)?,
                summary_method: row.get(8)?,
                summary_tool: row.get(9)?,
                generated_at: row.get(10)?,
                created_at: row.get(11)?,
            })
        };

        let rows = if let Some(rt) = report_type {
            stmt.query_map(rusqlite::params![rt, limit], map_row)?
        } else {
            stmt.query_map(rusqlite::params![limit], map_row)?
        };
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| ToolsError::Database(e))
    }

    pub fn delete_report(conn: &Connection, id: &str) -> Result<()> {
        conn.execute("DELETE FROM ai_reports WHERE id = ?1", [id])?;
        Ok(())
    }

    /// Get sessions within a time range for report generation
    pub fn get_sessions_in_range(
        conn: &Connection,
        start: i64,
        end: i64,
    ) -> Result<Vec<AiSession>> {
        let mut stmt = conn.prepare(
            "SELECT id, tool_id, project_name, project_path, title, message_count, duration_secs, started_at, ended_at, source, raw_path, summary, tags, '' AS metadata, created_at FROM ai_sessions WHERE started_at >= ?1 AND started_at <= ?2 ORDER BY started_at ASC",
        )?;
        let rows = stmt.query_map(rusqlite::params![start, end], |row| {
            Ok(AiSession {
                id: row.get(0)?,
                tool_id: row.get(1)?,
                project_name: row.get(2)?,
                project_path: row.get(3)?,
                title: row.get(4)?,
                message_count: row.get(5)?,
                duration_secs: row.get(6)?,
                started_at: row.get(7)?,
                ended_at: row.get(8)?,
                source: row.get(9)?,
                raw_path: row.get(10)?,
                summary: row.get(11)?,
                tags: row.get(12)?,
                metadata: row.get(13)?,
                created_at: row.get(14)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| ToolsError::Database(e))
    }

    /// Count tool usage in a time range (for stats)
    pub fn get_tool_distribution(
        conn: &Connection,
        start: i64,
        end: i64,
    ) -> Result<Vec<(String, i64)>> {
        let mut stmt = conn.prepare(
            "SELECT tool_id, COUNT(*) as cnt FROM ai_sessions WHERE started_at >= ?1 AND started_at <= ?2 GROUP BY tool_id ORDER BY cnt DESC",
        )?;
        let rows = stmt.query_map(rusqlite::params![start, end], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| ToolsError::Database(e))
    }

    /// All user-role messages (the user's actual questions/prompts) for sessions
    /// whose started_at falls in [start, end]. Used to feed the report generator.
    pub fn get_user_messages_in_range(
        conn: &Connection,
        start: i64,
        end: i64,
    ) -> Result<Vec<UserMessageRow>> {        let mut stmt = conn.prepare(
            "SELECT a.session_id, s.tool_id, s.project_name, s.title, a.content_preview, a.timestamp
             FROM ai_activities a
             JOIN ai_sessions s ON a.session_id = s.id
             WHERE s.started_at >= ?1 AND s.started_at <= ?2
               AND a.role = 'user'
               AND a.content_preview IS NOT NULL AND a.content_preview != ''
             ORDER BY s.started_at ASC, a.timestamp ASC",
        )?;
        let rows = stmt.query_map(rusqlite::params![start, end], |row| {
            Ok(UserMessageRow {
                session_id: row.get(0)?,
                tool_id: row.get(1)?,
                project_name: row.get(2)?,
                title: row.get(3)?,
                content: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                timestamp: row.get(5)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| ToolsError::Database(e))
    }

    // ==================== AiReportTemplate ====================

    pub fn get_all_report_templates(conn: &Connection) -> Result<Vec<AiReportTemplate>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, body, is_default, created_at, updated_at FROM ai_report_templates ORDER BY is_default DESC, updated_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(AiReportTemplate {
                id: row.get(0)?,
                name: row.get(1)?,
                body: row.get(2)?,
                is_default: row.get::<_, i32>(3)? != 0,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| ToolsError::Database(e))
    }

    pub fn get_report_template(conn: &Connection, id: &str) -> Result<AiReportTemplate> {
        conn.query_row(
            "SELECT id, name, body, is_default, created_at, updated_at FROM ai_report_templates WHERE id = ?1",
            [id],
            |row| {
                Ok(AiReportTemplate {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    body: row.get(2)?,
                    is_default: row.get::<_, i32>(3)? != 0,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        )
        .map_err(|e| ToolsError::Database(e))
    }

    pub fn get_default_report_template(conn: &Connection) -> Result<Option<AiReportTemplate>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, body, is_default, created_at, updated_at FROM ai_report_templates WHERE is_default = 1 LIMIT 1",
        )?;
        let mut rows = stmt.query_map([], |row| {
            Ok(AiReportTemplate {
                id: row.get(0)?,
                name: row.get(1)?,
                body: row.get(2)?,
                is_default: true,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        match rows.next() {
            Some(r) => Ok(Some(r?)),
            None => Ok(None),
        }
    }

    pub fn upsert_report_template(conn: &Connection, t: &AiReportTemplate) -> Result<()> {
        conn.execute(
            "INSERT OR REPLACE INTO ai_report_templates (id, name, body, is_default, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                t.id,
                t.name,
                t.body,
                t.is_default as i32,
                t.created_at,
                t.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_report_template(conn: &Connection, id: &str) -> Result<()> {
        conn.execute("DELETE FROM ai_report_templates WHERE id = ?1", [id])?;
        Ok(())
    }

    /// Set one template as the default (and clear the flag on all others).
    pub fn set_default_report_template(conn: &Connection, id: &str) -> Result<()> {
        conn.execute("UPDATE ai_report_templates SET is_default = 0", [])?;
        conn.execute(
            "UPDATE ai_report_templates SET is_default = 1, updated_at = ?1 WHERE id = ?2",
            rusqlite::params![chrono::Utc::now().timestamp_millis(), id],
        )?;
        Ok(())
    }

    // ==================== TestgenRun ====================

    /// Insert a run record (call at start, status="running").
    pub fn insert_testgen_run(conn: &Connection, run: &TestgenRun) -> Result<()> {
        conn.execute(
            "INSERT INTO ai_testgen_runs (id, dir, project_name, branch, branch_mode, commit_sha, files_changed, test_passed, pushed, status, error, prompt_summary, started_at, finished_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![
                run.id, run.dir, run.project_name, run.branch, run.branch_mode,
                run.commit_sha, run.files_changed, run.test_passed as i32, run.pushed as i32,
                run.status, run.error, run.prompt_summary, run.started_at, run.finished_at,
            ],
        )?;
        Ok(())
    }

    /// Update a run record with final fields (call at finish).
    pub fn finish_testgen_run(conn: &Connection, run: &TestgenRun) -> Result<()> {
        conn.execute(
            "UPDATE ai_testgen_runs SET commit_sha = ?2, files_changed = ?3, test_passed = ?4, pushed = ?5, status = ?6, error = ?7, finished_at = ?8 WHERE id = ?1",
            rusqlite::params![
                run.id, run.commit_sha, run.files_changed, run.test_passed as i32,
                run.pushed as i32, run.status, run.error, run.finished_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_testgen_runs(conn: &Connection, limit: i64) -> Result<Vec<TestgenRun>> {
        let mut stmt = conn.prepare(
            "SELECT id, dir, project_name, branch, branch_mode, commit_sha, files_changed, test_passed, pushed, status, error, prompt_summary, started_at, finished_at FROM ai_testgen_runs ORDER BY started_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(rusqlite::params![limit], |row| {
            Ok(TestgenRun {
                id: row.get(0)?,
                dir: row.get(1)?,
                project_name: row.get(2)?,
                branch: row.get(3)?,
                branch_mode: row.get(4)?,
                commit_sha: row.get(5)?,
                files_changed: row.get(6)?,
                test_passed: row.get::<_, i32>(7)? != 0,
                pushed: row.get::<_, i32>(8)? != 0,
                status: row.get(9)?,
                error: row.get(10)?,
                prompt_summary: row.get(11)?,
                started_at: row.get(12)?,
                finished_at: row.get(13)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| ToolsError::Database(e))
    }
}

/// A user message (question) within a session, for report generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMessageRow {
    pub session_id: String,
    pub tool_id: String,
    pub project_name: Option<String>,
    pub title: Option<String>,
    pub content: String,
    pub timestamp: i64,
}

/// A TestGen execution run record (history).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestgenRun {
    pub id: String,
    pub dir: Option<String>,
    pub project_name: Option<String>,
    pub branch: Option<String>,
    pub branch_mode: Option<String>,
    pub commit_sha: Option<String>,
    pub files_changed: i32,
    pub test_passed: bool,
    pub pushed: bool,
    pub status: Option<String>, // "running" | "done" | "error" | "cancelled"
    pub error: Option<String>,
    pub prompt_summary: Option<String>,
    pub started_at: i64,
    pub finished_at: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE ai_sessions (
                id TEXT PRIMARY KEY, tool_id TEXT, project_name TEXT, project_path TEXT,
                title TEXT, message_count INTEGER, duration_secs INTEGER,
                started_at BIGINT, ended_at BIGINT, source TEXT, raw_path TEXT,
                summary TEXT, tags TEXT, metadata TEXT, created_at BIGINT
            );
            CREATE TABLE ai_activities (
                id TEXT PRIMARY KEY, session_id TEXT, activity_type TEXT, role TEXT,
                content_preview TEXT, tool_name TEXT, file_path TEXT,
                lines_added INTEGER, lines_removed INTEGER, timestamp BIGINT, metadata TEXT
            );
            "#,
        )
        .unwrap();
        conn
    }

    fn sample_session(id: &str, msgs: i32, created_at: i64) -> AiSession {
        AiSession {
            id: id.to_string(),
            tool_id: "claude-code".to_string(),
            project_name: None,
            project_path: None,
            title: Some("t".to_string()),
            message_count: msgs,
            duration_secs: 0,
            started_at: 1000,
            ended_at: Some(2000),
            source: "watch".to_string(),
            raw_path: Some("/p".to_string()),
            summary: None,
            tags: "[]".to_string(),
            metadata: "{}".to_string(),
            created_at,
        }
    }

    #[test]
    fn upsert_session_does_not_duplicate_and_preserves_summary_created_at() {
        let conn = setup();
        ActivityDao::upsert_session(&conn, &sample_session("s1", 5, 111)).unwrap();

        // Simulate an AI summary being set between rescans.
        conn.execute("UPDATE ai_sessions SET summary = 'AI SUMMARY' WHERE id='s1'", [])
            .unwrap();

        // Re-parse (re-upsert) with a higher message count.
        ActivityDao::upsert_session(&conn, &sample_session("s1", 10, 999)).unwrap();

        let (count, created, summary, msg): (i64, i64, Option<String>, i64) = conn
            .query_row(
                "SELECT COUNT(*), created_at, summary, message_count FROM ai_sessions WHERE id='s1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(count, 1, "re-parse must not create a duplicate session");
        assert_eq!(created, 111, "created_at must be preserved across rescans");
        assert_eq!(
            summary.as_deref(),
            Some("AI SUMMARY"),
            "AI summary must be preserved across rescans"
        );
        assert_eq!(msg, 10, "message_count must be updated on re-parse");
    }

    #[test]
    fn replace_activities_swaps_not_appends() {
        let conn = setup();
        ActivityDao::upsert_session(&conn, &sample_session("s1", 0, 1)).unwrap();

        let old = vec![AiActivity {
            id: "a1".to_string(),
            session_id: "s1".to_string(),
            activity_type: "message".to_string(),
            role: Some("user".to_string()),
            content_preview: Some("old".to_string()),
            tool_name: None,
            file_path: None,
            lines_added: None,
            lines_removed: None,
            timestamp: 1,
            metadata: "{}".to_string(),
        }];
        ActivityDao::replace_activities(&conn, "s1", &old).unwrap();
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM ai_activities WHERE session_id='s1'"),
            1
        );

        let new = vec![
            AiActivity {
                id: "a2".to_string(),
                session_id: "s1".to_string(),
                activity_type: "message".to_string(),
                role: Some("user".to_string()),
                content_preview: Some("new1".to_string()),
                tool_name: None,
                file_path: None,
                lines_added: None,
                lines_removed: None,
                timestamp: 2,
                metadata: "{}".to_string(),
            },
            AiActivity {
                id: "a3".to_string(),
                session_id: "s1".to_string(),
                activity_type: "tool_call".to_string(),
                role: Some("assistant".to_string()),
                content_preview: Some("new2".to_string()),
                tool_name: Some("Edit".to_string()),
                file_path: None,
                lines_added: None,
                lines_removed: None,
                timestamp: 3,
                metadata: "{}".to_string(),
            },
        ];
        ActivityDao::replace_activities(&conn, "s1", &new).unwrap();

        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM ai_activities WHERE session_id='s1'"),
            2,
            "activities must be replaced, not appended"
        );
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM ai_activities WHERE id='a1'"),
            0,
            "old activities must be deleted on replace"
        );
    }

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn get_sessions_with_no_filters_returns_rows() {
        // Reproduces the SessionList call: no tool_id, no project_name.
        // The param-binding must not leave LIMIT bound to NULL.
        let conn = setup();
        ActivityDao::upsert_session(&conn, &sample_session("s1", 5, 1000)).unwrap();
        ActivityDao::upsert_session(&conn, &sample_session("s2", 3, 2000)).unwrap();

        let rows = ActivityDao::get_sessions(&conn, None, None, 0, i64::MAX, 100, 0)
            .expect("get_sessions with no filters must not error");
        assert_eq!(
            rows.len(),
            2,
            "get_sessions with no filters should return all matching rows"
        );
    }

    #[test]
    fn get_sessions_with_tool_filter_binds_limit_correctly() {
        let conn = setup();
        let mut s = sample_session("s1", 5, 1000);
        ActivityDao::upsert_session(&conn, &s).unwrap();
        s.id = "s2".to_string();
        s.tool_id = "codex".to_string();
        ActivityDao::upsert_session(&conn, &s).unwrap();

        let rows = ActivityDao::get_sessions(&conn, Some("codex"), None, 0, i64::MAX, 100, 0)
            .expect("get_sessions with tool filter must not error");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "s2");
    }
}
