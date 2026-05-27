export interface CronConfig {
  mode: "standard" | "advanced" | "special";
  standard?: {
    frequency: "daily" | "weekly" | "monthly" | "yearly";
    time: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    month?: number;
  };
  advanced?: {
    expression: string;
  };
  special?: {
    type: "nth_weekday" | "last_day" | "offset" | "interval";
    time?: string;  // 时间设置，用于 nth_weekday 和 last_day
    nthWeekday?: {
      nth: number;
      weekday: number;  // 1=周一, 2=周二, ..., 7=周日
      month: number;    // 0=每月, 1-12=特定月份
    };
    lastDay?: {
      type: "last_nth" | "last_workday" | "last_friday" | "day" | "weekday" | "friday";  // 兼容新旧格式
      nth?: number;     // 倒数第N天
      month: number;    // 0=每月, 1-12=特定月份
    };
    offset?: {
      baseDate: "start_of_month" | "end_of_month" | "specific_date";
      offsetDays: number;
      month: number;
    };
    interval?: {
      unit: "minutes" | "hours" | "days" | "weeks";
      value: number;
      startTime: string;
    };
  };
  endCondition?: {
    type: "never" | "after_occurrences" | "until_date";
    occurrences?: number;
    untilDate?: string;
  };
  excludeDates?: string[];
}

// Task type matching Rust backend
export interface Task {
  id: string;
  name: string;
  description?: string;
  reminder_type: string;
  cron_expr: string;
  cron_config: string;
  enabled: boolean;
  status: string;
  last_run_at?: number;
  next_run_at?: number;
  template_id?: string;
  channel_ids: string;
  tags: string;
  priority: number;
  created_at: number;
  updated_at: number;
}

export interface CreateTaskRequest {
  name: string;
  description?: string;
  reminder_type?: string;
  cron_expr?: string;
  cron_config?: string;
  template_id?: string;
  channel_ids?: string[];
  tags?: string[];
  priority?: number;
}

