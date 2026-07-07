//! DTS (Data Transfer Service) 任务管理 - Rust 完整实现
//!
//! 所有上游 HTTP 调用、配置管理、Token 加密、流式响应都在这里。
//! 不依赖任何外部 Python 进程。

use std::path::PathBuf;
use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

// ==================== 配置存储 ====================

const CONFIG_FILE: &str = "dts_configs.json";

fn data_dir() -> PathBuf {
    dirs::home_dir()
        .map(|h| h.join(".tools"))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn config_path() -> PathBuf {
    data_dir().join(CONFIG_FILE)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DtsConfig {
    pub config_name: String,
    pub base_url: String,
    pub auth_token: String,
    #[serde(default)]
    pub login_user: String,
    #[serde(default)]
    pub login_pass: String,
    #[serde(default)]
    pub task_name: String,
    #[serde(default)]
    pub env_code: String,
    #[serde(default = "default_page_size")]
    pub page_size: u32,
}

fn default_page_size() -> u32 { 20 }

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DtsConfigs {
    pub configs: Vec<DtsConfig>,
    pub current_config: String,
}

fn read_json_or_default<T: Default + for<'de> Deserialize<'de>>(path: &PathBuf) -> T {
    if let Ok(s) = std::fs::read_to_string(path) {
        serde_json::from_str(&s).unwrap_or_default()
    } else {
        T::default()
    }
}

fn write_json<T: Serialize>(path: &PathBuf, data: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let s = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(path, s).map_err(|e| e.to_string())
}

fn mask_token(token: &str) -> String {
    if token.is_empty() {
        return String::new();
    }
    if token.len() > 12 {
        format!("{}***{}", &token[..4], &token[token.len() - 4..])
    } else {
        "***".to_string()
    }
}

// ==================== 上游 HTTP 客户端 ====================

pub struct TaskManager {
    client: Client,
    base_url: String,
    auth_token: String,
}

impl TaskManager {
    fn new(base_url: &str, auth_token: &str) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_default();
        Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
            auth_token: auth_token.to_string(),
        }
    }

    async fn get(&self, path: &str, params: &[(&str, String)]) -> Result<Value, String> {
        let url = format!("{}{}", self.base_url, path);
        log::info!("[DTS] → GET {} {:?}", url, params);
        let t0 = std::time::Instant::now();
        let resp = self.client.get(&url)
            .bearer_auth(&self.auth_token)
            .query(params)
            .send().await
            .map_err(|e| {
                log::error!("[DTS] ✗ GET {} 失败: {}", url, e);
                format!("请求失败: {}", e)
            })?;
        let status = resp.status();
        let body_text = resp.text().await.map_err(|e| {
            log::error!("[DTS] ✗ GET {} 读 body 失败: {}", url, e);
            format!("解析失败: {}", e)
        })?;
        log::info!("[DTS] ← {} status={} ({}ms, {} bytes): {}",
            url, status, t0.elapsed().as_millis(), body_text.len(),
            if body_text.len() > 500 { &body_text[..500] } else { &body_text });

        if !status.is_success() {
            log::error!("[DTS] ✗ HTTP {} body: {}", status, body_text);
            return Err(format!("HTTP {}: {}", status, body_text));
        }
        serde_json::from_str(&body_text).map_err(|e| {
            log::error!("[DTS] ✗ JSON 解析失败: {} body: {}", e, body_text);
            format!("解析失败: {}", e)
        })
    }

    async fn post(&self, path: &str, body: &Value) -> Result<Value, String> {
        let url = format!("{}{}", self.base_url, path);
        log::info!("[DTS] → POST {} body: {}", url, body);
        let t0 = std::time::Instant::now();
        let resp = self.client.post(&url)
            .bearer_auth(&self.auth_token)
            .json(body)
            .send().await
            .map_err(|e| {
                log::error!("[DTS] ✗ POST {} 失败: {}", url, e);
                format!("请求失败: {}", e)
            })?;
        let status = resp.status();
        let body_text = resp.text().await.map_err(|e| {
            log::error!("[DTS] ✗ POST {} 读 body 失败: {}", url, e);
            format!("解析失败: {}", e)
        })?;
        log::info!("[DTS] ← POST {} status={} ({}ms, {} bytes): {}",
            url, status, t0.elapsed().as_millis(), body_text.len(),
            if body_text.len() > 500 { &body_text[..500] } else { &body_text });

        if !status.is_success() {
            log::error!("[DTS] ✗ HTTP {} body: {}", status, body_text);
            return Err(format!("HTTP {}: {}", status, body_text));
        }
        serde_json::from_str(&body_text).map_err(|e| {
            log::error!("[DTS] ✗ JSON 解析失败: {} body: {}", e, body_text);
            format!("解析失败: {}", e)
        })
    }

    fn is_success(&self, result: &Value) -> bool {
        // 上游约定：{success: true} 或 {code: 1, success: true}
        if let Some(s) = result.get("success").and_then(|v| v.as_bool()) {
            return s;
        }
        if let Some(c) = result.get("code").and_then(|v| v.as_i64()) {
            return c == 1;
        }
        false
    }

    // ===== 任务 =====
    async fn query_tasks(
        &self,
        page: u32,
        page_size: u32,
        name: &str,
        env_code: &str,
        status: &str,
    ) -> Result<Value, String> {
        let mut params: Vec<(&str, String)> = vec![
            ("currentPage", page.to_string()),
            ("pageSize", page_size.to_string()),
            ("page", page.to_string()),
            ("size", page_size.to_string()),
        ];
        if !name.is_empty() { params.push(("name", name.to_string())); }
        if !env_code.is_empty() { params.push(("envCode", env_code.to_string())); }
        if !status.is_empty() { params.push(("status", status.to_string())); }
        self.get("/task/page", &params).await
    }

    async fn start_task(&self, task_id: &str) -> Result<(bool, Value), String> {
        let body = json!({
            "taskId": task_id,
            "taskType": "RUNTIME",
            "opType": "START",
            "status": "APPLYING"
        });
        let r = self.post("/task-order/save", &body).await?;
        Ok((true, r))
    }

    async fn stop_task(&self, task_id: &str) -> Result<(bool, Value), String> {
        let body = json!({
            "taskId": task_id,
            "taskType": "RUNTIME",
            "opType": "STOP",
            "status": "APPLYING"
        });
        let r = self.post("/task-order/save", &body).await?;
        Ok((true, r))
    }

    async fn delete_task(&self, task_id: &str) -> Result<(bool, Value), String> {
        let body = json!({
            "taskId": task_id,
            "taskType": "RUNTIME",
            "opType": "DELETE",
            "status": "APPLYING"
        });
        let r = self.post("/task-order/save", &body).await?;
        Ok((true, r))
    }

    async fn rename_task(&self, task_id: &str, new_name: &str) -> Result<(bool, Value), String> {
        let body = json!({ "taskId": task_id, "newName": new_name });
        let r = self.post("/task/changeTaskName", &body).await?;
        Ok((true, r))
    }

    async fn ensure_biz(&self, task_id: &str) -> Result<(bool, Value), String> {
        let body = json!({
            "sourceBiz": "1",
            "targetBiz": "1",
            "riskLevel": 1,
            "taskId": task_id,
        });
        let r = self.post("/taskBiz/save", &body).await?;
        Ok((true, r))
    }

    async fn safe_start(&self, task_id: &str, task_name: &str) -> Value {
        // 1. 启动
        let (ok1, r1) = match self.start_task(task_id).await {
            Ok(t) => t,
            Err(e) => return json!({ "success": false, "message": e, "stage": "start" }),
        };
        let success = self.is_success(&r1);
        if success {
            return json!({ "success": true, "message": "启动成功", "task_name": task_name, "data": r1 });
        }
        // 2. 兜底：补业务信息后重试
        let msg = r1.get("msg").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if msg.contains("没有配置业务信息") || msg.contains("biz") || msg.contains("业务") {
            let (_, _) = self.ensure_biz(task_id).await.unwrap_or((false, json!({})));
            let (_ok2, r2) = match self.start_task(task_id).await {
                Ok(t) => t,
                Err(e) => return json!({ "success": false, "message": e, "stage": "retry" }),
            };
            if self.is_success(&r2) {
                return json!({ "success": true, "message": "补业务信息后启动成功", "task_name": task_name, "data": r2 });
            }
            return json!({ "success": false, "message": format!("补业务信息后仍失败: {}", msg), "task_name": task_name, "data": r2 });
        }
        let _ = ok1;
        json!({ "success": false, "message": msg, "task_name": task_name, "data": r1 })
    }

    async fn simple_op(&self, op: &str, task_id: &str) -> Value {
        let result = match op {
            "stop" => self.stop_task(task_id).await,
            "delete" => self.delete_task(task_id).await,
            _ => return json!({ "success": false, "message": format!("不支持的操作: {}", op) }),
        };
        match result {
            Ok((_, r)) => {
                if self.is_success(&r) {
                    json!({ "success": true, "message": format!("{} 成功", op), "data": r })
                } else {
                    let msg = r.get("msg").and_then(|v| v.as_str()).unwrap_or("失败").to_string();
                    json!({ "success": false, "message": msg, "data": r })
                }
            }
            Err(e) => json!({ "success": false, "message": e }),
        }
    }

    async fn test_connection(&self) -> (bool, String) {
        let params: Vec<(&str, String)> = vec![
            ("currentPage", "1".to_string()),
            ("pageSize", "1".to_string()),
        ];
        match self.get("/task/page", &params).await {
            Ok(_) => (true, "连接成功".to_string()),
            Err(e) => (false, e),
        }
    }

    async fn get_environments(&self, status: &str) -> Result<Value, String> {
        let params: Vec<(&str, String)> = vec![
            ("status", status.to_string()),
            ("currentPage", "1".to_string()),
            ("pageSize", "100".to_string()),
        ];
        let r = self.get("/env/page", &params).await?;
        Ok(r)
    }

    async fn fetch_token(
        &self,
        username: &str,
        password: &str,
        login_type: &str,
    ) -> Result<Value, String> {
        // 上游约定的密码格式：直接 base64（不 URL encode）
        let encoded = base64_encode(password.as_bytes());

        // 上游 /auth/login 接受的字段名是 u / p
        let body = json!({
            "u": username,
            "p": encoded,
            "code": "",
            "type": login_type,
        });

        let url = format!("{}/auth/login", self.base_url);
        log::info!("[DTS] → POST {} user={} type={} (body u/p/code/type)", url, username, login_type);
        let t0 = std::time::Instant::now();
        let resp = self.client.post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send().await
            .map_err(|e| {
                log::error!("[DTS] ✗ POST {} 失败: {}", url, e);
                format!("请求失败: {}", e)
            })?;

        let status = resp.status();
        let body_text = resp.text().await.map_err(|e| {
            log::error!("[DTS] ✗ POST {} 读 body 失败: {}", url, e);
            format!("解析失败: {}", e)
        })?;
        log::info!("[DTS] ← POST {} status={} ({}ms, {} bytes): {}",
            url, status, t0.elapsed().as_millis(), body_text.len(),
            if body_text.len() > 500 { &body_text[..500] } else { &body_text });

        if !status.is_success() {
            log::error!("[DTS] ✗ login HTTP {} body: {}", status, body_text);
            return Err(format!("HTTP {}: {}", status, body_text));
        }

        let body: Value = serde_json::from_str(&body_text).map_err(|e| {
            log::error!("[DTS] ✗ login JSON 解析失败: {}", e);
            format!("解析失败: {}", e)
        })?;

        // 提取 token（上游返回 data.token）
        let token = body.get("data").and_then(|d| d.get("token"))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string());

        match token {
            Some(t) => {
                log::info!("[DTS] ✓ login 成功，token 长 {} 字符", t.len());
                Ok(json!({ "success": true, "token": t }))
            }
            None => {
                log::error!("[DTS] ✗ login 响应中找不到 token: {}", body);
                Err(format!("响应中找不到 token: {}", body))
            }
        }
    }

    async fn reset_offset(
        &self,
        task_id: &str,
        binlog_file_name: &str,
        binlog_file_position: &str,
    ) -> Result<(bool, Value), String> {
        // content 字段是 JSON 字符串形式
        let content = json!({
            "binlogFileName": binlog_file_name,
            "binlogFilePosition": binlog_file_position,
        }).to_string();
        let body = json!({
            "content": content,
            "opType": "RESET_OFFSET",
            "taskType": "RUNTIME",
            "taskId": task_id,
            "status": "APPLYING",
        });
        let r = self.post("/task-order/save", &body).await?;
        Ok((true, r))
    }

    // ===== Task Flush =====
    async fn query_flush(
        &self,
        page: u32,
        page_size: u32,
        task_name: &str,
        env_code: &str,
        status: &str,
    ) -> Result<Value, String> {
        let mut params: Vec<(&str, String)> = vec![
            ("page", page.to_string()),
            ("size", page_size.to_string()),
        ];
        if !task_name.is_empty() { params.push(("name", task_name.to_string())); }
        if !env_code.is_empty() { params.push(("envCode", env_code.to_string())); }
        if !status.is_empty() { params.push(("status", status.to_string())); }
        self.get("/task-flush/page", &params).await
    }

    async fn create_flush_for_task(&self, task: &Value, flush_name_override: Option<&str>) -> Result<(bool, Value), String> {
        // 解析源表 - 兼容两种格式：
        // 1) 字符串数组: ["yl_lmdm.sys_payment_manner", ...] (Python 版本约定)
        // 2) 对象数组: [{dbName, tableNames}, ...]
        let source_db_tables = task.get("sourceDatabaseAndTableList")
            .cloned()
            .unwrap_or_else(|| json!([]));

        // 优先尝试取第一个字符串（标准格式）
        let mut db_name = String::new();
        let mut table_names = String::new();

        if let Some(arr) = source_db_tables.as_array() {
            if let Some(first) = arr.first() {
                if let Some(s) = first.as_str() {
                    // 字符串格式: "yl_lmdm.sys_payment_manner" → 拆出 db 和 table
                    // 找最后一个 "." 分割
                    if let Some(dot_pos) = s.rfind('.') {
                        db_name = s[..dot_pos].to_string();
                        table_names = s[dot_pos + 1..].to_string();
                    } else {
                        // 没有 . 说明可能整字符串就是表名（不带 db）
                        table_names = s.to_string();
                    }
                } else if let Some(obj) = first.as_object() {
                    // 对象格式
                    db_name = obj.get("dbName").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    table_names = obj.get("tableNames").and_then(|v| v.as_array())
                        .map(|a| a.iter().filter_map(|t| t.as_str()).collect::<Vec<_>>().join(","))
                        .unwrap_or_default();
                }
            }
        }

        let task_id = task.get("id").and_then(|v| v.as_str())
            .or_else(|| task.get("id").and_then(|v| v.as_i64()).map(|_| ""))
            .unwrap_or("");
        // id 可能是字符串或数字
        let task_id = if task_id.is_empty() {
            task.get("id").and_then(|v| v.as_i64())
                .map(|n| n.to_string())
                .unwrap_or_default()
        } else {
            task_id.to_string()
        };
        let task_name = task.get("name").and_then(|v| v.as_str()).unwrap_or("");

        // 构造完整的 SQL
        let sql = if !db_name.is_empty() && !table_names.is_empty() {
            format!("select * from {}.{} where 1=1", db_name, table_names)
        } else if !table_names.is_empty() {
            format!("select * from {} where 1=1", table_names)
        } else {
            return Err("任务无源表信息，无法创建回刷".into());
        };

        // 回刷名称：优先使用传入的自定义名称，否则默认加【回刷】前缀
        let flush_name = match flush_name_override {
            Some(name) if !name.is_empty() => name.to_string(),
            _ => format!("【回刷】{}", task_name),
        };

        let payload = json!({
            "taskId": task_id,
            "dispatchType": "AUTO",
            "sql": sql,
            "taskName": task_name,
            "name": flush_name,
            "sourceParallelism": task.get("sourceParallelism").cloned().unwrap_or(json!(1)),
            "nodeInfo": task.get("nodeInfo").cloned().unwrap_or(json!(null)),
        });

        log::info!("[DTS] create_flush payload: {}", payload);
        let r = self.post("/task-flush/save", &payload).await?;
        Ok((true, r))
    }

    async fn start_flush(&self, flush_id: &str) -> Result<(bool, Value), String> {
        // 回刷任务启动需要特殊格式
        let body = json!({
            "taskId": flush_id,
            "taskType": "FLUSH",
            "opType": "START",
            "status": "APPLYING"
        });
        let r = self.post("/task-order/save", &body).await?;
        Ok((true, r))
    }

    async fn delete_flush(&self, flush_id: &str) -> Result<(bool, Value), String> {
        // 回刷任务删除需要特殊格式
        let body = json!({
            "taskId": flush_id,
            "taskType": "FLUSH",
            "opType": "DELETE",
            "status": "APPLYING"
        });
        let r = self.post("/task-order/save", &body).await?;
        Ok((true, r))
    }
}

