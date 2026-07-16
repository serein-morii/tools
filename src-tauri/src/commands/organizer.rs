//! 一键整理桌面 - 按文件类型/文件名模式自动归类到文件夹
//!
//! 支持预览模式、执行模式、还原、自定义规则。

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

// ==================== 桌面刷新 ====================

/// 整理完成后通知系统刷新桌面图标排列
fn refresh_desktop(path: &PathBuf) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;

        // 方式1: SHChangeNotify 通知 Explorer 目录内容已变
        let wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        extern "system" {
            fn SHChangeNotify(wEventId: i32, uFlags: u32, dwItem1: *const std::ffi::c_void, dwItem2: *const std::ffi::c_void);
        }
        const SHCNE_UPDATEDIR: i32 = 0x0000_1000;
        const SHCNF_PATHW: u32 = 0x0005;
        unsafe {
            SHChangeNotify(
                SHCNE_UPDATEDIR,
                SHCNF_PATHW,
                wide.as_ptr() as *const std::ffi::c_void,
                std::ptr::null(),
            );
        }

        // 方式2: 强制全量刷新图标缓存（处理图标未重排的情况）
        const SHCNE_ASSOCCHANGED: i32 = 0x0800_0000;
        const SHCNF_IDLIST: u32 = 0x0000;
        unsafe {
            SHChangeNotify(
                SHCNE_ASSOCCHANGED,
                SHCNF_IDLIST,
                std::ptr::null(),
                std::ptr::null(),
            );
        }

        // 方式3: 桌面图标自动排列（排成一排排）
        extern "system" {
            fn FindWindowW(lpClassName: *const u16, lpWindowName: *const u16) -> isize;
            fn FindWindowExW(hWndParent: isize, hWndChildAfter: isize, lpClassName: *const u16, lpWindowName: *const u16) -> isize;
            fn SendMessageW(hWnd: isize, Msg: u32, wParam: usize, lParam: isize) -> isize;
            fn PostMessageW(hWnd: isize, Msg: u32, wParam: usize, lParam: isize) -> isize;
        }

        unsafe {
            // "Progman" → "SHELLDLL_DefView" → "SysListView32"（桌面图标控件）
            let progman_wide: Vec<u16> = "Progman\0".encode_utf16().collect();
            let defview_wide: Vec<u16> = "SHELLDLL_DefView\0".encode_utf16().collect();
            let progman = FindWindowW(progman_wide.as_ptr(), std::ptr::null());
            if progman != 0 {
                let defview = FindWindowExW(progman, 0, defview_wide.as_ptr(), std::ptr::null());
                if defview != 0 {
                    let listview = FindWindowExW(defview, 0, std::ptr::null(), std::ptr::null());
                    if listview != 0 {
                        // F5 刷新
                        const WM_KEYDOWN: u32 = 0x0100;
                        const VK_F5: usize = 0x74;
                        PostMessageW(listview, WM_KEYDOWN, VK_F5, 0);

                        // LVM_ARRANGE: 图标对齐到网格，排成整齐的排
                        const LVM_ARRANGE: u32 = 0x1000 + 22; // LVM_FIRST + 22
                        const LVA_SNAPTOGRID: usize = 0x0005;
                        SendMessageW(listview, LVM_ARRANGE, LVA_SNAPTOGRID, 0);
                    }
                }
            }
        }

        // 方式4: 按类型排序 → 文件夹排在最后
        let _ = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-WindowStyle", "Hidden",
                "-Command",
                "$e=$null;$s=(New-Object -ComObject Shell.Application);try{$s.Namespace(0).Self.InvokeVerb('arrangebytype')}catch{};try{$s.Namespace(0).Self.InvokeVerb('ArrangeIconsByType')}catch{};try{$s.Namespace(0).Self.InvokeVerb('ArrangeByType')}catch{}",
            ])
            .spawn();

        log::info!("[Organizer] 桌面刷新 + 按类型排序已触发");
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
    }
}

// ==================== 持久化路径 ====================

