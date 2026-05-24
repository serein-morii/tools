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
    nthWeekday?: {
      nth: number;
      weekday: number;
      month: number;
    };
    lastDay?: {
      type: "day" | "weekday" | "friday";
      month: number;
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
  id: string;
  key: string;
  value: string;
  updatedAt: string;
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