// ==================== 辅助函数 ====================

fn base64_encode(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn load_active_config() -> DtsConfig {
    let stored: DtsConfigs = read_json_or_default(&config_path());
    if let Some(c) = stored.configs.iter().find(|c| c.config_name == stored.current_config) {
        return c.clone();
    }
    DtsConfig::default()
}

fn load_all_configs() -> Vec<DtsConfig> {
    ensure_default_configs();
    let stored: DtsConfigs = read_json_or_default(&config_path());
    stored.configs
}

fn load_current_config_name() -> String {
    let stored: DtsConfigs = read_json_or_default(&config_path());
    stored.current_config
}

fn save_current_config_name(name: &str) {
    let mut stored: DtsConfigs = read_json_or_default(&config_path());
    stored.current_config = name.to_string();
    let _ = write_json(&config_path(), &stored);
}

/// 内置默认配置（不含敏感字段）
/// 用户首次启动时会自动注入，用户在 UI 里点 "自动获取" 补 Token
/// 只有配置名称和 BASE_URL，其他字段默认为空
fn builtin_default_configs() -> Vec<DtsConfig> {
    vec![
        DtsConfig {
            config_name: "中国FAT环境".to_string(),
            base_url: "https://jms-dts-api.jnt-express.com.cn".to_string(),
            auth_token: String::new(),
            login_user: String::new(),
            login_pass: String::new(),
            task_name: String::new(),
            env_code: String::new(),
            page_size: 20,
        },
        DtsConfig {
            config_name: "中国UAT环境".to_string(),
            base_url: "https://demo-btf-dts-api-inner.yunlu-tech.cn".to_string(),
            auth_token: String::new(),
            login_user: String::new(),
            login_pass: String::new(),
            task_name: String::new(),
            env_code: String::new(),
            page_size: 20,
        },
        DtsConfig {
            config_name: "英德UAT环境".to_string(),
            base_url: "https://demo-btf-dts-api-eu.jtexpress.eu".to_string(),
            auth_token: String::new(),
            login_user: String::new(),
            login_pass: String::new(),
            task_name: String::new(),
            env_code: String::new(),
            page_size: 20,
        },
        DtsConfig {
            config_name: "中国PRO环境".to_string(),
            base_url: "https://btf-dts-api-inner.yunlu-tech.cn".to_string(),
            auth_token: String::new(),
            login_user: String::new(),
            login_pass: String::new(),
            task_name: String::new(),
            env_code: String::new(),
            page_size: 20,
        },
        DtsConfig {
            config_name: "英德PRO环境".to_string(),
            base_url: "https://btf-dts-api-eu.jtexpress.eu".to_string(),
            auth_token: String::new(),
            login_user: String::new(),
            login_pass: String::new(),
            task_name: String::new(),
            env_code: String::new(),
            page_size: 20,
        },
    ]
}

/// 加载配置时确保内置默认配置存在（只补缺失，不覆盖已有）
fn ensure_default_configs() {
    let path = config_path();
    let mut stored: DtsConfigs = if path.exists() {
        read_json_or_default(&path)
    } else {
        DtsConfigs { configs: vec![], current_config: String::new() }
    };

    let builtin = builtin_default_configs();
    let existing_names: std::collections::HashSet<String> = stored.configs.iter()
        .map(|c| c.config_name.clone()).collect();

    let mut added = 0;
    for cfg in builtin {
        if !existing_names.contains(&cfg.config_name) {
            log::info!("[DTS] 补齐内置配置: '{}'", cfg.config_name);
            stored.configs.push(cfg);
            added += 1;
        }
    }

    if added > 0 {
        if let Err(e) = write_json(&path, &stored) {
            log::error!("[DTS] 写入补齐配置失败: {}", e);
        } else {
            log::info!("[DTS] 已补齐 {} 个内置配置（总计 {}）", added, stored.configs.len());
        }
    }
}

fn upsert_config(config: &DtsConfig) {
    let mut stored: DtsConfigs = read_json_or_default(&config_path());
    if let Some(existing) = stored.configs.iter_mut().find(|c| c.config_name == config.config_name) {
        *existing = config.clone();
    } else {
        stored.configs.push(config.clone());
    }
    if stored.current_config.is_empty() {
        stored.current_config = config.config_name.clone();
    }
    let _ = write_json(&config_path(), &stored);
}

fn delete_config(name: &str) -> bool {
    let mut stored: DtsConfigs = read_json_or_default(&config_path());
    let before = stored.configs.len();
    stored.configs.retain(|c| c.config_name != name);
    if stored.configs.len() < before {
        if stored.current_config == name {
            stored.current_config = stored.configs.first().map(|c| c.config_name.clone()).unwrap_or_default();
        }
        let _ = write_json(&config_path(), &stored);
        return true;
    }
    false
}

fn active_config_exists() -> bool {
    let c = load_active_config();
    !c.base_url.is_empty() && !c.auth_token.is_empty()
}

// ==================== Tauri 命令 ====================

#[tauri::command]
pub async fn dts_list_configs() -> Result<Value, String> {
    let configs = load_all_configs();
    let current = load_current_config_name();
    log::info!("[DTS] dts_list_configs 共 {} 个，当前激活 '{}'", configs.len(), current);
    let display: Vec<Value> = configs.iter().map(|c| json!({
        "config_name": c.config_name,
        "base_url": c.base_url,
        "auth_token": mask_token(&c.auth_token),
        "login_user": c.login_user,
        "task_name": c.task_name,
        "env_code": c.env_code,
        "page_size": c.page_size,
    })).collect();
    Ok(json!({ "configs": display, "current_config": current }))
}

#[tauri::command]
pub async fn dts_get_config(name: String) -> Result<Value, String> {
    log::info!("[DTS] dts_get_config name={}", name);
    let configs = load_all_configs();
    configs.iter()
        .find(|c| c.config_name == name)
        .map(|c| json!({ "config": c }))
        .ok_or_else(|| {
            log::warn!("[DTS] dts_get_config 配置 '{}' 不存在", name);
            "配置不存在".to_string()
        })
}

#[tauri::command]
pub async fn dts_get_active_config() -> Result<Value, String> {
    let c = load_active_config();
    log::info!("[DTS] dts_get_active_config: '{}' ({} token={})",
        c.config_name, c.base_url, mask_token(&c.auth_token));
    Ok(json!({ "config": c }))
}

#[tauri::command]
pub async fn dts_save_config(config: DtsConfig) -> Result<Value, String> {
    log::info!("[DTS] dts_save_config '{}' base_url={} token={}",
        config.config_name, config.base_url, mask_token(&config.auth_token));
    if config.config_name.trim().is_empty() {
        log::warn!("[DTS] dts_save_config 失败：配置名为空");
        return Err("配置名称不能为空".into());
    }
    if config.base_url.trim().is_empty() || config.auth_token.trim().is_empty() {
        log::warn!("[DTS] dts_save_config 失败：BASE_URL 或 AUTH_TOKEN 为空");
        return Err("BASE_URL 和 AUTH_TOKEN 不能为空".into());
    }
    upsert_config(&config);
    log::info!("[DTS] ✓ dts_save_config '{}' 已保存", config.config_name);
    Ok(json!({ "success": true, "message": format!("配置 '{}' 已保存", config.config_name) }))
}

#[tauri::command]
pub async fn dts_delete_config(name: String) -> Result<Value, String> {
    log::info!("[DTS] dts_delete_config name={}", name);
    if delete_config(&name) {
        log::info!("[DTS] ✓ dts_delete_config 已删除 '{}'", name);
        Ok(json!({ "success": true, "message": format!("已删除 '{}'", name) }))
    } else {
        log::warn!("[DTS] dts_delete_config 配置 '{}' 不存在", name);
        Err("配置不存在".into())
    }
}

#[tauri::command]
pub async fn dts_activate_config(name: String) -> Result<Value, String> {
    log::info!("[DTS] dts_activate_config name={}", name);
    let configs = load_all_configs();
    if !configs.iter().any(|c| c.config_name == name) {
        log::warn!("[DTS] dts_activate_config 配置 '{}' 不存在", name);
        return Err("配置不存在".into());
    }
    save_current_config_name(&name);
    log::info!("[DTS] ✓ dts_activate_config 已切换到 '{}'", name);
    Ok(json!({ "success": true, "message": format!("已切换到 '{}'", name) }))
}

#[tauri::command]
pub async fn dts_test_connection(base_url: String, auth_token: String) -> Result<Value, String> {
    log::info!("[DTS] dts_test_connection base_url={} token={}", base_url, mask_token(&auth_token));
    if base_url.is_empty() || auth_token.is_empty() {
        log::warn!("[DTS] dts_test_connection 参数不完整");
        return Ok(json!({ "success": false, "message": "请提供完整的连接信息" }));
    }
    let mgr = TaskManager::new(&base_url, &auth_token);
    let (ok, msg) = mgr.test_connection().await;
    log::info!("[DTS] dts_test_connection 结果: success={} msg={}", ok, msg);
    Ok(json!({ "success": ok, "message": msg }))
}

#[tauri::command]
pub async fn dts_fetch_token(
    base_url: String,
    username: String,
    password: String,
    login_type: Option<String>,
) -> Result<Value, String> {
    let lt = login_type.clone().unwrap_or_else(|| "ldap".into());
    log::info!("[DTS] dts_fetch_token base_url={} user={} loginType={}", base_url, username, lt);
    if base_url.is_empty() || username.is_empty() || password.is_empty() {
        log::warn!("[DTS] dts_fetch_token 参数不完整");
        return Ok(json!({ "success": false, "message": "请提供 BASE_URL、用户名和密码" }));
    }
    let mgr = TaskManager::new(&base_url, "");
    match mgr.fetch_token(&username, &password, &lt).await {
        Ok(v) => Ok(v),
        Err(e) => {
            log::error!("[DTS] dts_fetch_token 失败: {}", e);
            Ok(json!({ "success": false, "message": e }))
        }
    }
}

#[tauri::command]
pub async fn dts_list_tasks(
    page: u32,
    status: String,
    task_name: Option<String>,
    env_code: Option<String>,
    page_size: Option<u32>,
) -> Result<Value, String> {
    let tname = task_name.unwrap_or_default();
    let ecode = env_code.unwrap_or_default();
    let psize = page_size.unwrap_or(20);
    log::info!("[DTS] dts_list_tasks page={} status={} task_name={} env_code={} page_size={}", page, status, tname, ecode, psize);
    if !active_config_exists() {
        log::warn!("[DTS] dts_list_tasks 失败：没有激活配置");
        return Ok(json!({ "code": 0, "data": { "records": [], "total": 0 }, "success": false, "message": "请先配置 BASE_URL 和 AUTH_TOKEN" }));
    }
    let c = load_active_config();
    // 优先使用传入的参数，否则使用配置默认值
    let final_task_name = if tname.is_empty() { c.task_name.clone() } else { tname };
    let final_env_code = if ecode.is_empty() { c.env_code.clone() } else { ecode };
    let final_page_size = if psize == 20 { c.page_size } else { psize };
    log::info!("[DTS] dts_list_tasks 使用配置 '{}' ({})", c.config_name, c.base_url);
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);
    mgr.query_tasks(page, final_page_size, &final_task_name, &final_env_code, &status).await
}

