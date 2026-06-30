use serde::{Deserialize, Serialize};

fn default_f64() -> f64 { 0.0 }
fn default_i64() -> i64 { 0 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCoverageOverall {
    pub ai_rate: f64,
    pub total_lines: i64,
    pub ai_lines: i64,
    #[serde(default = "default_i64")]
    pub test_lines: i64,
    #[serde(default = "default_i64")]
    pub test_ai_lines: i64,
    #[serde(default = "default_i64")]
    pub non_test_lines: i64,
    #[serde(default = "default_i64")]
    pub non_test_ai_lines: i64,
    #[serde(default = "default_f64")]
    pub non_test_ai_rate: f64,
    pub total_commits: i64,
    pub commits_with_ai: i64,
}

/// Recursively remove any child object that is an "author" stub
/// (objects with `_isAuthor: true`). These appear in the API response
/// mixed inside `children` arrays and confuse the department schema.
pub fn strip_author_objects(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            // 递归处理所有子字段（包括 children, departments 等）
            for (_, v) in map.iter_mut() {
                strip_author_objects(v);
            }
            // 然后从 children 数组中移除 _isAuthor stub
            if let Some(children) = map.get_mut("children") {
                if let serde_json::Value::Array(arr) = children {
                    arr.retain(|v| match v {
                        serde_json::Value::Object(m) => !m.get("_isAuthor").and_then(|x| x.as_bool()).unwrap_or(false),
                        _ => true,
                    });
                }
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr.iter_mut() {
                strip_author_objects(item);
            }
        }
        _ => {}
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCoverageDepartment {
    pub name: String,
    #[serde(default = "default_i64")]
    pub total_lines: i64,
    #[serde(default = "default_i64")]
    pub ai_lines: i64,
    #[serde(default = "default_i64")]
    pub test_lines: i64,
    #[serde(default = "default_i64")]
    pub test_ai_lines: i64,
    #[serde(default = "default_i64")]
    pub non_test_lines: i64,
    #[serde(default = "default_i64")]
    pub non_test_ai_lines: i64,
    #[serde(default = "default_f64")]
    pub non_test_ai_rate: f64,
    #[serde(default = "default_i64")]
    pub total_commits: i64,
    #[serde(default = "default_i64")]
    pub commits_with_ai: i64,
    #[serde(default = "default_i64")]
    pub contributor_count: i64,
    #[serde(default = "default_f64")]
    pub ai_rate: f64,
    #[serde(default)]
    pub department_l3: Option<String>,
    #[serde(default)]
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
    #[serde(default = "default_i64")]
    pub test_lines: i64,
    #[serde(default = "default_i64")]
    pub test_ai_lines: i64,
    #[serde(default = "default_i64")]
    pub non_test_lines: i64,
    #[serde(default = "default_i64")]
    pub non_test_ai_lines: i64,
    pub commits_with_ai: i64,
    pub ai_rate: f64,
    #[serde(default = "default_f64")]
    pub non_test_ai_rate: f64,
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
    #[serde(default = "default_i64")]
    pub test_additions: i64,
    #[serde(default = "default_i64")]
    pub test_ai_lines: i64,
    #[serde(default = "default_i64")]
    pub non_test_lines: i64,
    #[serde(default = "default_i64")]
    pub non_test_ai_lines: i64,
    pub ai_rate: f64,
    #[serde(default = "default_f64")]
    pub non_test_ai_rate: f64,
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
pub struct ExcludedFile {
    pub path: String,
    pub additions: i64,
    pub deletions: i64,
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
    pub excluded_files: Vec<ExcludedFile>,
    pub valid_files: Vec<ValidFile>,
}

#[tauri::command]
pub async fn get_ai_coverage(start_date: String, end_date: String) -> Result<AiCoverageResponse, String> {
    let start = std::time::Instant::now();
    log::info!("[AI Coverage] >>> get_ai_coverage start_date={} end_date={}", start_date, end_date);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| {
            log::error!("[AI Coverage] xxx build client failed: {}", e);
            format!("build client failed: {}", e)
        })?;

    let url = format!(
        "http://10.24.12.40/api/ai-stats/coverage?start_date={}&end_date={}",
        start_date, end_date
    );
    log::info!("[AI Coverage] >>> GET {}", url);

    let resp = client
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "http://10.24.12.40/ai-stats/department")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| {
            log::error!("[AI Coverage] xxx request failed: {}", e);
            format!("Request failed: {}", e)
        })?;

    let status = resp.status();
    let headers = resp.headers().clone();
    log::info!("[AI Coverage] <<< response status: {}", status);
    log::debug!("[AI Coverage] <<< response headers: {:?}", headers);

    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        log::error!("[AI Coverage] xxx api error {} body: {}", status, body);
        return Err(format!("API error: {} - {}", status, body));
    }

    let body_text = resp.text().await.map_err(|e| {
        log::error!("[AI Coverage] xxx read body failed: {}", e);
        format!("read body failed: {}", e)
    })?;
    log::info!("[AI Coverage] <<< body length: {} bytes", body_text.len());
    log::debug!("[AI Coverage] <<< body preview: {}",
        &body_text.chars().take(500).collect::<String>());

    // Pre-process: strip any `_isAuthor` stubs that the API accidentally
    // mixes into the `children` arrays. Without this, serde fails on
    // those objects because they lack `contributor_count` and other
    // department-only fields.
    let mut value: serde_json::Value = serde_json::from_str(&body_text).map_err(|e| {
        log::error!("[AI Coverage] xxx json parse error: {}", e);
        format!("JSON parse error: {}", e)
    })?;
    strip_author_objects(&mut value);
    log::info!("[AI Coverage] <<< stripped author stubs from children arrays");

    let data: AiCoverageResponse = serde_json::from_value(value).map_err(|e| {
        log::error!("[AI Coverage] xxx parse error: {}", e);
        log::error!("[AI Coverage] xxx body was: {}", &body_text.chars().take(2000).collect::<String>());
        format!("Parse error: {}", e)
    })?;

    log::info!("[AI Coverage] <<< parsed: {} departments, overall ai_rate={:.2}% (took {:?})",
        data.departments.len(), data.overall.ai_rate, start.elapsed());
    Ok(data)
}

