use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::database::dao::activity::{ActivityDao, TestgenRun};
use crate::database::Database;
use crate::services::testgen::{git, projects, runner};

#[tauri::command]
pub async fn validate_git_repo(dir: String) -> Result<git::RepoInfo, String> {
    Ok(git::validate(Path::new(&dir)).await)
}

#[tauri::command]
pub async fn list_git_branches(dir: String) -> Result<Vec<git::BranchInfo>, String> {
    git::list_branches(Path::new(&dir)).await
}

#[tauri::command]
pub async fn scan_projects(root: String) -> Result<Vec<projects::ProjectEntry>, String> {
    Ok(projects::scan_projects(Path::new(&root), 4))
}

#[tauri::command]
pub async fn get_testgen_runs(
    db: State<'_, Arc<Database>>,
    limit: Option<i64>,
) -> Result<Vec<TestgenRun>, String> {
    let conn = db.conn().lock().unwrap();
    ActivityDao::get_testgen_runs(&conn, limit.unwrap_or(50)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_test_gen(cancel_flag: State<'_, Arc<AtomicBool>>) -> Result<(), String> {
    cancel_flag.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn run_test_gen(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    cancel_flag: State<'_, Arc<AtomicBool>>,
    req: runner::TestGenRequest,
) -> Result<runner::TestGenResult, String> {
    // Reset cancel flag for this run.
    cancel_flag.store(false, Ordering::SeqCst);

    let run_id = uuid::Uuid::new_v4().to_string();
    let started_at = chrono::Utc::now().timestamp_millis();
    let project_name = Path::new(&req.dir)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string());

    // Insert a "running" record up front so it exists even if the app crashes.
    {
        let conn = db.conn().lock().unwrap();
        let run = TestgenRun {
            id: run_id.clone(),
            dir: Some(req.dir.clone()),
            project_name: project_name.clone(),
            branch: Some(req.base_branch.clone()),
            branch_mode: Some(req.branch_mode.clone()),
            commit_sha: None,
            files_changed: 0,
            test_passed: false,
            pushed: false,
            status: Some("running".into()),
            error: None,
            prompt_summary: Some(req.prompt.chars().take(200).collect()),
            started_at,
            finished_at: None,
        };
        let _ = ActivityDao::insert_testgen_run(&conn, &run);
    }

    let result = runner::run_test_gen(req, &app, cancel_flag.inner()).await;
    let finished_at = chrono::Utc::now().timestamp_millis();

    // Update the record with the final result.
    {
        let conn = db.conn().lock().unwrap();
        let (commit_sha, files, test_passed, pushed, status, error) = match &result {
            Ok(res) => (
                res.commit_sha.clone(),
                res.files_changed as i32,
                res.test_passed,
                res.pushed,
                if res.error.is_some() { "error" } else { "done" },
                res.error.clone(),
            ),
            Err(e) => (
                None,
                0,
                false,
                false,
                if e == "已取消" { "cancelled" } else { "error" },
                Some(e.clone()),
            ),
        };
        let run = TestgenRun {
            id: run_id.clone(),
            dir: None,
            project_name: None,
            branch: None,
            branch_mode: None,
            commit_sha,
            files_changed: files,
            test_passed,
            pushed,
            status: Some(status.into()),
            error,
            prompt_summary: None,
            started_at,
            finished_at: Some(finished_at),
        };
        let _ = ActivityDao::finish_testgen_run(&conn, &run);
    }

    result
}

#[tauri::command]
pub async fn push_branch(app: AppHandle, dir: String, branch: String) -> Result<String, String> {
    let _ = app.emit(
        "testgen-progress",
        serde_json::json!({"stage":"push","message":"推送中..."}),
    );
    git::push(Path::new(&dir), &branch).await
}