#[tauri::command]
pub async fn dts_start_task(task_id: String) -> Result<Value, String> {
    log::info!("[DTS] dts_start_task task_id={}", task_id);
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);
    let r = mgr.safe_start(&task_id, "").await;
    log::info!("[DTS] dts_start_task 结果: success={} msg={}",
        r.get("success").and_then(|v| v.as_bool()).unwrap_or(false),
        r.get("message").and_then(|v| v.as_str()).unwrap_or(""));
    Ok(r)
}

#[tauri::command]
pub async fn dts_stop_task(task_id: String) -> Result<Value, String> {
    log::info!("[DTS] dts_stop_task task_id={}", task_id);
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);
    let r = mgr.simple_op("stop", &task_id).await;
    log::info!("[DTS] dts_stop_task 结果: success={}", r.get("success").and_then(|v| v.as_bool()).unwrap_or(false));
    Ok(r)
}

#[tauri::command]
pub async fn dts_delete_task(task_id: String) -> Result<Value, String> {
    log::info!("[DTS] dts_delete_task task_id={}", task_id);
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);
    let r = mgr.simple_op("delete", &task_id).await;
    log::info!("[DTS] dts_delete_task 结果: success={}", r.get("success").and_then(|v| v.as_bool()).unwrap_or(false));
    Ok(r)
}

