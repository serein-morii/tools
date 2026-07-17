use std::path::Path;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::process::Command;

use super::{cli, git};

#[derive(Debug, Deserialize)]
pub struct TestGenRequest {
    pub dir: String,
    pub base_branch: String,
    pub branch_mode: String, // "new" | "direct"
    pub new_branch_name: Option<String>,
    pub commit_message: String,
    pub prompt: String,
    pub push_confirm_skip: bool,
    pub mvn_local_repo: Option<String>,
    pub mvn_settings_xml: Option<String>,
    pub claude_command: Option<String>,
    pub commit_only_if_pass: bool,
    pub mvn_extra_args: Option<String>,
    pub retry: bool,
    pub mvn_failure_excerpt: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TestGenResult {
    pub branch: String,
    pub commit_sha: Option<String>,
    pub files_changed: usize,
    pub test_passed: bool,
    pub test_output_excerpt: String,
    pub pushed: bool,
    pub push_output: Option<String>,
    pub error: Option<String>,
}

pub fn slugify(s: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for c in s.to_lowercase().chars() {
        if c.is_alphanumeric() {
            out.push(c);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    out.trim_matches('-').chars().take(40).collect()
}

/// Run `mvn test` in `dir` with optional settings.xml (-s), local repo, and extra args.
/// Ok(stdout) on success, Err(tail-of-output) on failure.
pub async fn run_mvn_test(
    dir: &Path,
    settings_xml: Option<&str>,
    local_repo: Option<&str>,
    extra_args: Option<&str>,
) -> Result<String, String> {
    let mut args: Vec<String> = vec!["test".into()];
    if let Some(s) = settings_xml {
        args.push("-s".into());
        args.push(s.into());
    }
    if let Some(r) = local_repo {
        args.push(format!("-Dmaven.repo.local={}", r));
    }
    if let Some(extra) = extra_args {
        for a in extra.split_whitespace() {
            args.push(a.into());
        }
    }
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let cmd_name = if cfg!(target_os = "windows") { "mvn.cmd" } else { "mvn" };
    let output = Command::new(cmd_name)
        .current_dir(dir)
        .args(&arg_refs)
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|e| format!("mvn exec error: {}（确认 mvn 在 PATH）", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        let tail: String = stdout.lines().rev().take(40).collect::<Vec<_>>().iter().rev().cloned().collect::<Vec<_>>().join("\n");
        Err(tail)
    }
}

pub async fn run_test_gen(
    req: TestGenRequest,
    app: &AppHandle,
    cancel_flag: &std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> Result<TestGenResult, String> {
    use std::sync::atomic::Ordering;
    let dir = Path::new(&req.dir);
    let emit = |stage: &str, msg: String| {
        let _ = app.emit("testgen-progress", serde_json::json!({"stage": stage, "message": msg}));
    };
    let cancelled = || cancel_flag.load(Ordering::SeqCst);

    // --- validate + branch (skipped on retry: already on the work branch) ---
    let branch = if req.retry {
        emit("validate", "重试模式：跳过切分支".into());
        let info = git::validate(dir).await;
        if !info.is_repo {
            return Err("不是 git 仓库".into());
        }
        let b = info.current_branch.unwrap_or_else(|| req.base_branch.clone());
        emit("validate", format!("当前分支: {}", b));
        b
    } else {
        emit("validate", "校验仓库...".into());
        let info = git::validate(dir).await;
        if !info.is_repo {
            return Err("不是 git 仓库".into());
        }
        if info.remote.is_none() {
            emit("validate", "警告：未配置 remote，push 会失败".into());
        }
        emit("validate", format!("当前分支: {}", info.current_branch.as_deref().unwrap_or("?")));
        emit("check_clean", "检查工作区...".into());
        if !info.clean {
            return Err("工作区不干净，请先 commit 或 stash".into());
        }
        if cancelled() {
            return Err("已取消".into());
        }
        if req.branch_mode == "new" {
            let mut name = req
                .new_branch_name
                .clone()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| format!("test/{}", slugify(&req.commit_message)));
            if name == "test/" {
                name = "test/unnamed".to_string();
            }
            emit("branch", format!("新建工作分支 {} 基于 {}", name, req.base_branch));
            git::create_branch(dir, &req.base_branch, &name).await?;
            name
        } else {
            emit("branch", format!("切换到 {}", req.base_branch));
            git::checkout(dir, &req.base_branch).await?;
            req.base_branch.clone()
        }
    };

    if cancelled() {
        return Err("已取消".into());
    }

    // --- AI ---
    emit("ai", "调用 AI 写单测...".into());
    let mut prompt = format!(
        "项目目录：{}\n当前分支：{}\n本地 Maven 仓库：{}\n请基于以上环境，按下方要求补写单元测试。\n---\n{}",
        req.dir,
        branch,
        req.mvn_local_repo.as_deref().unwrap_or("未配置"),
        req.prompt
    );
    if req.retry {
        prompt.push_str(&format!(
            "\n\n---\n上次 mvn test 失败，错误摘录如下，请修复测试使其通过：\n{}",
            req.mvn_failure_excerpt.as_deref().unwrap_or("（无错误摘录）")
        ));
    }
    let claude_cmd = req.claude_command.clone().unwrap_or_else(|| "claude".to_string());
    cli::run_claude_streaming(&claude_cmd, &prompt, dir, app, cancel_flag)
        .await
        .map_err(|e| {
            emit("error", format!("AI 失败: {}", e));
            e
        })?;
    if cancelled() {
        return Err("已取消".into());
    }

    // --- mvn test ---
    emit("mvn", "运行 mvn test...".into());
    let (passed, excerpt) = match run_mvn_test(
        dir,
        req.mvn_settings_xml.as_deref(),
        req.mvn_local_repo.as_deref(),
        req.mvn_extra_args.as_deref(),
    )
    .await
    {
        Ok(o) => (true, o),
        Err(e) => (false, e),
    };
    if cancelled() {
        return Err("已取消".into());
    }
    if !passed {
        if req.commit_only_if_pass {
            emit("mvn", "测试失败，未提交（仅测试通过才提交）".into());
            return Ok(TestGenResult {
                branch,
                commit_sha: None,
                files_changed: 0,
                test_passed: false,
                test_output_excerpt: excerpt,
                pushed: false,
                push_output: None,
                error: Some("mvn test 失败".into()),
            });
        } else {
            emit("mvn", "测试失败，但开关允许提交".into());
        }
    } else {
        emit("mvn", "测试通过".into());
    }

    // --- commit (with diff preview) ---
    emit("commit", "提交...".into());
    git::add_all(dir).await?;
    let files = git::changed_files(dir).await.unwrap_or(0);
    if files == 0 {
        return Ok(TestGenResult {
            branch,
            commit_sha: None,
            files_changed: 0,
            test_passed: passed,
            test_output_excerpt: excerpt,
            pushed: false,
            push_output: None,
            error: Some("AI 未产生任何改动，跳过提交".into()),
        });
    }
    let file_list = git::staged_file_list(dir).await.unwrap_or_default();
    emit("diff", format!("改动文件（{}）：\n{}", files, file_list.join("\n")));
    if cancelled() {
        return Err("已取消".into());
    }
    let sha = git::commit(dir, &req.commit_message).await?;
    emit("commit", format!("已提交 {}（{} 文件）", sha, files));

    // --- push ---
    if req.push_confirm_skip {
        emit("push", "推送中...".into());
        return match git::push(dir, &branch).await {
            Ok(o) => {
                emit("push", "已推送".into());
                Ok(TestGenResult { branch, commit_sha: Some(sha), files_changed: files, test_passed: passed, test_output_excerpt: excerpt, pushed: true, push_output: Some(o), error: None })
            }
            Err(e) => {
                let msg = format!("push 失败: {}", e);
                Ok(TestGenResult { branch, commit_sha: Some(sha), files_changed: files, test_passed: passed, test_output_excerpt: excerpt, pushed: false, push_output: Some(e), error: Some(msg) })
            }
        };
    }

    Ok(TestGenResult { branch, commit_sha: Some(sha), files_changed: files, test_passed: passed, test_output_excerpt: excerpt, pushed: false, push_output: None, error: None })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("Add User Service Tests"), "add-user-service-tests");
        assert_eq!(slugify("  fix!!bug  "), "fix-bug");
        assert_eq!(slugify("中文"), "中文");
    }

    #[test]
    fn slugify_truncates() {
        let long = "a".repeat(100);
        assert_eq!(slugify(&long).len(), 40);
    }
}