#[tauri::command]
pub async fn get_ai_coverage_authors(
    department: String,
    department_l2: Option<String>,
    start_date: String,
    end_date: String,
) -> Result<Vec<AiCoverageAuthor>, String> {
    let start = std::time::Instant::now();
    log::info!("[AI Coverage] >>> get_ai_coverage_authors department={:?} dept_l2={:?} start_date={} end_date={}",
        department, department_l2, start_date, end_date);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| {
            log::error!("[AI Coverage] xxx build client failed: {}", e);
            format!("build client failed: {}", e)
        })?;

    let mut url = format!(
        "http://10.24.12.40/api/ai-stats/coverage-authors?department={}&start_date={}&end_date={}",
        urlencoding::encode(&department),
        start_date,
        end_date
    );

    if let Some(l2) = department_l2 {
        url.push_str(&format!("&department_l2={}", urlencoding::encode(&l2)));
    }
    log::info!("[AI Coverage] >>> GET {}", url);

    let resp = client
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "http://10.24.12.40/ai-stats/department")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| {
            log::error!("[AI Coverage] xxx request failed: {}", e);
            format!("Request failed: {}", e)
        })?;

    let status = resp.status();
    log::info!("[AI Coverage] <<< response status: {}", status);
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        log::error!("[AI Coverage] xxx api error {} body: {}", status, body);
        return Err(format!("API error: {} - {}", status, body));
    }

    let body_text = resp.text().await.map_err(|e| format!("read body failed: {}", e))?;
    log::info!("[AI Coverage] <<< body length: {} bytes", body_text.len());
    let data: Vec<AiCoverageAuthor> = serde_json::from_str(&body_text).map_err(|e| {
        log::error!("[AI Coverage] xxx parse error: {}", e);
        format!("Parse error: {}", e)
    })?;
    log::info!("[AI Coverage] <<< parsed: {} authors (took {:?})", data.len(), start.elapsed());
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
    let start = std::time::Instant::now();
    log::info!("[AI Coverage] >>> get_ai_coverage_commits department={:?} dept_l2={:?} author_email={:?} start_date={} end_date={}",
        department, department_l2, author_email, start_date, end_date);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| {
            log::error!("[AI Coverage] xxx build client failed: {}", e);
            format!("build client failed: {}", e)
        })?;

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
    log::info!("[AI Coverage] >>> GET {}", url);

    let resp = client
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "http://10.24.12.40/ai-stats/department")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| {
            log::error!("[AI Coverage] xxx request failed: {}", e);
            format!("Request failed: {}", e)
        })?;

    let status = resp.status();
    log::info!("[AI Coverage] <<< response status: {}", status);
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        log::error!("[AI Coverage] xxx api error {} body: {}", status, body);
        return Err(format!("API error: {} - {}", status, body));
    }

    let body_text = resp.text().await.map_err(|e| format!("read body failed: {}", e))?;
    log::info!("[AI Coverage] <<< body length: {} bytes", body_text.len());
    let data: Vec<AiCoverageCommit> = serde_json::from_str(&body_text).map_err(|e| {
        log::error!("[AI Coverage] xxx parse error: {}", e);
        format!("Parse error: {}", e)
    })?;
    log::info!("[AI Coverage] <<< parsed: {} commits (took {:?})", data.len(), start.elapsed());
    Ok(data)
}

#[tauri::command]
pub async fn get_ai_commit_detail(
    project_name: String,
    commit_sha: String,
    gitlab_project_id: i64,
) -> Result<CommitCheckResponse, String> {
    let start = std::time::Instant::now();
    log::info!("[AI Coverage] >>> get_ai_commit_detail project_name={:?} commit_sha={:?} gitlab_project_id={}",
        project_name, commit_sha, gitlab_project_id);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| {
            log::error!("[AI Coverage] xxx build client failed: {}", e);
            format!("build client failed: {}", e)
        })?;

    let url = format!(
        "http://10.24.12.40/api/ai-stats/check-commit?project_name={}&commit_sha={}&gitlab_project_id={}",
        urlencoding::encode(&project_name),
        urlencoding::encode(&commit_sha),
        gitlab_project_id
    );
    log::info!("[AI Coverage] >>> GET {}", url);

    let resp = client
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "http://10.24.12.40/ai-stats/check")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| {
            log::error!("[AI Coverage] xxx request failed: {}", e);
            format!("Request failed: {}", e)
        })?;

    let status = resp.status();
    log::info!("[AI Coverage] <<< response status: {}", status);
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        log::error!("[AI Coverage] xxx api error {} body: {}", status, body);
        return Err(format!("API error: {} - {}", status, body));
    }

    let body_text = resp.text().await.map_err(|e| format!("read body failed: {}", e))?;
    log::info!("[AI Coverage] <<< body length: {} bytes", body_text.len());
    let data: CommitCheckResponse = serde_json::from_str(&body_text).map_err(|e| {
        log::error!("[AI Coverage] xxx parse error: {}", e);
        format!("Parse error: {}", e)
    })?;
    log::info!("[AI Coverage] <<< parsed commit detail: tool={} valid_files={} excluded_files={} (took {:?})",
        data.ai_note.tool_name, data.valid_files.len(), data.excluded_files.len(), start.elapsed());
    Ok(data)
}
