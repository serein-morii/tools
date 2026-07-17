import { call } from "./index";

export interface RepoInfo {
  is_repo: boolean;
  current_branch: string | null;
  clean: boolean;
  remote: string | null;
}

export interface BranchInfo {
  name: string;
  current: boolean;
  upstream: string | null;
}

export interface TestGenRequest {
  dir: string;
  base_branch: string;
  branch_mode: "new" | "direct";
  new_branch_name?: string;
  commit_message: string;
  prompt: string;
  push_confirm_skip: boolean;
  mvn_local_repo?: string;
  mvn_settings_xml?: string;
  claude_command?: string;
  commit_only_if_pass: boolean;
  mvn_extra_args?: string;
  retry: boolean;
  mvn_failure_excerpt?: string;
  continue_session?: boolean;
}

export interface TestGenResult {
  branch: string;
  commit_sha: string | null;
  files_changed: number;
  test_passed: boolean;
  test_output_excerpt: string;
  pushed: boolean;
  push_output: string | null;
  error: string | null;
  ai_question?: string | null;
}

export interface ProjectEntry {
  path: string;
  name: string;
  has_git: boolean;
  has_mvn: boolean;
  has_gradle: boolean;
}

export interface TestgenRun {
  id: string;
  dir: string | null;
  project_name: string | null;
  branch: string | null;
  branch_mode: string | null;
  commit_sha: string | null;
  files_changed: number;
  test_passed: boolean;
  pushed: boolean;
  status: string | null;
  error: string | null;
  prompt_summary: string | null;
  started_at: number;
  finished_at: number | null;
}

export const validateGitRepo = (dir: string) => call<RepoInfo>("validate_git_repo", { dir });
export const listGitBranches = (dir: string) => call<BranchInfo[]>("list_git_branches", { dir });
export const runTestGen = (req: TestGenRequest) => call<TestGenResult>("run_test_gen", { req });
export const pushBranch = (dir: string, branch: string) => call<string>("push_branch", { dir, branch });
export const scanProjects = (root: string) => call<ProjectEntry[]>("scan_projects", { root });
export const getTestgenRuns = (limit?: number) => call<TestgenRun[]>("get_testgen_runs", { limit: limit ?? 50 });
export const cancelTestGen = () => call<void>("cancel_test_gen");
