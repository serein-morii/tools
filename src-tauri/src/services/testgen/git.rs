use std::path::Path;
use tokio::process::Command;

#[derive(Debug, Clone, serde::Serialize)]
pub struct RepoInfo {
    pub is_repo: bool,
    pub current_branch: Option<String>,
    pub clean: bool,
    pub remote: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BranchInfo {
    pub name: String,
    pub current: bool,
    pub upstream: Option<String>,
}

/// Run a git command in `dir`, return stdout on success, stderr on failure.
pub async fn git(dir: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("git {:?} exec error: {}", args, e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub async fn validate(dir: &Path) -> RepoInfo {
    let is_repo = git(dir, &["rev-parse", "--is-inside-work-tree"])
        .await
        .is_ok();
    if !is_repo {
        return RepoInfo {
            is_repo: false,
            current_branch: None,
            clean: false,
            remote: None,
        };
    }
    let current_branch = git(dir, &["rev-parse", "--abbrev-ref", "HEAD"])
        .await
        .ok()
        .map(|s| s.trim().to_string());
    let clean = git(dir, &["status", "--porcelain"])
        .await
        .map(|s| s.trim().is_empty())
        .unwrap_or(false);
    let remote = git(dir, &["remote"])
        .await
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    RepoInfo {
        is_repo,
        current_branch,
        clean,
        remote,
    }
}

pub async fn list_branches(dir: &Path) -> Result<Vec<BranchInfo>, String> {
    let out = git(
        dir,
        &[
            "for-each-ref",
            "--format=%(refname:short)%09%(upstream:short)%09%(HEAD)",
            "refs/heads",
        ],
    )
    .await?;
    let mut branches = Vec::new();
    for line in out.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.is_empty() || parts[0].is_empty() {
            continue;
        }
        branches.push(BranchInfo {
            name: parts[0].to_string(),
            current: parts.get(2).map(|s| s.trim() == "*").unwrap_or(false),
            upstream: parts
                .get(1)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
        });
    }
    Ok(branches)
}

pub async fn checkout(dir: &Path, branch: &str) -> Result<(), String> {
    git(dir, &["checkout", branch]).await.map(|_| ())
}

pub async fn create_branch(dir: &Path, base: &str, new_name: &str) -> Result<(), String> {
    git(dir, &["checkout", "-b", new_name, base]).await.map(|_| ())
}

pub async fn add_all(dir: &Path) -> Result<(), String> {
    git(dir, &["add", "-A"]).await.map(|_| ())
}

pub async fn commit(dir: &Path, msg: &str) -> Result<String, String> {
    git(dir, &["commit", "-m", msg]).await?;
    let sha = git(dir, &["rev-parse", "--short", "HEAD"]).await?;
    Ok(sha.trim().to_string())
}

pub async fn changed_files(dir: &Path) -> Result<usize, String> {
    let out = git(dir, &["diff", "--cached", "--name-only"]).await?;
    Ok(out.lines().filter(|l| !l.is_empty()).count())
}

pub async fn staged_file_list(dir: &Path) -> Result<Vec<String>, String> {
    let out = git(dir, &["diff", "--cached", "--name-only"]).await?;
    Ok(out.lines().filter(|l| !l.is_empty()).map(|s| s.to_string()).collect())
}

pub async fn push(dir: &Path, branch: &str) -> Result<String, String> {
    match git(dir, &["push"]).await {
        Ok(o) => Ok(o),
        Err(_) => git(dir, &["push", "-u", "origin", branch]).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn init_repo(dir: &Path) {
        let _ = git(dir, &["init", "-b", "main"]).await;
        let _ = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(["config", "user.email", "t@t"])
            .output()
            .await;
        let _ = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(["config", "user.name", "t"])
            .output()
            .await;
        std::fs::write(dir.join("a.txt"), "a").unwrap();
        let _ = git(dir, &["add", "-A"]).await;
        let _ = git(dir, &["commit", "-m", "init"]).await;
    }

    fn temp_dir() -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("testgen-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[tokio::test]
    async fn validate_detects_repo_and_clean() {
        let d = temp_dir();
        init_repo(&d).await;
        let info = validate(&d).await;
        assert!(info.is_repo);
        assert!(info.clean);
        assert!(
            matches!(
                info.current_branch.as_deref(),
                Some("main") | Some("master")
            ),
            "current_branch = {:?}",
            info.current_branch
        );
        std::fs::remove_dir_all(&d).ok();
    }

    #[tokio::test]
    async fn validate_non_repo() {
        let d = temp_dir();
        let info = validate(&d).await;
        assert!(!info.is_repo);
        std::fs::remove_dir_all(&d).ok();
    }

    #[tokio::test]
    async fn list_branches_includes_current() {
        let d = temp_dir();
        init_repo(&d).await;
        let _ = git(&d, &["branch", "feat-x"]).await;
        let bs = list_branches(&d).await.unwrap();
        assert!(bs.iter().any(|b| b.name == "feat-x"));
        assert_eq!(bs.iter().filter(|b| b.current).count(), 1);
        std::fs::remove_dir_all(&d).ok();
    }

    #[tokio::test]
    async fn create_branch_and_commit() {
        let d = temp_dir();
        init_repo(&d).await;
        create_branch(&d, "HEAD", "test/abc").await.unwrap();
        let cur = git(&d, &["rev-parse", "--abbrev-ref", "HEAD"]).await.unwrap();
        assert_eq!(cur.trim(), "test/abc");
        std::fs::write(d.join("b.txt"), "b").unwrap();
        add_all(&d).await.unwrap();
        assert_eq!(changed_files(&d).await.unwrap(), 1);
        let sha = commit(&d, "add b").await.unwrap();
        assert!(!sha.is_empty());
        std::fs::remove_dir_all(&d).ok();
    }
}
