import { call } from "./index";
import type { GitLabConfig, GitLabScanResult, GitLabScanHistory } from "@/types";

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
};
