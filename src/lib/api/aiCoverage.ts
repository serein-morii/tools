import { call } from "./index";

export interface AiCoverageOverall {
  ai_rate: number;
  total_lines: number;
  ai_lines: number;
  test_lines: number;
  test_ai_lines: number;
  non_test_lines: number;
  non_test_ai_lines: number;
  non_test_ai_rate: number;
  total_commits: number;
  commits_with_ai: number;
}

export interface AiCoverageDepartment {
  name: string;
  total_lines: number;
  ai_lines: number;
  test_lines: number;
  test_ai_lines: number;
  non_test_lines: number;
  non_test_ai_lines: number;
  non_test_ai_rate: number;
  total_commits: number;
  commits_with_ai: number;
  contributor_count: number;
  ai_rate: number;
  department_l3?: string | null;
  children?: AiCoverageDepartment[] | null;
}

export interface AiCoverageResponse {
  overall: AiCoverageOverall;
  departments: AiCoverageDepartment[];
}

export interface AiCoverageAuthor {
  author_name: string;
  author_email: string;
  total_commits: number;
  total_lines: number;
  ai_lines: number;
  test_lines: number;
  test_ai_lines: number;
  non_test_lines: number;
  non_test_ai_lines: number;
  commits_with_ai: number;
  ai_rate: number;
  non_test_ai_rate: number;
}

export interface AiCoverageCommit {
  commit_id: number;
  gitlab_id: string;
  short_sha: string;
  project_name: string;
  project_id: number;
  project_gitlab_id: number;
  title: string;
  committed_at: string;
  additions: number;
  ai_lines: number;
  test_additions: number;
  test_ai_lines: number;
  non_test_lines: number;
  non_test_ai_lines: number;
  ai_rate: number;
  non_test_ai_rate: number;
}

// Commit detail types
export interface CommitDetail {
  gitlab_id: string;
  title: string;
  author_name: string;
  author_email: string;
  branch: string;
  committed_at: string;
  web_url: string;
  additions: number;
  deletions: number;
  project_name: string;
  origin_branch: string;
}

export interface AiNote {
  ai_lines_total: number;
  frontmatter_ai_lines: number;
  ai_tools: string[];
  ai_models: string[];
  prompts_count: number;
  ai_source: string;
  git_ai_version: string;
  tool_name: string;
  model_name: string;
}

export interface CommitStats {
  total_additions: number;
  excluded_additions: number;
  effective_additions: number;
  ai_additions: number;
  human_additions: number;
  ai_rate: number;
  valid_files_count: number;
  excluded_files_count: number;
  diff_truncated: boolean;
}

export interface ExcludedFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface ValidFile {
  path: string;
  additions: number;
  deletions: number;
  ai_lines: number;
  human_lines: number;
  ai_rate: number;
}

export interface CommitCheckResponse {
  commit: CommitDetail;
  ai_note: AiNote;
  stats: CommitStats;
  excluded_files: ExcludedFile[];
  valid_files: ValidFile[];
}

export const aiCoverageApi = {
  getCoverage: (startDate: string, endDate: string): Promise<AiCoverageResponse> =>
    call<AiCoverageResponse>("get_ai_coverage", { startDate, endDate }),

  getCoverageAuthors: (
    department: string,
    departmentL2: string | null,
    startDate: string,
    endDate: string
  ): Promise<AiCoverageAuthor[]> =>
    call<AiCoverageAuthor[]>("get_ai_coverage_authors", {
      department,
      departmentL2,
      startDate,
      endDate,
    }),

  getCoverageCommits: (
    department: string,
    departmentL2: string | null,
    authorEmail: string,
    startDate: string,
    endDate: string
  ): Promise<AiCoverageCommit[]> =>
    call<AiCoverageCommit[]>("get_ai_coverage_commits", {
      department,
      departmentL2,
      authorEmail,
      startDate,
      endDate,
    }),

  getCommitDetail: (
    projectName: string,
    commitSha: string,
    gitlabProjectId: number
  ): Promise<CommitCheckResponse> =>
    call<CommitCheckResponse>("get_ai_commit_detail", {
      projectName,
      commitSha,
      gitlabProjectId,
    }),
};