fn data_dir() -> PathBuf {
    dirs::home_dir()
        .map(|h| h.join(".tools"))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn last_organize_path() -> PathBuf {
    data_dir().join("last_organize.json")
}

fn custom_rules_path() -> PathBuf {
    data_dir().join("organizer_rules.json")
}

fn read_json<T: Default + for<'de> Deserialize<'de>>(path: &PathBuf) -> T {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_json<T: Serialize>(path: &PathBuf, data: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let s = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(path, s).map_err(|e| e.to_string())
}

// ==================== 数据结构 ====================

/// 单条归类规则
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizeRule {
    /// 分类名称（也作文件夹名），如 "图片"
    pub category: String,
    /// 扩展名列表（小写，不含点），如 ["jpg", "png", "gif"]
    #[serde(default)]
    pub extensions: Vec<String>,
    /// 文件名通配符模式，如 ["*.log", "temp_*", "backup-*"]
    /// 支持 * 匹配任意字符序列
    #[serde(default)]
    pub filename_patterns: Vec<String>,
    /// 仅匹配文件夹（用于桌面目录归类），默认 false = 仅匹配文件
    #[serde(default)]
    pub for_folders: bool,
}

/// 文件移动记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMove {
    pub file_name: String,
    /// 原路径
    pub old_path: String,
    /// 新路径
    pub new_path: String,
    /// 归类到哪个分类
    pub category: String,
    /// 文件大小(bytes)
    pub size: u64,
}

/// 整理请求
#[derive(Debug, Clone, Deserialize)]
pub struct OrganizeRequest {
    /// 源目录（留空则用桌面）
    pub source_dir: Option<String>,
    /// 自定义规则（会与内置规则合并，自定义优先）
    pub custom_rules: Option<Vec<OrganizeRule>>,
    /// 是否仅预览
    #[serde(default)]
    pub preview: bool,
    /// 自定义"其他"文件夹名
    pub other_folder: Option<String>,
    /// 是否包含内置规则（默认 true）
    #[serde(default = "default_true")]
    pub include_builtin: bool,
    /// 排除的扩展名（跳过这些文件），如 ["lnk", "tmp"]
    #[serde(default)]
    pub exclude_extensions: Vec<String>,
    /// 排除的文件名通配符，如 ["*.tmp", "~*"]
    #[serde(default)]
    pub exclude_patterns: Vec<String>,
    /// 是否也整理文件夹（默认 false，只整理文件）
    #[serde(default)]
    pub include_folders: bool,
}

fn default_true() -> bool { true }

/// 整理结果
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OrganizeResult {
    /// 扫描的总文件数
    pub total_files: u32,
    /// 将被/已被移动的文件数
    pub organized: u32,
    /// 跳过的文件数（已在目标文件夹中）
    pub skipped: u32,
    /// 创建的文件夹列表
    pub folders_created: Vec<String>,
    /// 每个文件的移动详情
    pub details: Vec<FileMove>,
    /// 是否是预览模式
    pub preview_mode: bool,
    /// 源目录
    pub source_dir: String,
    /// 操作时间戳
    pub timestamp: u64,
}

/// 还原结果
#[derive(Debug, Clone, Serialize)]
pub struct UndoResult {
    /// 成功还原的文件数
    pub restored: u32,
    /// 失败数
    pub failed: u32,
    /// 每个文件的还原结果
    pub details: Vec<UndoDetail>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UndoDetail {
    pub file_name: String,
    pub from_path: String,
    pub to_path: String,
    pub success: bool,
    pub error: Option<String>,
}

// ==================== 内置规则 ====================

fn builtin_rules() -> Vec<OrganizeRule> {
    vec![
        OrganizeRule {
            category: "图片".to_string(),
            extensions: vec![
                "jpg", "jpeg", "png", "gif", "bmp", "svg", "webp", "ico", "heic", "tiff",
                "tif", "raw", "psd", "ai", "eps",
            ].into_iter().map(|s| s.to_string()).collect(),
            filename_patterns: vec![],
            for_folders: false,
        },
        OrganizeRule {
            category: "文档".to_string(),
            extensions: vec![
                "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv",
                "json", "xml", "yaml", "yml", "rtf", "odt", "ods", "odp", "log", "ini",
                "cfg", "conf", "toml",
            ].into_iter().map(|s| s.to_string()).collect(),
            filename_patterns: vec![],
            for_folders: false,
        },
        OrganizeRule {
            category: "压缩包".to_string(),
            extensions: vec![
                "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz", "iso",
            ].into_iter().map(|s| s.to_string()).collect(),
            filename_patterns: vec![],
            for_folders: false,
        },
        OrganizeRule {
            category: "安装包".to_string(),
            extensions: vec![
                "exe", "msi", "dmg", "pkg", "deb", "rpm", "appimage",
            ].into_iter().map(|s| s.to_string()).collect(),
            filename_patterns: vec![],
            for_folders: false,
        },
        OrganizeRule {
            category: "代码".to_string(),
            extensions: vec![
                "py", "js", "ts", "tsx", "jsx", "java", "rs", "go", "cpp", "c", "h",
                "hpp", "html", "css", "scss", "less", "sh", "bash", "bat", "ps1", "cmd",
                "sql", "swift", "kt", "vue", "svelte",
            ].into_iter().map(|s| s.to_string()).collect(),
            filename_patterns: vec![],
            for_folders: false,
        },
        OrganizeRule {
            category: "视频".to_string(),
            extensions: vec![
                "mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg",
                "3gp", "rmvb",
            ].into_iter().map(|s| s.to_string()).collect(),
            filename_patterns: vec![],
            for_folders: false,
        },
        OrganizeRule {
            category: "音频".to_string(),
            extensions: vec![
                "mp3", "wav", "flac", "aac", "ogg", "wma", "m4a", "ape", "opus",
            ].into_iter().map(|s| s.to_string()).collect(),
            filename_patterns: vec![],
            for_folders: false,
        },
        OrganizeRule {
            category: "文件夹".to_string(),
            extensions: vec![],
            filename_patterns: vec!["*".to_string()],
            for_folders: true,
        },
    ]
}

// ==================== 文件名通配符匹配 ====================

/// 简单通配符匹配：支持 * 匹配任意字符序列
/// 例如: "*.log" 匹配 "error.log", "access.log"
///       "temp_*" 匹配 "temp_2024.txt"
///       "backup-*" 匹配 "backup-db.sql"
fn glob_match(pattern: &str, name: &str) -> bool {
    if pattern == "*" { return true; }
    if !pattern.contains('*') {
        return pattern.eq_ignore_ascii_case(name);
    }

    let parts: Vec<&str> = pattern.split('*').collect();

    // 前缀匹配
    if let Some(first) = parts.first() {
        if !first.is_empty() && !name.to_lowercase().starts_with(&first.to_lowercase()) {
            return false;
        }
    }

    // 后缀匹配
    if let Some(last) = parts.last() {
        if !last.is_empty() && !name.to_lowercase().ends_with(&last.to_lowercase()) {
            return false;
        }
    }

    // 中间部分按顺序匹配
    let mut pos = 0;
    let lower = name.to_lowercase();
    for part in &parts[1..parts.len()-1] {
        if part.is_empty() { continue; }
        let lower_part = part.to_lowercase();
        if let Some(found) = lower[pos..].find(&lower_part) {
            pos += found + lower_part.len();
        } else {
            return false;
        }
    }

    // 特殊情况：pattern 只有一个 * 在开头（*suffix）或结尾（prefix*）
    if parts.len() == 2 && parts[0].is_empty() {
        // *suffix — already checked by suffix check above
        return true;
    }
    if parts.len() == 2 && parts[1].is_empty() {
        // prefix* — already checked by prefix check above
        return true;
    }

    true
}

// ==================== 核心逻辑 ====================

fn desktop_dir() -> PathBuf {
    dirs::desktop_dir().unwrap_or_else(|| {
        dirs::home_dir()
            .map(|h| h.join("Desktop"))
            .unwrap_or_else(|| PathBuf::from("."))
    })
}

/// 匹配规则：先通过文件名模式匹配，再通过扩展名匹配
fn find_category(
    rules: &[OrganizeRule],
    file_name: &str,
    ext: &str,
    is_dir: bool,
) -> Option<String> {
    for rule in rules {
        // 跳过类型不匹配的规则（for_folders 规则只匹配目录，普通规则只匹配文件）
        if rule.for_folders != is_dir {
            continue;
        }
        // 1. 检查文件名通配符
        for pattern in &rule.filename_patterns {
            if !pattern.is_empty() && glob_match(pattern, file_name) {
                return Some(rule.category.clone());
            }
        }
        // 2. 检查扩展名
        if !ext.is_empty() {
            for rule_ext in &rule.extensions {
                if rule_ext.eq_ignore_ascii_case(ext) {
                    return Some(rule.category.clone());
                }
            }
        }
    }
    None
}

fn do_organize(req: &OrganizeRequest) -> Result<OrganizeResult, String> {
    let source = match &req.source_dir {
        Some(dir) if !dir.trim().is_empty() => PathBuf::from(dir),
        _ => desktop_dir(),
    };

    if !source.exists() {
        return Err(format!("目录不存在: {}", source.display()));
    }
    if !source.is_dir() {
        return Err(format!("路径不是目录: {}", source.display()));
    }

    // 合并内置规则 + 自定义规则（自定义优先排前面）
    let mut rules = req.custom_rules.clone().unwrap_or_default();
    if req.include_builtin {
        let builtin = builtin_rules();
        // 内置规则放在后面（自定义优先匹配）
        rules.extend(builtin);
    }

    let other_folder = req.other_folder.clone().unwrap_or_else(|| "其他".to_string());

    let mut result = OrganizeResult {
        total_files: 0,
        organized: 0,
        skipped: 0,
        folders_created: Vec::new(),
        details: Vec::new(),
        preview_mode: req.preview,
        source_dir: source.to_string_lossy().to_string(),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    };

    let entries = std::fs::read_dir(&source)
        .map_err(|e| format!("读取目录失败: {}", e))?;

    // 收集分类文件夹名（用于跳过自身）
    let category_names: std::collections::HashSet<String> = rules
        .iter()
        .map(|r| r.category.clone())
        .chain(std::iter::once(other_folder.clone()))
        .collect();

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();

        if path.is_dir() {
            let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            // 跳过分类文件夹自身 + 隐藏目录
            if category_names.contains(dir_name) || dir_name.starts_with('.') {
                result.skipped += 1;
                continue;
            }
            // 如果不整理文件夹，跳过
            if !req.include_folders {
                continue;
            }
        }

        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }
        }

        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        // 检查排除规则
        if !ext.is_empty() && req.exclude_extensions.iter().any(|e| e.eq_ignore_ascii_case(&ext)) {
            result.skipped += 1;
            continue;
        }
        if req.exclude_patterns.iter().any(|p| glob_match(p, file_name)) {
            result.skipped += 1;
            continue;
        }

        result.total_files += 1;

        let category = find_category(&rules, file_name, &ext, path.is_dir())
            .unwrap_or_else(|| other_folder.clone());

        let dest_dir = source.join(&category);
        let dest_path = dest_dir.join(file_name);

        if path == dest_path {
            result.skipped += 1;
            continue;
        }

        // 重名处理
        let final_dest = if dest_path.exists() {
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
            let ext_with_dot = if ext.is_empty() {
                String::new()
            } else {
                format!(".{}", ext)
            };

            let mut counter = 1;
            loop {
                let new_name = format!("{}_{}{}", stem, counter, ext_with_dot);
                let new_path = dest_dir.join(&new_name);
                if !new_path.exists() {
                    break new_path;
                }
                counter += 1;
                if counter > 1000 {
                    return Err(format!(
                        "重名文件过多，无法为 {} 生成唯一名称",
                        file_name
                    ));
                }
            }
        } else {
            dest_path
        };

        let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

        result.details.push(FileMove {
            file_name: file_name.to_string(),
            old_path: path.to_string_lossy().to_string(),
            new_path: final_dest.to_string_lossy().to_string(),
            category: category.clone(),
            size,
        });

        if !req.preview {
            if !dest_dir.exists() {
                std::fs::create_dir_all(&dest_dir)
                    .map_err(|e| format!("创建文件夹失败 {}: {}", dest_dir.display(), e))?;
                result.folders_created.push(dest_dir.to_string_lossy().to_string());
            }
            std::fs::rename(&path, &final_dest).map_err(|e| {
                format!(
                    "移动文件失败 {} → {}: {}",
                    path.display(),
                    final_dest.display(),
                    e
                )
            })?;
        }

        result.organized += 1;
    }

    // 预览模式下收集将要创建的文件夹
    if req.preview {
        let mut created = std::collections::HashSet::new();
        for detail in &result.details {
            let dir = PathBuf::from(&detail.new_path)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            if dir != source.to_string_lossy().to_string() {
                created.insert(dir);
            }
        }
        result.folders_created = created.into_iter().collect();
    }

    result.folders_created.sort();
    result.folders_created.dedup();

    Ok(result)
}

