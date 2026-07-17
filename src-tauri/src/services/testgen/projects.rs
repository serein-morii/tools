use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ProjectEntry {
    pub path: String,
    pub name: String,
    pub has_git: bool,
    pub has_mvn: bool,
    pub has_gradle: bool,
}

const SKIP_DIRS: &[&str] = &[
    "node_modules", "target", "build", "dist", ".git", ".idea", ".vscode", "bin", "out",
    ".gradle", ".mvn", "coverage", ".next", ".nuxt", "vendor",
];

const MAX_RESULTS: usize = 500;

/// Recursively scan `root` (up to `max_depth` levels) for project directories
/// (containing pom.xml / build.gradle / .git). Returns deduplicated entries.
pub fn scan_projects(root: &Path, max_depth: u32) -> Vec<ProjectEntry> {
    let mut out = Vec::new();
    let mut seen: HashSet<PathBuf> = HashSet::new();
    scan_dir(root, 0, max_depth, &mut out, &mut seen);
    out
}

fn scan_dir(
    dir: &Path,
    depth: u32,
    max_depth: u32,
    out: &mut Vec<ProjectEntry>,
    seen: &mut HashSet<PathBuf>,
) {
    if out.len() >= MAX_RESULTS || depth > max_depth {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut is_project = false;
    let mut has_git = false;
    let mut has_mvn = false;
    let mut has_gradle = false;
    let mut subdirs: Vec<PathBuf> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if path.is_dir() {
            if SKIP_DIRS.contains(&name_str.as_ref()) {
                continue;
            }
            if name_str == ".git" {
                has_git = true;
                is_project = true;
                continue;
            }
            subdirs.push(path);
        } else if path.is_file() {
            match name_str.as_ref() {
                "pom.xml" => {
                    has_mvn = true;
                    is_project = true;
                }
                "build.gradle" | "build.gradle.kts" => {
                    has_gradle = true;
                    is_project = true;
                }
                _ => {}
            }
        }
    }

    if is_project {
        let canon = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
        if seen.insert(canon) {
            out.push(ProjectEntry {
                path: dir.to_string_lossy().to_string(),
                name: dir
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string(),
                has_git,
                has_mvn,
                has_gradle,
            });
        }
    }

    for sub in subdirs {
        if out.len() >= MAX_RESULTS {
            break;
        }
        scan_dir(&sub, depth + 1, max_depth, out, seen);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_finds_maven_project() {
        let root = std::env::temp_dir().join(format!("testgen-scan-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        // a maven project
        let proj = root.join("proj-a");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(proj.join("pom.xml"), "<project></project>").unwrap();
        // a non-project dir
        std::fs::create_dir_all(root.join("empty")).unwrap();
        let found = scan_projects(&root, 4);
        assert!(found.iter().any(|p| p.name == "proj-a" && p.has_mvn));
        assert!(!found.iter().any(|p| p.name == "empty"));
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn scan_respects_depth() {
        let root = std::env::temp_dir().join(format!("testgen-scan-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("a/b/c/d")).unwrap();
        std::fs::write(root.join("a/b/c/d/pom.xml"), "x").unwrap();
        let found = scan_projects(&root, 2); // depth 0=root,1=a,2=b -> c/d not reached
        assert!(!found.iter().any(|p| p.name == "d"));
        let found_deep = scan_projects(&root, 5);
        assert!(found_deep.iter().any(|p| p.name == "d"));
        std::fs::remove_dir_all(&root).ok();
    }
}
