import { call } from "./index";
import type { GitLabConfig, GitLabScanResult, GitLabScanHistory, CaptchaData, WalkinSigninResponse, AutoLoginResult, UnitBoardData, LoginStatusResult } from "@/types";

export const gitlabApi = {
  getConfig: (): Promise<GitLabConfig> => call<GitLabConfig>("get_gitlab_config"),

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

  walkinFetchUnitBoard: (url: string, auth: { csrf_token: string; project: string; workspace: string; x_auth_token: string }, deptId: string, deptName: string): Promise<UnitBoardData | null> =>
    call<UnitBoardData | null>("walkin_fetch_unit_board", { url, auth, deptId, deptName }),

  walkinCheckLogin: (url: string, auth: { csrf_token: string; project: string; workspace: string; x_auth_token: string }): Promise<LoginStatusResult> =>
    call<LoginStatusResult>("walkin_check_login", { url, auth }),
};
