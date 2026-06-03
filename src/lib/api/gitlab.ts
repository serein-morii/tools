import { call } from "./index";
import type { GitLabConfig, GitLabScanResult, GitLabScanHistory, CaptchaData, WalkinSigninResponse, AutoLoginResult, UnitBoardData, UnitListItem, LoginStatusResult, WorkspaceItem } from "@/types";

export interface GitLabProjectInfo {
  id: number;
  path_with_namespace: string;
  name: string;
  web_url: string;
}

export const gitlabApi = {
  getConfig: (): Promise<GitLabConfig> => call<GitLabConfig>("get_gitlab_config"),

  getProjects: (): Promise<GitLabProjectInfo[]> => call<GitLabProjectInfo[]>("gitlab_get_projects"),

  getBranches: (projectId: number): Promise<string[]> => call<string[]>("gitlab_get_branches", { projectId }),

  saveConfig: (config: GitLabConfig): Promise<void> =>
    call<void>("save_gitlab_config", { config }),

  testConnection: (config: GitLabConfig): Promise<boolean> =>
    call<boolean>("test_gitlab_connection", { config }),

  triggerScan: (scanType: string): Promise<GitLabScanResult> =>
    call<GitLabScanResult>("trigger_gitlab_scan", { scanType }),

  getScanHistory: (limit?: number): Promise<GitLabScanHistory[]> =>
    call<GitLabScanHistory[]>("get_gitlab_scan_history", { limit }),

  getScanDetail: (id: string): Promise<GitLabScanHistory> =>
    call<GitLabScanHistory>("get_gitlab_scan_detail", { id }),

  deleteScanHistory: (id: string): Promise<void> =>
    call<void>("delete_gitlab_scan_history", { id }),

  isConfigured: (): Promise<boolean> =>
    call<boolean>("get_gitlab_configured"),

  walkinAutoLogin: (url: string, username: string, password: string): Promise<AutoLoginResult> =>
    call<AutoLoginResult>("walkin_auto_login", { url, username, password }),

  walkinGetCaptcha: (url: string): Promise<CaptchaData> =>
    call<CaptchaData>("walkin_get_captcha", { url }),

  walkinLdapLogin: (url: string, username: string, password: string, captcha: string, captchaUuid: string): Promise<WalkinSigninResponse> =>
    call<WalkinSigninResponse>("walkin_ldap_login", { url, username, password, captcha, captchaUuid }),

  walkinFetchUnitBoard: (url: string, auth: { csrf_token: string; project: string; workspace: string; x_auth_token: string }, deptId: string, deptName: string, startDate?: string, endDate?: string): Promise<UnitBoardData | null> =>
    call<UnitBoardData | null>("walkin_fetch_unit_board", { url, auth, deptId, deptName, startDate, endDate }),

  walkinFetchUnitList: (url: string, auth: { csrf_token: string; project: string; workspace: string; x_auth_token: string }, deptName: string, createdAtStart: string, createdAtEnd: string, pageNum?: number, pageSize?: number): Promise<UnitListItem[]> =>
    call<UnitListItem[]>("walkin_fetch_unit_list", { url, auth, deptName, createdAtStart, createdAtEnd, pageNum, pageSize }),

  walkinCheckLogin: (url: string, auth: { csrf_token: string; project: string; workspace: string; x_auth_token: string }): Promise<LoginStatusResult> =>
    call<LoginStatusResult>("walkin_check_login", { url, auth }),

  walkinFetchWorkspaces: (url: string, auth: { csrf_token: string; project: string; workspace: string; x_auth_token: string }): Promise<WorkspaceItem[]> =>
    call<WorkspaceItem[]>("walkin_fetch_workspaces", { url, auth }),
};
