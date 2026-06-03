use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCoverageOverall {
    pub ai_rate: f64,
    pub total_lines: i64,
    pub ai_lines: i64,
    pub total_commits: i64,
    pub commits_with_ai: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCoverageDepartment {
    pub name: String,
    pub total_lines: i64,
    pub ai_lines: i64,
    pub total_commits: i64,
    pub commits_with_ai: i64,
    pub contributor_count: i64,
    pub ai_rate: f64,
    pub children: Option<Vec<AiCoverageDepartment>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCoverageResponse {
    pub overall: AiCoverageOverall,
    pub departments: Vec<AiCoverageDepartment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCoverageAuthor {
    pub author_name: String,
    pub author_email: String,
    pub total_commits: i64,
    pub total_lines: i64,
    pub ai_lines: i64,
    pub commits_with_ai: i64,
    pub ai_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCoverageCommit {
    pub commit_id: i64,
    pub gitlab_id: String,
    pub short_sha: String,
    pub project_name: String,
    pub project_id: i64,
    pub project_gitlab_id: i64,
    pub title: String,
    pub committed_at: String,
    pub additions: i64,
    pub ai_lines: i64,
    pub ai_rate: f64,
}

// Commit detail structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitDetail {
    pub gitlab_id: String,
    pub title: String,
    pub author_name: String,
    pub author_email: String,
    pub branch: String,
    pub committed_at: String,
    pub web_url: String,
    pub additions: i64,
    pub deletions: i64,
    pub project_name: String,
    pub origin_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiNote {
    pub ai_lines_total: i64,
    pub frontmatter_ai_lines: i64,
    pub ai_tools: Vec<String>,
    pub ai_models: Vec<String>,
    pub prompts_count: i64,
    pub ai_source: String,
    pub git_ai_version: String,
    pub tool_name: String,
    pub model_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitStats {
    pub total_additions: i64,
    pub excluded_additions: i64,
    pub effective_additions: i64,
    pub ai_additions: i64,
    pub human_additions: i64,
    pub ai_rate: f64,
    pub valid_files_count: i64,
    pub excluded_files_count: i64,
    pub diff_truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidFile {
    pub path: String,
    pub additions: i64,
    pub deletions: i64,
    pub ai_lines: i64,
    pub human_lines: i64,
    pub ai_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitCheckResponse {
    pub commit: CommitDetail,
    pub ai_note: AiNote,
    pub stats: CommitStats,
    pub excluded_files: Vec<String>,
    pub valid_files: Vec<ValidFile>,
}

#[tauri::command]
pub async fn get_ai_coverage(start_date: String, end_date: String) -> Result<AiCoverageResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "http://10.24.12.40/api/ai-stats/coverage?start_date={}&end_date={}",
        start_date, end_date
    );

    let resp = client
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "http://10.24.12.40/ai-stats/department")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("API error: {}", resp.status()));
    }

    let data: AiCoverageResponse = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    Ok(data)
}

#[tauri::command]
pub async fn get_ai_coverage_authors(
    department: String,
    department_l2: Option<String>,
    start_date: String,
    end_date: String,
) -> Result<Vec<AiCoverageAuthor>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let mut url = format!(
        "http://10.24.12.40/api/ai-stats/coverage-authors?department={}&start_date={}&end_date={}",
        urlencoding::encode(&department),
        start_date,
        end_date
    );

    if let Some(l2) = department_l2 {
        url.push_str(&format!("&department_l2={}", urlencoding::encode(&l2)));
    }

    let resp = client
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "http://10.24.12.40/ai-stats/department")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("API error: {}", resp.status()));
    }

    let data: Vec<AiCoverageAuthor> = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    Ok(data)
}

#[tauri::command]
pub async fn get_ai_coverage_commits(
    department: String,
    department_l2: Option<String>,
    author_email: String,
    start_date: String,
    end_date: String,
) -> Result<Vec<AiCoverageCommit>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let mut url = format!(
        "http://10.24.12.40/api/ai-stats/coverage-author-commits?department={}&start_date={}&end_date={}&author_email={}",
        urlencoding::encode(&department),
        start_date,
        end_date,
        urlencoding::encode(&author_email)
    );

    if let Some(l2) = department_l2 {
        url.push_str(&format!("&department_l2={}", urlencoding::encode(&l2)));
    }

    let resp = client
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "http://10.24.12.40/ai-stats/department")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("API error: {}", resp.status()));
    }

    let data: Vec<AiCoverageCommit> = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    Ok(data)
}

#[tauri::command]
pub async fn get_ai_commit_detail(
    project_name: String,
    commit_sha: String,
    gitlab_project_id: i64,
) -> Result<CommitCheckResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "http://10.24.12.40/api/ai-stats/check-commit?project_name={}&commit_sha={}&gitlab_project_id={}",
        urlencoding::encode(&project_name),
        urlencoding::encode(&commit_sha),
        gitlab_project_id
    );

    let resp = client
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "http://10.24.12.40/ai-stats/check")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("API error: {}", resp.status()));
    }

    let data: CommitCheckResponse = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    Ok(data)
}