// ==================== Tauri 命令 ====================

#[tauri::command]
pub fn get_desktop_path() -> Result<String, String> {
    Ok(desktop_dir().to_string_lossy().to_string())
}

#[tauri::command]
pub fn organize_desktop(req: OrganizeRequest) -> Result<OrganizeResult, String> {
    log::info!(
        "[Organizer] organize source={:?} preview={} rules={}",
        req.source_dir,
        req.preview,
        req.custom_rules.as_ref().map(|r| r.len()).unwrap_or(0)
    );

    let result = do_organize(&req)?;

    log::info!(
        "[Organizer] {} 完成: total={} organized={} skipped={}",
        if req.preview { "预览" } else { "执行" },
        result.total_files,
        result.organized,
        result.skipped
    );

    // 非预览模式下，持久化操作记录供还原使用 + 刷新桌面
    if !req.preview && result.organized > 0 {
        let last_path = last_organize_path();
        if let Err(e) = write_json(&last_path, &result) {
            log::error!("[Organizer] 保存操作记录失败: {}", e);
        } else {
            log::info!("[Organizer] 操作记录已保存到 {}", last_path.display());
        }

        // 通知系统刷新桌面图标
        let refresh_path = PathBuf::from(&result.source_dir);
        refresh_desktop(&refresh_path);
    }

    Ok(result)
}