#[tauri::command]
pub async fn dts_rename_task(task_id: String, new_name: String) -> Result<Value, String> {
    log::info!("[DTS] dts_rename_task task_id={} new_name={}", task_id, new_name);
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);
    let new_name = new_name.trim();
    if new_name.is_empty() {
        log::warn!("[DTS] dts_rename_task 失败：新名称为空");
        return Ok(json!({ "success": false, "message": "新名称不能为空" }));
    }
    let (_ok, r) = mgr.rename_task(&task_id, new_name).await?;
    let success = mgr.is_success(&r);
    let msg = r.get("msg").and_then(|v| v.as_str()).unwrap_or(if success { "改名成功" } else { "改名失败" });
    log::info!("[DTS] dts_rename_task 结果: success={} msg={}", success, msg);
    Ok(json!({ "success": success, "message": msg, "data": r }))
}

#[tauri::command]
pub async fn dts_reset_offset(
    task_id: String,
    binlog_file_name: String,
    binlog_file_position: String,
) -> Result<Value, String> {
    log::info!("[DTS] dts_reset_offset task_id={} binlog={}:{}", task_id, binlog_file_name, binlog_file_position);
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);
    let (_ok, r) = mgr.reset_offset(&task_id, &binlog_file_name, &binlog_file_position).await?;
    let success = mgr.is_success(&r);
    let msg = r.get("msg").and_then(|v| v.as_str()).unwrap_or(if success { "重置点位成功" } else { "重置点位失败" });
    log::info!("[DTS] dts_reset_offset 结果: success={} msg={}", success, msg);
    Ok(json!({ "success": success, "message": msg, "data": r }))
}

