use std::path::Path;
use tauri::{AppHandle, Emitter};

use crate::services::testgen::{git, runner};

#[tauri::command]
pub async fn validate_git_repo(dir: String) -> Result<git::RepoInfo, String> {
    Ok(git::validate(Path::new(&dir)).await)
}

#[tauri::command]
pub async fn list_git_branches(dir: String) -> Result<Vec<git::BranchInfo>, String> {
    git::list_branches(Path::new(&dir)).await
}

#[tauri::command]
pub async fn run_test_gen(
    app: AppHandle,
    req: runner::TestGenRequest,
) -> Result<runner::TestGenResult, String> {
    runner::run_test_gen(req, &app).await
}

#[tauri::command]
pub async fn push_branch(app: AppHandle, dir: String, branch: String) -> Result<String, String> {
    let _ = app.emit("testgen-progress", serde_json::json!({"stage":"push","message":"推送中..."}));
    git::push(Path::new(&dir), &branch).await
}
