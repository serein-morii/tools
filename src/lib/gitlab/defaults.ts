import type { GitLabConfig, TokenProfile, LdapProfile } from "@/types";

// Default token profiles
export const defaultTokenProfiles: TokenProfile[] = [
  { id: "token-1", token: "yTeXMdEjKoKqvG8ay8VQ", label: "孙强" },
  { id: "token-2", token: "Kf8mydzuhw2xDwmhsmM4", label: "海兵" },
];

// Default LDAP profiles
export const defaultLdapProfiles: LdapProfile[] = [
  {
    id: "ldap-1",
    username: "RZIK2v1KpNwUBXbpUq6Y/q//pPyfduF0wI66SBF1t3eHTTRekeAvJki8Yhs0C66rtQINbJ8K7a77VYFe7WiBqQ6QOesNt2rN+xb3SWI7/0/KdcI1JJ4wjgiULKxjCVO99TBV0lW9pPzT9wPOb5/AmK5aiZthNxGrBRmzsyGIcMk=",
    password: "X7ONsfMYenLAdZua6Fj+9l1ZdptEPNHM1l+nMZ8RL+X9vUZyfsxyf+/0zLYCeQhsnAyf3D863PGBqcgXBMBrUI/MRH/VLo44rmrGHZ5WL9kQNSk492t5CqSkeBcU8JeLTF4exYxsYLq4JLDlnYQMZfBC02U+3lwmaaICKxXk4ag=",
    label: "承辉"
  },
];

// Default selected token IDs (multi-select)
export const defaultSelectedTokenIds: string[] = ["token-1", "token-2"];

export const defaultGitLabConfig: GitLabConfig = {
  url: "http://code.jms.com",
  auth_type: "token",
  selected_token_id: "token-1",
  selected_token_ids: defaultSelectedTokenIds,
  token_profiles: defaultTokenProfiles,
  ldap_profiles: defaultLdapProfiles,
  filter_mode: "include",
  filter_projects: ["basicdata", "lmdm", "network", "notice", "message", "scm"],
  test_keywords: ["单测", "测试", "用例", "test", "spec"],
  scan_schedule: "0 9 * * 1",
  scan_channels: [],
  scan_range_type: "week",
  scan_range_days: 7,
  walkin_enabled: true,
  walkin_url: "http://walkin.jms.com",
  walkin_username: "",
  walkin_password: "",
  walkin_dept_name: "产品架构",
  walkin_dept_id: "a0a768d7-9e8d-448c-9b79-926d84f51ea1",
  walkin_workspace_name: "产品架构&PMO",
  walkin_csrf_token: "",
  walkin_project_header: "",
  walkin_x_auth_token: "",
  walkin_project_mappings: [],
};
