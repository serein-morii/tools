import { call } from "./index";

export interface AiCoverageOverall {
  ai_rate: number;
  total_lines: number;
  ai_lines: number;
  total_commits: number;
  commits_with_ai: number;
}

export interface AiCoverageDepartment {
  name: string;
  total_lines: number;
  ai_lines: number;
  total_commits: number;
  commits_with_ai: number;
  contributor_count: number;
  ai_rate: number;
  children?: AiCoverageDepartment[];
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
  commits_with_ai: number;
  ai_rate: number;
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
  ai_rate: number;
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
};