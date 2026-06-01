use reqwest::Client;
use serde::{Deserialize, Serialize};
use crate::error::{Result, ToolsError};
use crate::services::walkin::WalkinAuth;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SonarReport {
    pub id: String,
    #[serde(rename = "createTime")]
    pub create_time: Option<String>,
    #[serde(rename = "commitId")]
    pub commit_id: Option<String>,
    #[serde(rename = "reportType")]
    pub report_type: Option<String>,
    #[serde(rename = "projectKey")]
    pub project_key: Option<String>,
    pub branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SonarFile {
    pub key: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SonarSourceLine {
    pub line: i32,
    pub code: Option<String>,
    pub duplicated: Option<bool>,
    #[serde(rename = "scmAuthor")]
    pub scm_author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergedRange {
    pub start: i32,
    pub end: i32,
}

impl MergedRange {
    pub fn to_display(&self) -> String {
        if self.start == self.end {
            format!("第{}行", self.start)
        } else {
            format!("第{}-{}行", self.start, self.end)
        }
    }
}

fn build_client() -> Result<Client> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| ToolsError::Http(format!("Failed to create HTTP client: {}", e)))
}

fn apply_auth(req: reqwest::RequestBuilder, auth: &WalkinAuth) -> reqwest::RequestBuilder {
    req.header("CSRF-TOKEN", &auth.csrf_token)
        .header("PROJECT", &auth.project)
        .header("WORKSPACE", &auth.workspace)
        .header("X-AUTH-TOKEN", &auth.x_auth_token)
        .header("Accept", "application/json, text/plain, */*")
}

/// 获取 Jenkins Report 列表
pub async fn get_report_list(
    base_url: &str,
    auth: &WalkinAuth,
    dept_id: &str,
    create_time_end: &str,
    project_key_not_like: &str,
    branch: &str,
    page: i32,
    limit: i32,
) -> Result<Vec<SonarReport>> {
    let client = build_client()?;
    let url = format!(
        "{}/track/synSonarInfo/getJenkinsReport",
        base_url.trim_end_matches('/')
    );

    let resp = apply_auth(
        client.get(&url).query(&[
            ("createTimeEnd", create_time_end),
            ("projectKeyNotLike", project_key_not_like),
            ("branch", branch),
            ("deptId", dept_id),
            ("page", &page.to_string()),
            ("limit", &limit.to_string()),
        ]),
        auth,
    )
    .send()
    .await
    .map_err(|e| ToolsError::Http(format!("Report list request failed: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(ToolsError::Http(format!("Report list API error {}: {}", status, body)));
    }

    let json: serde_json::Value = resp.json().await
        .map_err(|e| ToolsError::Http(format!("Failed to parse report list: {}", e)))?;

    let list = json["data"]["listObject"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let reports: Vec<SonarReport> = list
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();

    Ok(reports)
}

/// 获取文件列表
pub async fn get_file_list(
    base_url: &str,
    auth: &WalkinAuth,
    project_key: &str,
    branch: &str,
    report_id: &str,
) -> Result<Vec<SonarFile>> {
    let client = build_client()?;
    let url = format!(
        "{}/track/synSonarInfoData/newCoverageCodeDetails",
        base_url.trim_end_matches('/')
    );

    let resp = apply_auth(
        client.get(&url).query(&[
            ("key", project_key),
            ("branch", branch),
            ("reportId", report_id),
            ("selectPageType", "代码行"),
        ]),
        auth,
    )
    .send()
    .await
    .map_err(|e| ToolsError::Http(format!("File list request failed: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(ToolsError::Http(format!("File list API error {}: {}", status, body)));
    }

    let json: serde_json::Value = resp.json().await
        .map_err(|e| ToolsError::Http(format!("Failed to parse file list: {}", e)))?;

    let list = json["data"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let files: Vec<SonarFile> = list
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();

    Ok(files)
}

/// 获取源码覆盖信息
pub async fn get_source_lines(
    base_url: &str,
    auth: &WalkinAuth,
    project_key: &str,
    file_key: &str,
    branch: &str,
) -> Result<Vec<SonarSourceLine>> {
    let client = build_client()?;
    let url = format!(
        "{}/track/synSonarInfoData/newCoverageCodeDetails/source",
        base_url.trim_end_matches('/')
    );

    let encoded_key = urlencoding::encode(file_key);

    let resp = apply_auth(
        client.get(&url).query(&[
            ("projectKey", project_key),
            ("key", &encoded_key.to_string()),
            ("branch", branch),
            ("page", "1"),
            ("size", "5000"),
            ("selectPageType", "代码行"),
        ]),
        auth,
    )
    .send()
    .await
    .map_err(|e| ToolsError::Http(format!("Source lines request failed: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(ToolsError::Http(format!("Source lines API error {}: {}", status, body)));
    }

    let json: serde_json::Value = resp.json().await
        .map_err(|e| ToolsError::Http(format!("Failed to parse source lines: {}", e)))?;

    let list = json["data"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let lines: Vec<SonarSourceLine> = list
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();

    Ok(lines)
}

/// 合并连续行号为区间
pub fn merge_lines(lines: &[i32]) -> Vec<MergedRange> {
    if lines.is_empty() {
        return vec![];
    }

    let mut sorted: Vec<i32> = lines.to_vec();
    sorted.sort();
    sorted.dedup();

    let mut result = vec![];
    let mut start = sorted[0];
    let mut end = sorted[0];

    for &line in &sorted[1..] {
        if line == end + 1 {
            end = line;
        } else {
            result.push(MergedRange { start, end });
            start = line;
            end = line;
        }
    }
    result.push(MergedRange { start, end });

    result
}

/// 生成文件列表文本（固定格式）
pub fn format_file_list(files: &[(String, Vec<MergedRange>)]) -> String {
    let mut blocks = String::new();

    for (path, ranges) in files {
        let line_text: Vec<String> = ranges.iter().map(|r| r.to_display()).collect();
        blocks.push_str(&format!(
            "\n==================================================\n\n文件：\n{}\n\nSonar重点覆盖区域：\n{}\n\n",
            path,
            line_text.join("、")
        ));
    }

    blocks
}

/// 生成 Claude Code Prompt（模板中用 {file_list} 占位）
pub fn generate_prompt(files: &[(String, Vec<MergedRange>)], template: &str) -> String {
    let file_list = format_file_list(files);
    template.replace("{file_list}", &file_list)
}
