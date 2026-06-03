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
