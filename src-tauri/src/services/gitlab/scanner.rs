use crate::error::Result;
use super::client::{GitLabClient, GitLabProject, GitLabCommit};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use chrono::Datelike;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanConfig {
    pub filter_mode: FilterMode,
    pub filter_projects: Vec<String>,
    pub test_keywords: Vec<String>,
    pub scan_range: ScanRange,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FilterMode {
    Include,
    Exclude,
    All,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScanRange {
    Week,
    Days(i32),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub scan_at: i64,
    pub scan_type: String,
    pub total_projects: i32,
    pub total_commits: i32,
    pub total_lines_added: i64,
    pub total_lines_removed: i64,
    pub test_projects: i32,
    pub pending_mrs: i32,
    pub contributors: Vec<String>,
    pub projects: Vec<ProjectScanResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectScanResult {
    pub project_id: i64,
    pub project_name: String,
    pub commits: i32,
    pub lines_added: i64,
    pub lines_removed: i64,
    pub has_test: bool,
    pub test_commits: Vec<String>,
    pub pending_mrs: i32,
    pub contributors: Vec<String>,
    pub last_commit_at: String,
}

pub struct GitLabScanner {
    client: GitLabClient,
    config: ScanConfig,
}

impl GitLabScanner {
    pub fn new(client: GitLabClient, config: ScanConfig) -> Self {
        Self { client, config }
    }

    pub async fn scan(&self, scan_type: &str) -> Result<ScanResult> {
        let scan_at = chrono::Utc::now().timestamp_millis();
        let since = self.calculate_since()?;

        // Get all projects
        let all_projects = self.client.get_all_projects().await?;
        let filtered_projects = self.filter_projects(all_projects);

        let mut projects = Vec::new();
        let mut total_commits = 0i32;
        let mut total_lines_added = 0i64;
        let mut total_lines_removed = 0i64;
        let mut test_projects = 0i32;
        let mut pending_mrs = 0i32;
        let mut all_contributors: HashSet<String> = HashSet::new();

        for project in filtered_projects {
            match self.scan_project(&project, &since).await {
                Ok(result) => {
                    total_commits += result.commits;
                    total_lines_added += result.lines_added;
                    total_lines_removed += result.lines_removed;
                    if result.has_test {
                        test_projects += 1;
                    }
                    pending_mrs += result.pending_mrs;
                    for contributor in &result.contributors {
                        all_contributors.insert(contributor.clone());
                    }
                    projects.push(result);
                }
                Err(e) => {
                    log::warn!("Failed to scan project {}: {}", project.path_with_namespace, e);
                }
            }
        }

        Ok(ScanResult {
            scan_at,
            scan_type: scan_type.to_string(),
            total_projects: projects.len() as i32,
            total_commits,
            total_lines_added,
            total_lines_removed,
            test_projects,
            pending_mrs,
            contributors: all_contributors.into_iter().collect(),
            projects,
        })
    }

    fn calculate_since(&self) -> Result<String> {
        let now = chrono::Utc::now();
        let since = match &self.config.scan_range {
            ScanRange::Week => {
                // Start of current week (Monday)
                let weekday = now.weekday().num_days_from_monday() as i64;
                now - chrono::Duration::days(weekday)
            }
            ScanRange::Days(days) => {
                now - chrono::Duration::days(*days as i64)
            }
        };

        Ok(since.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
    }

    fn filter_projects(&self, projects: Vec<GitLabProject>) -> Vec<GitLabProject> {
        match &self.config.filter_mode {
            FilterMode::All => projects,
            FilterMode::Include => {
                projects.into_iter()
                    .filter(|p| {
                        let name_lower = p.path_with_namespace.to_lowercase();
                        self.config.filter_projects.iter()
                            .any(|filter| name_lower.contains(&filter.to_lowercase()))
                    })
                    .collect()
            }
            FilterMode::Exclude => {
                projects.into_iter()
                    .filter(|p| {
                        let name_lower = p.path_with_namespace.to_lowercase();
                        !self.config.filter_projects.iter()
                            .any(|filter| name_lower.contains(&filter.to_lowercase()))
                    })
                    .collect()
            }
        }
    }

    async fn scan_project(&self, project: &GitLabProject, since: &str) -> Result<ProjectScanResult> {
        let commits = self.client.get_all_commits(project.id, since).await?;

        if commits.is_empty() {
            return Ok(ProjectScanResult {
                project_id: project.id,
                project_name: project.path_with_namespace.clone(),
                commits: 0,
                lines_added: 0,
                lines_removed: 0,
                has_test: false,
                test_commits: Vec::new(),
                pending_mrs: 0,
                contributors: Vec::new(),
                last_commit_at: String::new(),
            });
        }

        // Collect contributors
        let mut contributors_set: HashSet<String> = HashSet::new();
        for commit in &commits {
            contributors_set.insert(commit.author_name.clone());
        }

        // Detect test commits
        let test_commits = self.detect_test_commits(&commits);
        let has_test = !test_commits.is_empty();

        // Calculate diff stats
        let mut total_lines_added = 0i64;
        let mut total_lines_removed = 0i64;

        for commit in &commits {
            match self.client.get_commit_diff(project.id, &commit.id).await {
                Ok(diff) => {
                    total_lines_added += diff.additions;
                    total_lines_removed += diff.deletions;
                }
                Err(e) => {
                    log::debug!("Failed to get diff for commit {}: {}", commit.short_id, e);
                }
            }
        }

        // Get pending MRs
        let mrs = self.client.get_merge_requests(project.id, "opened").await?;
        let pending_mrs_count = mrs.len() as i32;

        let last_commit_at = commits.first()
            .map(|c| c.created_at.clone())
            .unwrap_or_default();

        Ok(ProjectScanResult {
            project_id: project.id,
            project_name: project.path_with_namespace.clone(),
            commits: commits.len() as i32,
            lines_added: total_lines_added,
            lines_removed: total_lines_removed,
            has_test,
            test_commits,
            pending_mrs: pending_mrs_count,
            contributors: contributors_set.into_iter().collect(),
            last_commit_at,
        })
    }

    fn detect_test_commits(&self, commits: &[GitLabCommit]) -> Vec<String> {
        commits.iter()
            .filter(|commit| {
                let message_lower = commit.message.to_lowercase();
                self.config.test_keywords.iter()
                    .any(|keyword| message_lower.contains(&keyword.to_lowercase()))
            })
            .map(|commit| commit.title.clone())
            .collect()
    }
}
