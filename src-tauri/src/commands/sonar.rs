use serde::{Deserialize, Serialize};
use crate::services::walkin::WalkinAuth;
use crate::services::sonar::{self, MergedRange};
use crate::error::Result;

fn to_walkin_auth(auth: &SonarAuth) -> WalkinAuth {
    WalkinAuth {
        csrf_token: auth.csrf_token.clone(),
        project: auth.project.clone(),
        workspace: auth.workspace.clone(),
        x_auth_token: auth.x_auth_token.clone(),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SonarAuth {
    pub csrf_token: String,
    pub project: String,
    pub workspace: String,
    pub x_auth_token: String,
}

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
pub struct FileCoverage {
    pub path: String,
    pub ranges: Vec<MergedRange>,
}

#[tauri::command]
pub async fn sonar_get_reports(
    url: String,
    auth: SonarAuth,
    dept_id: String,
    create_time_end: String,
    project_key_not_like: String,
    branch: String,
    page: i32,
    limit: i32,
) -> Result<Vec<SonarReport>> {
    let walkin_auth = to_walkin_auth(&auth);
    let reports = sonar::get_report_list(
        &url, &walkin_auth, &dept_id, &create_time_end,
        &project_key_not_like, &branch, page, limit,
    ).await?;

    Ok(reports.into_iter().map(|r| SonarReport {
        id: r.id,
        create_time: r.create_time,
        commit_id: r.commit_id,
        report_type: r.report_type,
        project_key: r.project_key,
        branch: r.branch,
    }).collect())
}

#[tauri::command]
pub async fn sonar_get_files(
    url: String,
    auth: SonarAuth,
    project_key: String,
    branch: String,
    report_id: String,
) -> Result<Vec<SonarFile>> {
    let walkin_auth = to_walkin_auth(&auth);
    let files = sonar::get_file_list(&url, &walkin_auth, &project_key, &branch, &report_id).await?;
    Ok(files.into_iter().map(|f| SonarFile {
        key: f.key,
        path: f.path,
    }).collect())
}

#[tauri::command]
pub async fn sonar_get_file_coverage(
    url: String,
    auth: SonarAuth,
    project_key: String,
    branch: String,
    file_key: String,
    file_path: String,
    author: String,
) -> Result<FileCoverage> {
    let walkin_auth = to_walkin_auth(&auth);
    let source = sonar::get_source_lines(&url, &walkin_auth, &project_key, &file_key, &branch).await?;

    let target_lines: Vec<i32> = source
        .iter()
        .filter(|line| {
            line.duplicated == Some(false)
                && line.scm_author.as_deref() == Some(&author)
        })
        .map(|line| line.line)
        .collect();

    let ranges = sonar::merge_lines(&target_lines);

    Ok(FileCoverage {
        path: file_path,
        ranges,
    })
}

#[tauri::command]
pub async fn sonar_generate_prompt(
    files: Vec<FileCoverage>,
    template: String,
) -> Result<String> {
    let file_data: Vec<(String, Vec<MergedRange>)> = files
        .into_iter()
        .map(|f| (f.path, f.ranges))
        .collect();

    Ok(sonar::generate_prompt(&file_data, &template))
}
