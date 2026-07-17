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
}

export const validateGitRepo = (dir: string) => call<RepoInfo>("validate_git_repo", { dir });
export const listGitBranches = (dir: string) => call<BranchInfo[]>("list_git_branches", { dir });
export const runTestGen = (req: TestGenRequest) => call<TestGenResult>("run_test_gen", { req });
export const pushBranch = (dir: string, branch: string) => call<string>("push_branch", { dir, branch });
