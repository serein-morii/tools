import { call } from "./index";

export interface SonarAuth {
  csrf_token: string;
  project: string;
  workspace: string;
  x_auth_token: string;
}

export interface SonarReport {
  id: string;
  createTime?: string;
  commitId?: string;
  reportType?: string;
  projectKey?: string;
  branch?: string;
}

export interface SonarFile {
  key: string;
  path: string;
  name?: string;
  language?: string;
  // 代码行模式字段
  coverage?: number;
  coveredLines?: number;
  totalLines?: number;
  uncoveredLines?: number;
  newCoveredLines?: number;
  newLineCoverageFormatted?: string;
  fullyCovered?: boolean;
  // 条件模式字段
  coverageConditions?: number;
  totalConditions?: number;
  uncoveredConditions?: number;
}

export interface MergedRange {
  start: number;
  end: number;
}

export interface FileCoverage {
  path: string;
  ranges: MergedRange[];
}

export const sonarApi = {
  getReports: (
    url: string,
    auth: SonarAuth,
    deptId: string,
    createTimeEnd: string,
    projectKeyNotLike: string,
    branch: string,
    page: number,
    limit: number,
  ): Promise<SonarReport[]> =>
    call("sonar_get_reports", {
      url, auth, deptId, createTimeEnd, projectKeyNotLike, branch, page, limit,
    }),

  getFiles: (
    url: string,
    auth: SonarAuth,
    projectKey: string,
    branch: string,
    reportId: string,
    selectPageType?: string,
  ): Promise<SonarFile[]> =>
    call("sonar_get_files", { url, auth, projectKey, branch, reportId, selectPageType }),

  getFileCoverage: (
    url: string,
    auth: SonarAuth,
    projectKey: string,
    branch: string,
    fileKey: string,
    filePath: string,
    author: string,
    selectPageType?: string,
  ): Promise<FileCoverage> =>
    call("sonar_get_file_coverage", {
      url, auth, projectKey, branch, fileKey, filePath, author, selectPageType,
    }),

  generatePrompt: (files: FileCoverage[], template: string): Promise<string> =>
    call("sonar_generate_prompt", { files, template }),
};
