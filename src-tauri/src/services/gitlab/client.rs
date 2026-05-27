use reqwest::Client;
use serde::{Deserialize, Serialize};
use crate::error::{Result, ToolsError};

#[derive(Debug, Clone)]
pub enum GitLabAuth {
    Token(String),
    Password { username: String, password: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabProject {
    pub id: i64,
    pub path_with_namespace: String,
    pub name: String,
    pub web_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabCommit {
    pub id: String,
    pub short_id: String,
    pub title: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub created_at: String,
    pub web_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabMergeRequest {
    pub id: i64,
    pub iid: i64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub author: GitLabUser,
    pub source_branch: String,
    pub target_branch: String,
    pub web_url: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabUser {
    pub id: i64,
    pub username: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabDiffStats {
    pub additions: i64,
    pub deletions: i64,
    pub changes: i64,
}

pub struct GitLabClient {
    base_url: String,
    auth: GitLabAuth,
    http_client: Client,
}

impl GitLabClient {
    pub fn new(base_url: &str, auth: GitLabAuth) -> Result<Self> {
        let base_url = base_url.trim_end_matches('/').to_string();

        let http_client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| ToolsError::Http(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            base_url,
            auth,
            http_client,
        })
    }

    fn build_request(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.auth {
            GitLabAuth::Token(token) => request.header("PRIVATE-TOKEN", token),
            GitLabAuth::Password { username, password } => {
                request.basic_auth(username, Some(password))
            }
        }
    }

    pub async fn test_connection(&self) -> Result<bool> {
        let url = format!("{}/api/v4/user", self.base_url);
        let request = self.http_client.get(&url);
        let response = self.build_request(request)
            .send()
            .await
            .map_err(|e| ToolsError::Http(format!("Connection test failed: {}", e)))?;

        Ok(response.status().is_success())
    }

    pub async fn get_projects(&self, page: i32, per_page: i32) -> Result<Vec<GitLabProject>> {
        let url = format!(
            "{}/api/v4/projects?membership=true&per_page={}&page={}",
            self.base_url, per_page, page
        );

        let request = self.http_client.get(&url);
        let response = self.build_request(request)
            .send()
            .await
            .map_err(|e| ToolsError::Http(format!("Failed to fetch projects: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(ToolsError::Http(format!("GitLab API error: {} - {}", status, body)));
        }

        response.json::<Vec<GitLabProject>>()
            .await
            .map_err(|e| ToolsError::Http(format!("Failed to parse projects: {}", e)))
    }

    pub async fn get_all_projects(&self) -> Result<Vec<GitLabProject>> {
        let mut all_projects = Vec::new();
        let mut page = 1;
        let per_page = 100;

        loop {
            let projects = self.get_projects(page, per_page).await?;
            if projects.is_empty() {
                break;
            }
            all_projects.extend(projects);
            page += 1;
        }

        Ok(all_projects)
    }

    pub async fn get_commits(&self, project_id: i64, since: &str, page: i32, per_page: i32) -> Result<Vec<GitLabCommit>> {
        let url = format!(
            "{}/api/v4/projects/{}/repository/commits?since={}&per_page={}&page={}",
            self.base_url, project_id, since, per_page, page
        );

        let request = self.http_client.get(&url);
        let response = self.build_request(request)
            .send()
            .await
            .map_err(|e| ToolsError::Http(format!("Failed to fetch commits: {}", e)))?;

        if response.status().as_u16() == 404 {
            return Ok(Vec::new());
        }

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(ToolsError::Http(format!("GitLab API error: {} - {}", status, body)));
        }

        response.json::<Vec<GitLabCommit>>()
            .await
            .map_err(|e| ToolsError::Http(format!("Failed to parse commits: {}", e)))
    }

    pub async fn get_all_commits(&self, project_id: i64, since: &str) -> Result<Vec<GitLabCommit>> {
        let mut all_commits = Vec::new();
        let mut page = 1;
        let per_page = 100;

        loop {
            let commits = self.get_commits(project_id, since, page, per_page).await?;
            if commits.is_empty() {
                break;
            }
            all_commits.extend(commits);
            page += 1;
        }

        Ok(all_commits)
    }

    pub async fn get_commit_diff(&self, project_id: i64, commit_sha: &str) -> Result<GitLabDiffStats> {
        let url = format!(
            "{}/api/v4/projects/{}/repository/commits/{}/diff",
            self.base_url, project_id, commit_sha
        );

        let request = self.http_client.get(&url);
        let response = self.build_request(request)
            .send()
            .await
            .map_err(|e| ToolsError::Http(format!("Failed to fetch commit diff: {}", e)))?;

        if !response.status().is_success() {
            return Ok(GitLabDiffStats { additions: 0, deletions: 0, changes: 0 });
        }

        #[derive(Deserialize)]
        struct DiffFile {
            diff: Option<String>,
        }

        let diffs: Vec<DiffFile> = response.json()
            .await
            .map_err(|e| ToolsError::Http(format!("Failed to parse diff: {}", e)))?;

        let mut additions = 0i64;
        let mut deletions = 0i64;

        for diff in diffs {
            if let Some(diff_text) = diff.diff {
                for line in diff_text.lines() {
                    if line.starts_with('+') && !line.starts_with("+++") {
                        additions += 1;
                    } else if line.starts_with('-') && !line.starts_with("---") {
                        deletions += 1;
                    }
                }
            }
        }

        Ok(GitLabDiffStats {
            additions,
            deletions,
            changes: additions + deletions,
        })
    }

    pub async fn get_merge_requests(&self, project_id: i64, state: &str) -> Result<Vec<GitLabMergeRequest>> {
        let url = format!(
            "{}/api/v4/projects/{}/merge_requests?state={}&per_page=100",
            self.base_url, project_id, state
        );

        let request = self.http_client.get(&url);
        let response = self.build_request(request)
            .send()
            .await
            .map_err(|e| ToolsError::Http(format!("Failed to fetch merge requests: {}", e)))?;

        if !response.status().is_success() {
            return Ok(Vec::new());
        }

        response.json::<Vec<GitLabMergeRequest>>()
            .await
            .map_err(|e| ToolsError::Http(format!("Failed to parse merge requests: {}", e)))
    }
}