export interface UpdateTaskRequest {
  name?: string;
  description?: string;
  reminder_type?: string;
  cron_expr?: string;
  cron_config?: string;
  enabled?: boolean;
  status?: string;
  template_id?: string;
  channel_ids?: string[];
  tags?: string[];
  priority?: number;
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: "bark" | "feishu" | "wecom" | "dingtalk";
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  type: "message" | "channel" | "preset";
  content: string;
  variables?: string[];
  channelConfig?: Partial<NotificationChannel["config"]>;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderHistory {
  id: string;
  taskId: string;
  reminderId: string;
  action: "created" | "sent" | "confirmed" | "feedback" | "failed";
  details?: string;
  createdAt: string;
}

export interface Settings {
  key: string;
  value: string;
}

export interface UpdateSettingRequest {
  key: string;
  value: string;
}

// Channel type matching Rust backend
export interface Channel {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: string;
  last_test_at?: number;
  last_test_result?: string;
  description?: string;
  created_at: number;
  updated_at: number;
}

export interface CreateChannelRequest {
  name: string;
  type: string;
  config: string;
  description?: string;
  enabled?: boolean;
}

export interface UpdateChannelRequest {
  name?: string;
  config?: string;
  description?: string;
  enabled?: boolean;
}

export interface BarkConfig {
  serverUrl?: string;
  key: string;
  sound?: string;
  group?: string;
}

export interface FeishuConfig {
  webhookUrl: string;
  secret?: string;
}

export interface WeComConfig {
  webhookUrl: string;
}

export interface DingTalkConfig {
  webhookUrl: string;
  secret?: string;
  atPhones?: string[];
}

// Reminder type matching Rust backend
export interface Reminder {
  id: string;
  task_id: string;
  scheduled_at: number;
  executed_at?: number;
  status: string;
  channel_results: string;
  error_message?: string;
  user_action?: string;
  user_feedback?: string;
  action_at?: number;
  created_at: number;
}

export interface ReminderHistoryItem {
  id: string;
  task_id: string;
  task_name: string;
  reminder_type: string;
  scheduled_at: number;
  executed_at?: number;
  status: string;
  channel_results: string;
  error_message?: string;
  user_action?: string;
  user_feedback?: string;
  action_at?: number;
  created_at: number;
}

export interface SubmitReminderFeedbackRequest {
  id: string;
  feedback: string;
}

export interface SnoozeReminderRequest {
  id: string;
  minutes: number;
}

export interface BackupCounts {
  tasks: number;
  channels: number;
  templates: number;
  settings: number;
}

export interface ExportBackupRequest {
  path?: string;
}

export interface ImportBackupRequest {
  path: string;
}

export interface BackupExportResult {
  path: string;
  counts: BackupCounts;
}

export interface BackupImportResult {
  counts: BackupCounts;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  category: string;
  title_template: string;
  body_template: string;
  default_cron?: string;
  default_channels: string;
  icon?: string;
  color?: string;
  tags: string;
  created_at: number;
  updated_at: number;
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  category?: string;
  title_template: string;
  body_template: string;
  default_cron?: string;
  default_channels?: string[];
  icon?: string;
  color?: string;
  tags?: string[];
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  category?: string;
  title_template?: string;
  body_template?: string;
  default_cron?: string;
  default_channels?: string[];
  icon?: string;
  color?: string;
  tags?: string[];
}

// Quick Note types
export interface QuickNote {
  id: string;
  content: string;
  color: string;
  pinned: boolean;
  created_at: number;
  updated_at: number;
}

export interface CreateNoteRequest {
  content: string;
  color?: string;
}

export interface UpdateNoteRequest {
  content?: string;
  color?: string;
  pinned?: boolean;
}

// GitLab types
export interface GitLabConfig {
  url: string;
  auth_type: "token" | "password";
  token?: string;
  username?: string;
  password?: string;
  filter_mode: "include" | "exclude" | "all";
  filter_projects: string[];
  test_keywords: string[];
  scan_schedule: string;
  scan_channels: string[];
  scan_range_type: "week" | "days";
  scan_range_days?: number;
  walkin_enabled: boolean;
  walkin_url: string;
  walkin_username: string;
  walkin_password: string;
  walkin_dept_name: string;
  walkin_dept_id: string;
  walkin_workspace_name: string;
  walkin_csrf_token: string;
  walkin_project_header: string;
  walkin_x_auth_token: string;
  walkin_project_mappings: ProjectMapping[];
}

export interface MrDetail {
  iid: number;
  title: string;
  source_branch: string;
  target_branch: string;
  author: string;
  web_url: string;
  pipeline_status: string | null;
  created_at: string;
}

export interface DeveloperStat {
  name: string;
  commits: number;
  lines_added: number;
  lines_removed: number;
  mrs_created: number;
  mrs_pipeline_success: number;
  mrs_pipeline_failed: number;
  projects: string[];
}

export interface GitLabScanProgress {
  current: number;
  total: number;
  project_name: string;
  commits_scanned: number;
  commits_total: number;
  phase?: "gitlab" | "walkin";
}

export interface WalkinMetrics {
  branch: string | null;
  bugs: number;
  vulnerabilities: number;
  code_smells: number;
  // 全量覆盖率
  coverage: number | null;
  line_coverage: number | null;
  branch_coverage: number | null;
  lines_to_cover: number | null;
  conditions_to_cover: number | null;
  uncovered_conditions: number | null;
  // 增量覆盖率
  new_coverage: number | null;
  new_line_coverage: number | null;
  new_condition_coverage: number | null;
  new_lines_to_cover: number | null;
  new_line_cover: number | null;
  new_un_line_cover: number | null;
  new_condition_to_cover: number | null;
  new_un_condition_to_cover: number | null;
  // 其他
  duplicated_lines_density: number | null;
  duplicated_blocks: number;
  reliability_rating: string | null;
  security_rating: string | null;
  maintainability_rating: string | null;
  new_bugs: number;
  new_vulnerabilities: number;
  new_code_smells: number;
  analysis_date: number | null;
}

export interface ProjectMapping {
  gitlab_project: string;
  walkin_project: string;
}

export interface UnitBoardData {
  ynewValue: number | null;
  yallValue: number | null;
  ynewLineValue: number | null;
  yallLineValue: number | null;
  ynewBranchValue: number | null;
  yallBranchValue: number | null;
  xvalue: string | null;
  startDateFrom: string | null;
  startDateTo: string | null;
}

export interface GitLabScanResult {
  scan_at: number;
  scan_type: string;
  total_projects: number;
  total_commits: number;
  total_lines_added: number;
  total_lines_removed: number;
  test_projects: number;
  pending_mrs: number;
  contributors: string[];
  projects: GitLabProjectResult[];
  pipeline_total: number;
  pipeline_success: number;
  pipeline_failed: number;
  developer_stats: DeveloperStat[];
  walkin_total_bugs: number;
  walkin_total_vulnerabilities: number;
  walkin_total_code_smells: number;
  walkin_avg_coverage: number | null;
  walkin_projects_matched: number;
}

export interface TestCommit {
  title: string;
  author: string;
  created_at: string;
}

export interface GitLabProjectResult {
  project_id: number;
  project_name: string;
  commits: number;
  lines_added: number;
  lines_removed: number;
  has_test: boolean;
  test_commits: TestCommit[];
  pending_mrs: number;
  mr_details: MrDetail[];
  contributors: string[];
  last_commit_at: string;
  latest_pipeline_status: string | null;
  walkin_metrics: WalkinMetrics | null;
  walkin_metrics_by_branch: Record<string, WalkinMetrics> | null;
}

export interface CaptchaData {
  uuid: string;
  image_base64: string;
}

export interface AutoLoginResult {
  success: boolean;
  csrf_token?: string;
  project?: string;
  workspace?: string;
  x_auth_token?: string;
  needs_manual_captcha: boolean;
  captcha_image?: string;
  captcha_uuid?: string;
  message?: string;
}

export interface WalkinSigninResponse {
  success: boolean;
  message?: string;
  data?: {
    csrfToken?: string;
    sessionId?: string;
    lastWorkspaceId?: string;
    lastProjectId?: string;
    id?: string;
    name?: string;
  };
}

export interface LoginStatusResult {
  logged_in: boolean;
  user_name?: string;
  message?: string;
}

export interface GitLabScanHistory {
  id: string;
  scan_type: string;
  scan_at: number;
  scan_range_start?: string;
  scan_range_end?: string;
  total_projects: number;
  total_commits: number;
  total_lines_added: number;
  total_lines_removed: number;
  test_projects: number;
  pending_mrs: number;
  contributors: string;
  summary: string;
  created_at: number;
  pipeline_total: number;
  pipeline_success: number;
  pipeline_failed: number;
  developer_stats: string;
}