/// 还原上次整理操作（将文件从分类文件夹移回源目录）
#[tauri::command]
pub fn undo_organize() -> Result<UndoResult, String> {
    let last_path = last_organize_path();
    if !last_path.exists() {
        return Err("没有可还原的操作记录".to_string());
    }

    let last: OrganizeResult = read_json(&last_path);
    if last.details.is_empty() {
        return Err("操作记录为空，无需还原".to_string());
    }

    log::info!(
        "[Organizer] undo 开始，共 {} 个文件",
        last.details.len()
    );

    let mut result = UndoResult {
        restored: 0,
        failed: 0,
        details: Vec::new(),
    };

    // 收集需要删除的空目录
    let mut dirs_touched: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    for file_move in &last.details {
        let from = PathBuf::from(&file_move.new_path);
        let to = PathBuf::from(&file_move.old_path);

        if !from.exists() {
            result.failed += 1;
            result.details.push(UndoDetail {
                file_name: file_move.file_name.clone(),
                from_path: from.to_string_lossy().to_string(),
                to_path: to.to_string_lossy().to_string(),
                success: false,
                error: Some("文件不存在，可能已被移动或删除".to_string()),
            });
            continue;
        }

        // 确保目标目录存在
        if let Some(parent) = to.parent() {
            if !parent.exists() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    result.failed += 1;
                    result.details.push(UndoDetail {
                        file_name: file_move.file_name.clone(),
                        from_path: from.to_string_lossy().to_string(),
                        to_path: to.to_string_lossy().to_string(),
                        success: false,
                        error: Some(format!("创建目标目录失败: {}", e)),
                    });
                    continue;
                }
            }
        }

        // 目标路径已存在，加后缀
        let final_to: Option<PathBuf> = if to.exists() {
            let stem = to.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
            let ext = to.extension().and_then(|s| s.to_str()).map(|e| format!(".{}", e)).unwrap_or_default();
            let parent = to.parent().unwrap_or(&to);
            let mut counter = 1;
            let mut found = None;
            loop {
                let new_name = format!("{}_restored_{}{}", stem, counter, ext);
                let new_path = parent.join(&new_name);
                if !new_path.exists() {
                    found = Some(new_path);
                    break;
                }
                counter += 1;
                if counter > 100 {
                    result.failed += 1;
                    result.details.push(UndoDetail {
                        file_name: file_move.file_name.clone(),
                        from_path: from.to_string_lossy().to_string(),
                        to_path: to.to_string_lossy().to_string(),
                        success: false,
                        error: Some("目标路径已存在且无法生成唯一名称".to_string()),
                    });
                    break;
                }
            }
            found
        } else {
            Some(to.clone())
        };

        // 如果已经在循环中标记为失败，跳过
        let final_to = match final_to {
            Some(p) => p,
            None => continue,
        };

        match std::fs::rename(&from, &final_to) {
            Ok(_) => {
                result.restored += 1;
                result.details.push(UndoDetail {
                    file_name: file_move.file_name.clone(),
                    from_path: from.to_string_lossy().to_string(),
                    to_path: final_to.to_string_lossy().to_string(),
                    success: true,
                    error: None,
                });
                // 记录来源目录
                if let Some(parent) = from.parent() {
                    dirs_touched.insert(parent.to_path_buf());
                }
            }
            Err(e) => {
                result.failed += 1;
                result.details.push(UndoDetail {
                    file_name: file_move.file_name.clone(),
                    from_path: from.to_string_lossy().to_string(),
                    to_path: final_to.to_string_lossy().to_string(),
                    success: false,
                    error: Some(format!("移动失败: {}", e)),
                });
            }
        }
    }

    // 删除空的分类文件夹
    for dir in &dirs_touched {
        // 只删除在源目录下的空文件夹
        let source_dir = PathBuf::from(&last.source_dir);
        if dir.starts_with(&source_dir) && *dir != source_dir {
            let _ = std::fs::remove_dir(dir);
        }
    }

    log::info!(
        "[Organizer] undo 完成: restored={} failed={}",
        result.restored,
        result.failed
    );

    // 清除操作记录
    let _ = std::fs::remove_file(&last_path);

    Ok(result)
}

