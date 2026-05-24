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