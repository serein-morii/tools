import type { GitLabConfig, TokenProfile, LdapProfile } from "@/types";

// Default token profiles (凭据清空，构建时不带默认账号)
export const defaultTokenProfiles: TokenProfile[] = [];

// Default LDAP profiles (凭据清空，构建时不带默认账号)
export const defaultLdapProfiles: LdapProfile[] = [];

// Default selected token IDs (multi-select)
export const defaultSelectedTokenIds: string[] = [];

export const defaultGitLabConfig: GitLabConfig = {
  url: "http://code.jms.com",
  auth_type: "token",
  token: "", // Private Token 空着让用户填
  username: "",
  password: "",
  token_profiles: defaultTokenProfiles,
  ldap_profiles: defaultLdapProfiles,
  filter_mode: "include",
  filter_projects: ["basicdata", "lmdm", "network", "notice", "message", "scm"],
  test_keywords: ["单测", "测试", "用例", "test", "spec"],
  scan_schedule: "0 9 * * 1",
  scan_enabled: true,
  scan_channels: [],
  scan_range_type: "week",
  scan_range_days: 7,
  walkin_enabled: true,
  walkin_url: "http://walkin.jms.com",
  walkin_username: "", // 用户名空着让用户填
  walkin_password: "", // 密码空着让用户填
  walkin_dept_name: "",
  walkin_dept_id: "",
  walkin_workspace_name: "",
  walkin_workspace_id: "",
  walkin_csrf_token: "",
  walkin_project_header: "",
  walkin_x_auth_token: "",
  walkin_project_mappings: [],
  select_page_type: "代码行",
};