#[tauri::command]
pub async fn dts_list_environments(status: Option<String>) -> Result<Value, String> {
    let s = status.clone().unwrap_or_else(|| "启用".into());
    log::info!("[DTS] dts_list_environments status={}", s);
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);
    mgr.get_environments(&s).await
}

#[tauri::command]
pub async fn dts_list_flush(
    page: u32,
    status: String,
    task_name: Option<String>,
    env_code: Option<String>,
    page_size: Option<u32>,
) -> Result<Value, String> {
    let tname = task_name.unwrap_or_default();
    let ecode = env_code.unwrap_or_default();
    let psize = page_size.unwrap_or(20);
    log::info!("[DTS] dts_list_flush page={} status={} task_name={} env_code={} page_size={}", page, status, tname, ecode, psize);
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    // 优先使用传入的参数，否则使用配置默认值
    let final_task_name = if tname.is_empty() { c.task_name.clone() } else { tname };
    let final_env_code = if ecode.is_empty() { c.env_code.clone() } else { ecode };
    let final_page_size = if psize == 20 { c.page_size } else { psize };
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);
    mgr.query_flush(page, final_page_size, &final_task_name, &final_env_code, &status).await
}

#[tauri::command]
pub async fn dts_create_flush(task: Value) -> Result<Value, String> {
    let task_id = task.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let task_name = task.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let flush_name = task.get("flushName").and_then(|v| v.as_str());
    log::info!("[DTS] dts_create_flush task={} ({}) flush_name={:?}", task_name, task_id, flush_name);
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);
    let (ok, r) = mgr.create_flush_for_task(&task, flush_name).await?;
    Ok(json!({ "success": mgr.is_success(&r), "data": r, "ok": ok }))
}