/// 检查是否有可还原的操作
#[tauri::command]
pub fn has_undo_data() -> Result<bool, String> {
    let path = last_organize_path();
    if !path.exists() {
        return Ok(false);
    }
    let last: OrganizeResult = read_json(&path);
    Ok(!last.details.is_empty() && !last.preview_mode)
}

/// 获取内置分类规则
#[tauri::command]
pub fn get_builtin_rules() -> Result<Vec<OrganizeRule>, String> {
    Ok(builtin_rules())
}

/// 获取用户自定义规则
#[tauri::command]
pub fn get_custom_rules() -> Result<Vec<OrganizeRule>, String> {
    let path = custom_rules_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let rules: Vec<OrganizeRule> = read_json(&path);
    Ok(rules)
}

/// 保存用户自定义规则
#[tauri::command]
pub fn save_custom_rules(rules: Vec<OrganizeRule>) -> Result<(), String> {
    let path = custom_rules_path();
    write_json(&path, &rules)
}

/// 暴力还原：将源目录下所有子文件夹里的文件全部移回源目录，删除空文件夹
#[tauri::command]
pub fn restore_all_from_folders(source_dir: Option<String>) -> Result<UndoResult, String> {
    let source = match &source_dir {
        Some(dir) if !dir.trim().is_empty() => PathBuf::from(dir),
        _ => desktop_dir(),
    };

    if !source.exists() || !source.is_dir() {
        return Err(format!("目录不存在: {}", source.display()));
    }

    log::info!("[Organizer] restore_all 开始 source={}", source.display());

    let mut result = UndoResult {
        restored: 0,
        failed: 0,
        details: Vec::new(),
    };

    // 收集所有子目录中的文件
    let mut to_move: Vec<PathBuf> = Vec::new();

    // 只扫描一级子目录
    let entries = std::fs::read_dir(&source)
        .map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let sub_dir = entry.path();
        if !sub_dir.is_dir() {
            continue;
        }
        // 扫描子目录中的文件
        let sub_entries = match std::fs::read_dir(&sub_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for sub_entry in sub_entries {
            let sub_entry = match sub_entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let file_path = sub_entry.path();
            if file_path.is_file() {
                to_move.push(file_path);
            }
        }
    }

    if to_move.is_empty() {
        log::info!("[Organizer] restore_all 没有需要还原的文件");
        return Ok(result);
    }

    log::info!("[Organizer] restore_all 找到 {} 个文件", to_move.len());

    let mut dirs_touched: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    for file_path in &to_move {
        let file_name = file_path.file_name().unwrap_or_default();
        let dest_path = source.join(file_name);

        // 重名处理
        let final_dest = if dest_path.exists() {
            let stem = file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
            let ext = file_path.extension().and_then(|s| s.to_str()).map(|e| format!(".{}", e)).unwrap_or_default();
            let mut counter = 1;
            let mut found = None;
            loop {
                let new_name = format!("{}_restored_{}{}", stem, counter, ext);
                let new_path = source.join(&new_name);
                if !new_path.exists() {
                    found = Some(new_path);
                    break;
                }
                counter += 1;
                if counter > 100 {
                    break;
                }
            }
            found
        } else {
            Some(dest_path)
        };

        let final_dest = match final_dest {
            Some(p) => p,
            None => {
                result.failed += 1;
                result.details.push(UndoDetail {
                    file_name: file_name.to_string_lossy().to_string(),
                    from_path: file_path.to_string_lossy().to_string(),
                    to_path: source.join(file_name).to_string_lossy().to_string(),
                    success: false,
                    error: Some("目标路径已存在且无法生成唯一名称".to_string()),
                });
                continue;
            }
        };

        match std::fs::rename(file_path, &final_dest) {
            Ok(_) => {
                result.restored += 1;
                result.details.push(UndoDetail {
                    file_name: file_name.to_string_lossy().to_string(),
                    from_path: file_path.to_string_lossy().to_string(),
                    to_path: final_dest.to_string_lossy().to_string(),
                    success: true,
                    error: None,
                });
                if let Some(parent) = file_path.parent() {
                    dirs_touched.insert(parent.to_path_buf());
                }
            }
            Err(e) => {
                result.failed += 1;
                result.details.push(UndoDetail {
                    file_name: file_name.to_string_lossy().to_string(),
                    from_path: file_path.to_string_lossy().to_string(),
                    to_path: final_dest.to_string_lossy().to_string(),
                    success: false,
                    error: Some(format!("移动失败: {}", e)),
                });
            }
        }
    }

    // 删除空的子文件夹
    for dir in &dirs_touched {
        if dir.starts_with(&source) && *dir != source {
            let _ = std::fs::remove_dir(dir);
        }
    }

    // 如果还原全部成功，也清除 undo 记录（因为文件都回去了）
    if result.failed == 0 && result.restored > 0 {
        let _ = std::fs::remove_file(&last_organize_path());
    }

    log::info!(
        "[Organizer] restore_all 完成: restored={} failed={}",
        result.restored,
        result.failed
    );

    // 刷新桌面
    if result.restored > 0 {
        refresh_desktop(&source);
    }

    Ok(result)
}

