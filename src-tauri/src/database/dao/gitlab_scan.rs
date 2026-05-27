use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use crate::error::Result;
use crate::services::gitlab::scanner::ScanResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabScanHistory {
    pub id: String,
    pub scan_type: String,
    pub scan_at: i64,
    pub scan_range_start: Option<String>,
    pub scan_range_end: Option<String>,
    pub total_projects: i32,
    pub total_commits: i32,
    pub total_lines_added: i64,
    pub total_lines_removed: i64,
    pub test_projects: i32,
    pub pending_mrs: i32,
    pub contributors: String,
    pub summary: String,
    pub created_at: i64,
    pub pipeline_total: i32,
    pub pipeline_success: i32,
    pub pipeline_failed: i32,
    pub developer_stats: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateGitLabScanRequest {
    pub scan_type: String,
    pub scan_range_start: Option<String>,
    pub scan_range_end: Option<String>,
    pub result: ScanResult,
}

pub struct GitLabScanDao;

impl GitLabScanDao {
    pub fn create(conn: &Connection, req: CreateGitLabScanRequest) -> Result<GitLabScanHistory> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        let contributors = serde_json::to_string(&req.result.contributors).unwrap_or_else(|_| "[]".to_string());
        let summary = serde_json::to_string(&req.result.projects).unwrap_or_else(|_| "[]".to_string());
        let developer_stats = serde_json::to_string(&req.result.developer_stats).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT INTO gitlab_scan_history (
                id, scan_type, scan_at, scan_range_start, scan_range_end,
                total_projects, total_commits, total_lines_added, total_lines_removed,
                test_projects, pending_mrs, contributors, summary, created_at,
                pipeline_total, pipeline_success, pipeline_failed, developer_stats
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                id,
                req.scan_type,
                req.result.scan_at,
                req.scan_range_start,
                req.scan_range_end,
                req.result.total_projects,
                req.result.total_commits,
                req.result.total_lines_added,
                req.result.total_lines_removed,
                req.result.test_projects,
                req.result.pending_mrs,
                contributors,
                summary,
                now,
                req.result.pipeline_total,
                req.result.pipeline_success,
                req.result.pipeline_failed,
                developer_stats,
            ],
        )?;

        Ok(GitLabScanHistory {
            id,
            scan_type: req.scan_type,
            scan_at: req.result.scan_at,
            scan_range_start: req.scan_range_start,
            scan_range_end: req.scan_range_end,
            total_projects: req.result.total_projects,
            total_commits: req.result.total_commits,
            total_lines_added: req.result.total_lines_added,
            total_lines_removed: req.result.total_lines_removed,
            test_projects: req.result.test_projects,
            pending_mrs: req.result.pending_mrs,
            contributors,
            summary,
            created_at: now,
            pipeline_total: req.result.pipeline_total,
            pipeline_success: req.result.pipeline_success,
            pipeline_failed: req.result.pipeline_failed,
            developer_stats,
        })
    }

    pub fn get_all(conn: &Connection, limit: Option<i32>) -> Result<Vec<GitLabScanHistory>> {
        let limit = limit.unwrap_or(50);
        let mut stmt = conn.prepare(
            "SELECT id, scan_type, scan_at, scan_range_start, scan_range_end,
                    total_projects, total_commits, total_lines_added, total_lines_removed,
                    test_projects, pending_mrs, contributors, summary, created_at,
                    pipeline_total, pipeline_success, pipeline_failed, developer_stats
             FROM gitlab_scan_history
             ORDER BY scan_at DESC
             LIMIT ?1"
        )?;

        let rows = stmt.query_map(params![limit], |row| {
            Ok(GitLabScanHistory {
                id: row.get(0)?,
                scan_type: row.get(1)?,
                scan_at: row.get(2)?,
                scan_range_start: row.get(3)?,
                scan_range_end: row.get(4)?,
                total_projects: row.get(5)?,
                total_commits: row.get(6)?,
                total_lines_added: row.get(7)?,
                total_lines_removed: row.get(8)?,
                test_projects: row.get(9)?,
                pending_mrs: row.get(10)?,
                contributors: row.get(11)?,
                summary: row.get(12)?,
                created_at: row.get(13)?,
                pipeline_total: row.get(14)?,
                pipeline_success: row.get(15)?,
                pipeline_failed: row.get(16)?,
                developer_stats: row.get(17)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }

        Ok(results)
    }

    pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<GitLabScanHistory>> {
        let mut stmt = conn.prepare(
            "SELECT id, scan_type, scan_at, scan_range_start, scan_range_end,
                    total_projects, total_commits, total_lines_added, total_lines_removed,
                    test_projects, pending_mrs, contributors, summary, created_at,
                    pipeline_total, pipeline_success, pipeline_failed, developer_stats
             FROM gitlab_scan_history
             WHERE id = ?1"
        )?;

        let mut rows = stmt.query_map(params![id], |row| {
            Ok(GitLabScanHistory {
                id: row.get(0)?,
                scan_type: row.get(1)?,
                scan_at: row.get(2)?,
                scan_range_start: row.get(3)?,
                scan_range_end: row.get(4)?,
                total_projects: row.get(5)?,
                total_commits: row.get(6)?,
                total_lines_added: row.get(7)?,
                total_lines_removed: row.get(8)?,
                test_projects: row.get(9)?,
                pending_mrs: row.get(10)?,
                contributors: row.get(11)?,
                summary: row.get(12)?,
                created_at: row.get(13)?,
                pipeline_total: row.get(14)?,
                pipeline_success: row.get(15)?,
                pipeline_failed: row.get(16)?,
                developer_stats: row.get(17)?,
            })
        })?;

        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<()> {
        conn.execute("DELETE FROM gitlab_scan_history WHERE id = ?1", params![id])?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn delete_old(conn: &Connection, keep_count: i32) -> Result<i32> {
        let deleted = conn.execute(
            "DELETE FROM gitlab_scan_history WHERE id NOT IN (
                SELECT id FROM gitlab_scan_history ORDER BY scan_at DESC LIMIT ?1
            )",
            params![keep_count]
        )?;
        Ok(deleted as i32)
    }
}