#[tauri::command]
pub async fn dts_start_flush(flush_id: String) -> Result<Value, String> {
    log::info!("[DTS] dts_start_flush flush_id={}", flush_id);
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);
    let (ok, r) = mgr.start_flush(&flush_id).await?;
    let success = mgr.is_success(&r);
    log::info!("[DTS] dts_start_flush 结果: success={}", success);
    Ok(json!({ "success": success, "message": if success { "启动成功" } else { "启动失败" }, "data": r, "ok": ok }))
}

#[tauri::command]
pub async fn dts_delete_flush(flush_id: String) -> Result<Value, String> {
    log::info!("[DTS] dts_delete_flush flush_id={}", flush_id);
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);
    let (ok, r) = mgr.delete_flush(&flush_id).await?;
    let success = mgr.is_success(&r);
    log::info!("[DTS] dts_delete_flush 结果: success={}", success);
    Ok(json!({ "success": success, "message": if success { "删除成功" } else { "删除失败" }, "data": r, "ok": ok }))
}

// 流式批量：返回 NDJSON
#[tauri::command]
pub async fn dts_batch_op(
    op: String,
    tasks: Vec<Value>,
) -> Result<Vec<u8>, String> {
    log::info!("[DTS] dts_batch_op op={} 共 {} 个任务", op, tasks.len());
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);

    let mut ndjson = String::new();
    let total = tasks.len();
    let mut success_count = 0;

    for (idx, t) in tasks.iter().enumerate() {
        let tid = t.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let tname = t.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let result = match op.as_str() {
            "start" => mgr.safe_start(&tid, &tname).await,
            "stop" => mgr.simple_op("stop", &tid).await,
            "delete" => mgr.simple_op("delete", &tid).await,
            _ => json!({ "success": false, "message": "未知操作" }),
        };

        let success = result.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
        if success { success_count += 1; }

        let line = json!({
            "type": "progress",
            "index": idx + 1,
            "total": total,
            "task_id": tid,
            "task_name": tname,
            "success": success,
            "message": result.get("message").and_then(|v| v.as_str()).unwrap_or(""),
        });
        ndjson.push_str(&serde_json::to_string(&line).unwrap_or_default());
        ndjson.push('\n');
    }

    let summary = json!({
        "type": "summary",
        "total": total,
        "success_count": success_count,
        "failed_count": total - success_count,
    });
    ndjson.push_str(&serde_json::to_string(&summary).unwrap_or_default());
    ndjson.push('\n');
    log::info!("[DTS] batch summary 成功 {}/失败 {}", success_count, total - success_count);
    log::info!("[DTS] dts_batch_op {} 完成 成功 {}/失败 {}", op, success_count, total - success_count);

    Ok(ndjson.into_bytes())
}

