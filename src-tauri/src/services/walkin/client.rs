use reqwest::Client;
use serde::{Deserialize, Serialize};
use crate::error::{Result, ToolsError};

/// Fetch a captcha image from Walkin and return its UUID and base64-encoded image.
pub async fn get_captcha(base_url: &str) -> Result<CaptchaData> {
    let uuid = uuid::Uuid::new_v4().to_string();
    let url = format!("{}/captcha", base_url.trim_end_matches('/'));

    let http_client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| ToolsError::Http(format!("Failed to create HTTP client: {}", e)))?;

    let response = http_client
        .get(&url)
        .query(&[("uuid", &uuid)])
        .send()
        .await
        .map_err(|e| ToolsError::Http(format!("Captcha request failed: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(ToolsError::Http(format!("Captcha API error {}: {}", status, body)));
    }

    let bytes = response.bytes().await
        .map_err(|e| ToolsError::Http(format!("Failed to read captcha image: {}", e)))?;

    Ok(CaptchaData {
        uuid,
        image_base64: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes),
    })
}

/// Perform LDAP login with captcha and return the auth tokens.
pub async fn ldap_signin(base_url: &str, username: &str, password: &str, captcha: &str, captcha_uuid: &str) -> Result<WalkinSigninResponse> {
    let url = format!("{}/ldap/signin", base_url.trim_end_matches('/'));

    let http_client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| ToolsError::Http(format!("Failed to create HTTP client: {}", e)))?;

    let response = http_client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/plain, */*")
        .header("PROJECT", "undefined")
        .header("WORKSPACE", "undefined")
        .json(&serde_json::json!({
            "username": username,
            "password": password,
            "authenticate": "LDAP",
            "captcha": captcha,
            "uuid": captcha_uuid,
        }))
        .send()
        .await
        .map_err(|e| ToolsError::Http(format!("Login request failed: {}", e)))?;

    let status = response.status();
    let body_text = response.text().await.unwrap_or_default();

    log::info!("Walkin LDAP login response [{}]: {}", status, body_text);

    if !status.is_success() {
        return Err(ToolsError::Http(format!("登录请求失败 (HTTP {}): {}", status, body_text)));
    }

    // Try to parse as JSON to extract message on failure
    let json_value: serde_json::Value = serde_json::from_str(&body_text)
        .map_err(|e| ToolsError::Http(format!("解析登录响应失败: {} - 原始响应: {}", e, body_text)))?;

    let success = json_value.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
    let message = json_value.get("message").and_then(|v| v.as_str()).map(|s| s.to_string());

    if !success {
        let msg = message.unwrap_or_else(|| {
            // Try to extract error from nested data
            json_value.get("msg").and_then(|v| v.as_str())
                .or_else(|| json_value.get("error").and_then(|v| v.as_str()))
                .unwrap_or("未知错误").to_string()
        });
        log::warn!("Walkin login failed: {}", msg);
        return Ok(WalkinSigninResponse {
            success: false,
            message: Some(msg),
            data: None,
        });
    }

    // Parse the full response
    let login_response: WalkinSigninResponse = serde_json::from_value(json_value)
        .map_err(|e| ToolsError::Http(format!("解析登录数据失败: {}", e)))?;

    Ok(login_response)
}

/// Result of an auto-login attempt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoLoginResult {
    pub success: bool,
    pub csrf_token: Option<String>,
    pub project: Option<String>,
    pub workspace: Option<String>,
    pub x_auth_token: Option<String>,
    /// If auto-login failed and needs manual captcha input
    pub needs_manual_captcha: bool,
    /// The captcha image (base64) to show to user for manual input
    pub captcha_image: Option<String>,
    /// Captcha UUID for manual submission
    pub captcha_uuid: Option<String>,
    pub message: Option<String>,
}

/// Attempt automatic login with captcha recognition. Tries up to 3 times.
/// Returns AutoLoginResult. If `needs_manual_captcha` is true, the caller
/// should show the captcha to the user and retry with manual input.
pub async fn auto_login(
    base_url: &str,
    username: &str,
    password: &str,
) -> AutoLoginResult {
    use super::captcha::recognize_captcha;

    let max_attempts = 3u32;

    for attempt in 0..max_attempts {
        // Fetch captcha
        let captcha_data = match get_captcha(base_url).await {
            Ok(d) => d,
            Err(e) => {
                return AutoLoginResult {
                    success: false,
                    csrf_token: None,
                    project: None,
                    workspace: None,
                    x_auth_token: None,
                    needs_manual_captcha: false,
                    captcha_image: None,
                    captcha_uuid: None,
                    message: Some(format!("获取验证码失败: {}", e)),
                };
            }
        };

        // Try to recognize captcha with heuristic OCR
        let captcha_image_bytes = match base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            &captcha_data.image_base64,
        ) {
            Ok(b) => b,
            Err(_) => continue,
        };

        let recognized = match recognize_captcha(&captcha_image_bytes) {
            Some(text) if text.len() >= 3 => {
                log::info!("Heuristic captcha recognized (attempt {}): {}", attempt + 1, text);
                text
            }
            _ => {
                log::debug!("Could not recognize captcha on attempt {}", attempt + 1);
                if attempt == max_attempts - 1 {
                    return AutoLoginResult {
                        success: false,
                        csrf_token: None,
                        project: None,
                        workspace: None,
                        x_auth_token: None,
                        needs_manual_captcha: true,
                        captcha_image: Some(captcha_data.image_base64),
                        captcha_uuid: Some(captcha_data.uuid),
                        message: Some("验证码自动识别失败，请手动输入".to_string()),
                    };
                }
                continue;
            }
        };

        // Attempt login with recognized captcha
        match ldap_signin(base_url, username, password, &recognized, &captcha_data.uuid).await {
            Ok(resp) if resp.success => {
                return AutoLoginResult {
                    success: true,
                    csrf_token: resp.csrf_token(),
                    project: resp.last_project_id(),
                    workspace: resp.last_workspace_id(),
                    x_auth_token: resp.session_id(),
                    needs_manual_captcha: false,
                    captcha_image: None,
                    captcha_uuid: None,
                    message: Some("自动登录成功".to_string()),
                };
            }
            Ok(resp) => {
                // Login failed — probably wrong captcha
                log::debug!("Login failed with recognized captcha: {:?}", resp.message);
                if attempt == max_attempts - 1 {
                    // Last attempt — return the latest captcha for manual input
                    return AutoLoginResult {
                        success: false,
                        csrf_token: None,
                        project: None,
                        workspace: None,
                        x_auth_token: None,
                        needs_manual_captcha: true,
                        captcha_image: Some(captcha_data.image_base64),
                        captcha_uuid: Some(captcha_data.uuid),
                        message: resp.message,
                    };
                }
                // Try again with new captcha
                continue;
            }
            Err(e) => {
                log::debug!("Login error: {}", e);
                if attempt == max_attempts - 1 {
                    return AutoLoginResult {
                        success: false,
                        csrf_token: None,
                        project: None,
                        workspace: None,
                        x_auth_token: None,
                        needs_manual_captcha: true,
                        captcha_image: Some(captcha_data.image_base64),
                        captcha_uuid: Some(captcha_data.uuid),
                        message: Some(format!("登录失败: {}", e)),
                    };
                }
                continue;
            }
        }
    }

    AutoLoginResult {
        success: false,
        csrf_token: None,
        project: None,
        workspace: None,
        x_auth_token: None,
        needs_manual_captcha: false,
        captcha_image: None,
        captcha_uuid: None,
        message: Some("超过最大重试次数".to_string()),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptchaData {
    pub uuid: String,
    pub image_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalkinSigninResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<WalkinSigninData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalkinSigninData {
    pub csrfToken: Option<String>,
    pub sessionId: Option<String>,
    #[serde(rename = "lastWorkspaceId")]
    pub last_workspace_id: Option<String>,
    #[serde(rename = "lastProjectId")]
    pub last_project_id: Option<String>,
    pub id: Option<String>,
    pub name: Option<String>,
}

impl WalkinSigninResponse {
    /// Extract auth tokens from login response data
    pub fn csrf_token(&self) -> Option<String> {
        self.data.as_ref()?.csrfToken.clone()
    }
    pub fn session_id(&self) -> Option<String> {
        self.data.as_ref()?.sessionId.clone()
    }
    pub fn last_workspace_id(&self) -> Option<String> {
        self.data.as_ref()?.last_workspace_id.clone()
    }
    pub fn last_project_id(&self) -> Option<String> {
        self.data.as_ref()?.last_project_id.clone()
    }
}

#[derive(Debug, Clone)]
pub struct WalkinAuth {
    pub csrf_token: String,
    pub project: String,
    pub workspace: String,
    pub x_auth_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalkinApiResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<WalkinApiData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalkinApiData {
    pub listObject: Vec<WalkinProjectData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalkinProjectData {
    #[serde(rename = "projectName")]
    pub project_name: String,
    pub branch: Option<String>,
    pub bugs: i64,
    pub vulnerabilities: i64,
    #[serde(rename = "codeSmells")]
    pub code_smells: i64,
    // 全量覆盖率
    pub coverage: Option<String>,
    #[serde(rename = "lineCoverage")]
    pub line_coverage: Option<String>,
    #[serde(rename = "branchCoverage")]
    pub branch_coverage: Option<String>,
    #[serde(rename = "linesToCover")]
    pub lines_to_cover: Option<i64>,
    #[serde(rename = "conditionsToCover")]
    pub conditions_to_cover: Option<i64>,
    #[serde(rename = "uncoveredConditions")]
    pub uncovered_conditions: Option<i64>,
    // 增量覆盖率
    #[serde(rename = "newCoverage")]
    pub new_coverage: Option<String>,
    #[serde(rename = "newLineCoverage")]
    pub new_line_coverage: Option<String>,
    #[serde(rename = "newConditionCoverage")]
    pub new_condition_coverage: Option<String>,
    #[serde(rename = "newLinesToCover")]
    pub new_lines_to_cover: Option<i64>,
    #[serde(rename = "newLineCover")]
    pub new_line_cover: Option<i64>,
    #[serde(rename = "newUnLineCover")]
    pub new_un_line_cover: Option<i64>,
    #[serde(rename = "newConditionToCover")]
    pub new_condition_to_cover: Option<i64>,
    #[serde(rename = "newUnConditionToCover")]
    pub new_un_condition_to_cover: Option<i64>,
    // 其他
    #[serde(rename = "duplicatedLinesDensity")]
    pub duplicated_lines_density: Option<String>,
    #[serde(rename = "duplicatedBlocks")]
    pub duplicated_blocks: i64,
    #[serde(rename = "reliabilityRating")]
    pub reliability_rating: Option<String>,
    #[serde(rename = "securityRating")]
    pub security_rating: Option<String>,
    #[serde(rename = "maintainabilityRating")]
    pub maintainability_rating: Option<String>,
    #[serde(rename = "newBugs")]
    pub new_bugs: i64,
    #[serde(rename = "newVulnerabilities")]
    pub new_vulnerabilities: i64,
    #[serde(rename = "newCodeSmells")]
    pub new_code_smells: i64,
    #[serde(rename = "analysisDate")]
    pub analysis_date: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WalkinMetrics {
    pub branch: Option<String>,
    pub bugs: i64,
    pub vulnerabilities: i64,
    pub code_smells: i64,
    // 全量覆盖率
    pub coverage: Option<f64>,
    pub line_coverage: Option<f64>,
    pub branch_coverage: Option<f64>,
    pub lines_to_cover: Option<i64>,
    pub conditions_to_cover: Option<i64>,
    pub uncovered_conditions: Option<i64>,
    // 增量覆盖率
    pub new_coverage: Option<f64>,
    pub new_line_coverage: Option<f64>,
    pub new_condition_coverage: Option<f64>,
    pub new_lines_to_cover: Option<i64>,
    pub new_line_cover: Option<i64>,
    pub new_un_line_cover: Option<i64>,
    pub new_condition_to_cover: Option<i64>,
    pub new_un_condition_to_cover: Option<i64>,
    // 其他
    pub duplicated_lines_density: Option<f64>,
    pub duplicated_blocks: i64,
    pub reliability_rating: Option<String>,
    pub security_rating: Option<String>,
    pub maintainability_rating: Option<String>,
    pub new_bugs: i64,
    pub new_vulnerabilities: i64,
    pub new_code_smells: i64,
    pub analysis_date: Option<i64>,
}

impl From<WalkinProjectData> for WalkinMetrics {
    fn from(data: WalkinProjectData) -> Self {
        Self {
            branch: data.branch,
            bugs: data.bugs,
            vulnerabilities: data.vulnerabilities,
            code_smells: data.code_smells,
            // 全量覆盖率
            coverage: data.coverage.and_then(|s| s.parse::<f64>().ok()),
            line_coverage: data.line_coverage.and_then(|s| s.parse::<f64>().ok()),
            branch_coverage: data.branch_coverage.and_then(|s| s.parse::<f64>().ok()),
            lines_to_cover: data.lines_to_cover,
            conditions_to_cover: data.conditions_to_cover,
            uncovered_conditions: data.uncovered_conditions,
            // 增量覆盖率
            new_coverage: data.new_coverage.and_then(|s| s.parse::<f64>().ok()),
            new_line_coverage: data.new_line_coverage.and_then(|s| s.parse::<f64>().ok()),
            new_condition_coverage: data.new_condition_coverage.and_then(|s| s.parse::<f64>().ok()),
            new_lines_to_cover: data.new_lines_to_cover,
            new_line_cover: data.new_line_cover,
            new_un_line_cover: data.new_un_line_cover,
            new_condition_to_cover: data.new_condition_to_cover,
            new_un_condition_to_cover: data.new_un_condition_to_cover,
            // 其他
            duplicated_lines_density: data.duplicated_lines_density.and_then(|s| s.parse::<f64>().ok()),
            duplicated_blocks: data.duplicated_blocks,
            reliability_rating: data.reliability_rating,
            security_rating: data.security_rating,
            maintainability_rating: data.maintainability_rating,
            new_bugs: data.new_bugs,
            new_vulnerabilities: data.new_vulnerabilities,
            new_code_smells: data.new_code_smells,
            analysis_date: data.analysis_date,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMapping {
    pub gitlab_project: String,
    pub walkin_project: String,
}

/// unit-board API 响应数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnitBoardData {
    /// 增量覆盖率【综合】
    pub ynewValue: Option<f64>,
    /// 全量覆盖率【综合】
    pub yallValue: Option<f64>,
    /// 增量覆盖率【代码行】
    pub ynewLineValue: Option<f64>,
    /// 全量覆盖率【代码行】
    pub yallLineValue: Option<f64>,
    /// 增量覆盖率【分支】
    pub ynewBranchValue: Option<f64>,
    /// 全量覆盖率【分支】
    pub yallBranchValue: Option<f64>,
    /// 周期标识，如 "W22"
    pub xvalue: Option<String>,
    /// 开始日期
    pub startDateFrom: Option<String>,
    /// 结束日期
    pub startDateTo: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnitBoardResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<Vec<UnitBoardData>>,
}

/// is-login API 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IsLoginResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<IsLoginData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IsLoginData {
    pub id: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
}

/// 登录状态检查结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginStatusResult {
    pub logged_in: bool,
    pub user_name: Option<String>,
    pub message: Option<String>,
}

/// 独立的登录状态检查函数（委托给 WalkinClient）
pub async fn check_walkin_login(base_url: &str, auth: &WalkinAuth) -> Result<LoginStatusResult> {
    let client = WalkinClient::new(base_url, auth.clone(), String::new(), String::new())?;
    client.check_login().await
}

pub struct WalkinClient {
    base_url: String,
    auth: WalkinAuth,
    http_client: Client,
    dept_name: String,
    workspace_name: String,
}

impl WalkinClient {
    pub fn new(base_url: &str, auth: WalkinAuth, dept_name: String, workspace_name: String) -> Result<Self> {
        let http_client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .connect_timeout(std::time::Duration::from_secs(10))
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| ToolsError::Http(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            auth,
            http_client,
            dept_name,
            workspace_name,
        })
    }

    pub async fn fetch_project_metrics(&self) -> Result<Vec<WalkinProjectData>> {
        let url = format!(
            "{}/track/synSonarInfoData/selectUnitList",
            self.base_url
        );

        // Calculate date range (last 7 days)
        let now = chrono::Utc::now();
        let start = now - chrono::Duration::days(7);
        let start_date = start.format("%Y-%m-%d 00:00:00").to_string();
        let end_date = now.format("%Y-%m-%d 23:59:59").to_string();

        log::info!("Fetching Walkin project metrics from {} to {}", start_date, end_date);

        let mut all_projects = Vec::new();
        let mut page = 0u32;
        let page_size_val = 500u32;
        let page_size = page_size_val.to_string();

        loop {
            let page_str = page.to_string();
            let response = self.http_client
                .get(&url)
                .query(&[
                    ("pageNum", page_str.as_str()),
                    ("pageSize", &page_size),
                    ("workspaceName", &self.workspace_name),
                    ("createdAtStart", &start_date),
                    ("createdAtEnd", &end_date),
                    ("deptName", &self.dept_name),
                    ("queryNewFlag", "1"),
                ])
                .header("CSRF-TOKEN", &self.auth.csrf_token)
                .header("PROJECT", &self.auth.project)
                .header("WORKSPACE", &self.auth.workspace)
                .header("X-AUTH-TOKEN", &self.auth.x_auth_token)
                .header("Accept", "application/json, text/plain, */*")
                .send()
                .await
                .map_err(|e| ToolsError::Http(format!("Walkin API request failed: {}", e)))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(ToolsError::Http(format!("Walkin API error {}: {}", status, body)));
            }

            let api_response: WalkinApiResponse = response.json().await
                .map_err(|e| ToolsError::Http(format!("Failed to parse Walkin response: {}", e)))?;

            if !api_response.success {
                return Err(ToolsError::Http(format!("Walkin API returned error: {}", api_response.message.unwrap_or_default())));
            }

            let data = match api_response.data {
                Some(d) => d,
                None => break,
            };

            let count = data.listObject.len();
            log::info!("Walkin API returned {} projects on page {}", count, page);
            all_projects.extend(data.listObject);

            // Stop if we got fewer than pageSize items (last page)
            if (count as u32) < page_size_val {
                break;
            }
            page += 1;

            // Safety: max 10 pages
            if page >= 10 {
                break;
            }
        }

        log::info!("Total Walkin projects fetched: {}", all_projects.len());
        if !all_projects.is_empty() {
            log::debug!("First few Walkin project names: {:?}", all_projects.iter().take(5).map(|p| &p.project_name).collect::<Vec<_>>());
        }

        Ok(all_projects)
    }

    pub async fn test_connection(&self) -> Result<bool> {
        match self.fetch_project_metrics().await {
            Ok(data) => Ok(!data.is_empty()),
            Err(e) => {
                log::error!("Walkin connection test failed: {}", e);
                Err(e)
            }
        }
    }

    /// 检查登录状态
    pub async fn check_login(&self) -> Result<LoginStatusResult> {
        let url = format!("{}/is-login", self.base_url);

        let response = self.http_client
            .get(&url)
            .header("CSRF-TOKEN", &self.auth.csrf_token)
            .header("PROJECT", &self.auth.project)
            .header("WORKSPACE", &self.auth.workspace)
            .header("X-AUTH-TOKEN", &self.auth.x_auth_token)
            .header("Accept", "application/json, text/plain, */*")
            .send()
            .await
            .map_err(|e| ToolsError::Http(format!("Login check request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            return Ok(LoginStatusResult {
                logged_in: false,
                user_name: None,
                message: Some(format!("HTTP error: {}", status)),
            });
        }

        let api_response: IsLoginResponse = response.json().await
            .map_err(|e| ToolsError::Http(format!("Failed to parse login check response: {}", e)))?;

        Ok(LoginStatusResult {
            logged_in: api_response.success && api_response.data.is_some(),
            user_name: api_response.data.and_then(|d| d.name),
            message: if api_response.success { None } else { api_response.message },
        })
    }

    /// 获取 unit-board 团队级覆盖率概览
    pub async fn fetch_unit_board(&self, dept_id: &str) -> Result<Option<UnitBoardData>> {
        let url = format!(
            "{}/track/synSonarInfoData/unit-board",
            self.base_url
        );

        // 计算日期范围（从年初到现在）
        let now = chrono::Utc::now();
        let start_date = format!("{}-01-01 08:00:00", now.format("%Y"));
        let end_date = now.format("%Y-%m-%d %H:%M:%S").to_string();

        log::info!("Fetching unit-board: workspace={}, deptName={}, deptId={}, start={}, end={}",
            self.workspace_name, self.dept_name, dept_id, start_date, end_date);

        let app_group_flag = "按周期".to_string();
        let response = self.http_client
            .get(&url)
            .query(&[
                ("deptId", &dept_id.to_string()),
                ("workspaceName", &self.workspace_name),
                ("deptName", &self.dept_name),
                ("startDateFrom", &start_date),
                ("startDateTo", &end_date),
                ("appGroupFlag", &app_group_flag),
            ])
            .header("CSRF-TOKEN", &self.auth.csrf_token)
            .header("PROJECT", &self.auth.project)
            .header("WORKSPACE", &self.auth.workspace)
            .header("X-AUTH-TOKEN", &self.auth.x_auth_token)
            .header("Accept", "application/json, text/plain, */*")
            .send()
            .await
            .map_err(|e| ToolsError::Http(format!("Walkin unit-board request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(ToolsError::Http(format!("Walkin unit-board error {}: {}", status, body)));
        }

        let body_text = response.text().await
            .map_err(|e| ToolsError::Http(format!("Failed to read unit-board response: {}", e)))?;

        log::info!("Unit-board raw response: {}", body_text);

        let api_response: UnitBoardResponse = serde_json::from_str(&body_text)
            .map_err(|e| ToolsError::Http(format!("Failed to parse unit-board response: {} - body: {}", e, body_text)))?;

        if !api_response.success {
            return Err(ToolsError::Http(format!("Walkin unit-board error: {}", api_response.message.unwrap_or_default())));
        }

        // 返回增量覆盖率（综合覆盖率 ynewValue）最大的那条记录
        Ok(api_response.data.and_then(|mut d| {
            d.sort_by(|a, b| {
                let a_val = a.ynewValue.unwrap_or(0.0);
                let b_val = b.ynewValue.unwrap_or(0.0);
                b_val.partial_cmp(&a_val).unwrap_or(std::cmp::Ordering::Equal)
            });
            d.into_iter().next()
        }))
    }
}