// ==================== 快速扫描统计 ====================

/// 快速扫描返回每个分类的文件数量（不过滤、不生成详情），供前端实时展示
#[tauri::command]
pub fn quick_scan(req: OrganizeRequest) -> Result<Vec<CategoryCount>, String> {
    let source = match &req.source_dir {
        Some(dir) if !dir.trim().is_empty() => PathBuf::from(dir),
        _ => desktop_dir(),
    };

    if !source.exists() || !source.is_dir() {
        return Err(format!("目录不存在: {}", source.display()));
    }

    let mut rules = req.custom_rules.clone().unwrap_or_default();
    if req.include_builtin {
        rules.extend(builtin_rules());
    }

    let other_folder = req.other_folder.clone().unwrap_or_else(|| "其他".to_string());
    let mut counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();

    let entries = match std::fs::read_dir(&source) {
        Ok(e) => e,
        Err(e) => return Err(format!("读取目录失败: {}", e)),
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();

        let category_names: std::collections::HashSet<String> = rules
            .iter()
            .map(|r| r.category.clone())
            .chain(std::iter::once(other_folder.clone()))
            .collect();

        if path.is_dir() {
            let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if category_names.contains(dir_name) || dir_name.starts_with('.') { continue; }
            if !req.include_folders { continue; }
        }

        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if file_name.starts_with('.') { continue; }

        let ext = path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).unwrap_or_default();

        if !ext.is_empty() && req.exclude_extensions.iter().any(|e| e.eq_ignore_ascii_case(&ext)) {
            continue;
        }
        if req.exclude_patterns.iter().any(|p| glob_match(p, file_name)) {
            continue;
        }

        let category = find_category(&rules, file_name, &ext, path.is_dir()).unwrap_or_else(|| other_folder.clone());
        *counts.entry(category).or_insert(0) += 1;
    }

    let mut result: Vec<CategoryCount> = counts
        .into_iter()
        .map(|(category, count)| CategoryCount { category, count })
        .collect();

    result.sort_by(|a, b| b.count.cmp(&a.count));

    Ok(result)
}

/// 快速扫描结果条目
#[derive(Debug, Clone, Serialize)]
pub struct CategoryCount {
    pub category: String,
    pub count: u32,
}