#[tauri::command]
pub async fn dts_batch_rename(items: Vec<Value>) -> Result<Vec<u8>, String> {
    log::info!("[DTS] dts_batch_rename 共 {} 项", items.len());
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);

    let mut ndjson = String::new();
    let total = items.len();
    let mut success_count = 0;

    for (idx, item) in items.iter().enumerate() {
        let tid = item.get("task_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let new_name = item.get("new_name").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let (ok, r) = if !tid.is_empty() && !new_name.is_empty() {
            mgr.rename_task(&tid, &new_name).await.unwrap_or((false, json!({})))
        } else {
            (false, json!({"msg": "参数不完整"}))
        };
        let success = ok && mgr.is_success(&r);
        if success { success_count += 1; }

        let line = json!({
            "type": "progress",
            "index": idx + 1,
            "total": total,
            "task_id": tid,
            "task_name": new_name,
            "success": success,
            "message": r.get("msg").and_then(|v| v.as_str()).unwrap_or(if success { "改名成功" } else { "改名失败" }),
        });
        ndjson.push_str(&serde_json::to_string(&line).unwrap_or_default());
        ndjson.push('\n');
    }

    let summary = json!({
        "type": "summary",
        "total": total,
        "success_count": success_count,
        "failed_count": total - success_count,
    });
    ndjson.push_str(&serde_json::to_string(&summary).unwrap_or_default());
    ndjson.push('\n');
    log::info!("[DTS] batch summary 成功 {}/失败 {}", success_count, total - success_count);
    log::info!("[DTS] dts_batch_rename 完成 成功 {}/失败 {}", success_count, total - success_count);

    Ok(ndjson.into_bytes())
}

#[tauri::command]
pub async fn dts_batch_create_flush(tasks: Vec<Value>) -> Result<Vec<u8>, String> {
    log::info!("[DTS] dts_batch_create_flush 共 {} 项", tasks.len());
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);

    let mut ndjson = String::new();
    let total = tasks.len();
    let mut success_count = 0;

    for (idx, t) in tasks.iter().enumerate() {
        let flush_name = t.get("flushName").and_then(|v| v.as_str());
        let result = match mgr.create_flush_for_task(t, flush_name).await {
            Ok((ok, r)) => {
                let success = ok && mgr.is_success(&r);
                json!({
                    "success": success,
                    "message": r.get("msg").and_then(|v| v.as_str()).unwrap_or(if success { "创建成功" } else { "创建失败" }),
                    "data": r,
                })
            }
            Err(e) => json!({ "success": false, "message": e }),
        };
        let success = result.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
        if success { success_count += 1; }

        let line = json!({
            "type": "progress",
            "index": idx + 1,
            "total": total,
            "task_id": t.get("id").and_then(|v| v.as_str()).unwrap_or(""),
            "task_name": t.get("name").and_then(|v| v.as_str()).unwrap_or(""),
            "success": success,
            "message": result.get("message").and_then(|v| v.as_str()).unwrap_or(""),
        });
        ndjson.push_str(&serde_json::to_string(&line).unwrap_or_default());
        ndjson.push('\n');
    }

    let summary = json!({
        "type": "summary",
        "total": total,
        "success_count": success_count,
        "failed_count": total - success_count,
    });
    ndjson.push_str(&serde_json::to_string(&summary).unwrap_or_default());
    ndjson.push('\n');
    log::info!("[DTS] dts_batch_create_flush 完成 成功 {}/失败 {}", success_count, total - success_count);

    Ok(ndjson.into_bytes())
}

#[tauri::command]
pub async fn dts_batch_flush_op(op: String, records: Vec<Value>) -> Result<Vec<u8>, String> {
    log::info!("[DTS] dts_batch_flush_op op={} 共 {} 项", op, records.len());
    if !active_config_exists() { return Err("请先配置".into()); }
    let c = load_active_config();
    let mgr = TaskManager::new(&c.base_url, &c.auth_token);

    let mut ndjson = String::new();
    let total = records.len();
    let mut success_count = 0;

    for (idx, r) in records.iter().enumerate() {
        let fid = r.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let fname = r.get("taskName").and_then(|v| v.as_str())
            .or_else(|| r.get("name").and_then(|v| v.as_str()))
            .unwrap_or("").to_string();

        let result = match op.as_str() {
            "start" => mgr.start_flush(&fid).await,
            "delete" => mgr.delete_flush(&fid).await,
            _ => Ok((false, json!({"msg": "未知操作"}))),
        };

        let success = match &result {
            Ok((ok, r)) => *ok && mgr.is_success(r),
            Err(_) => false,
        };
        if success { success_count += 1; }

        let msg = match &result {
            Ok((_, r)) => r.get("msg").and_then(|v| v.as_str()).unwrap_or(if success { "成功" } else { "失败" }).to_string(),
            Err(e) => e.clone(),
        };

        let line = json!({
            "type": "progress",
            "index": idx + 1,
            "total": total,
            "task_id": fid,
            "task_name": fname,
            "success": success,
            "message": msg,
        });
        ndjson.push_str(&serde_json::to_string(&line).unwrap_or_default());
        ndjson.push('\n');
    }

    let summary = json!({
        "type": "summary",
        "total": total,
        "success_count": success_count,
        "failed_count": total - success_count,
    });
    ndjson.push_str(&serde_json::to_string(&summary).unwrap_or_default());
    ndjson.push('\n');
    log::info!("[DTS] dts_batch_flush_op op={} 完成 成功 {}/失败 {}", op, success_count, total - success_count);

    Ok(ndjson.into_bytes())
}
