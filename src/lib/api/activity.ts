import { invoke } from "@tauri-apps/api/core";

// ==================== Types ====================

export interface AiTool {
  id: string;
  name: string;
  enabled: boolean;
  watch_paths: string;
  parser_type: string;
  config: string;
  created_at: number;
  updated_at: number;
}

export interface AiSession {
  id: string;
  tool_id: string;
  project_name: string | null;
  project_path: string | null;
  title: string | null;
  message_count: number;
  duration_secs: number;
  started_at: number;
  ended_at: number | null;
  source: string;
  raw_path: string | null;
  summary: string | null;
  tags: string;
  metadata: string;
  created_at: number;
}

export interface AiActivity {
  id: string;
  session_id: string;
  activity_type: string;
  role: string | null;
  content_preview: string | null;
  tool_name: string | null;
  file_path: string | null;
  lines_added: number | null;
  lines_removed: number | null;
  timestamp: number;
  metadata: string;
}

export interface AiReport {
  id: string;
  report_type: string;
  title: string;
  range_start: number;
  range_end: number;
  content: string | null;
  stats: string;
  session_ids: string;
  summary_method: string | null;
  summary_tool: string | null;
  generated_at: number | null;
  created_at: number;
}

export interface TodayStats {
  total_sessions: number;
  total_messages: number;
  total_duration_secs: number;
  total_duration_formatted: string;
  tool_distribution: Record<string, number>;
  recent_sessions: AiSession[];
}

export interface SessionDetail {
  session: AiSession;
  activities: AiActivity[];
}

export interface DateRange {
  start: number;
  end: number;
  label: string;
}

export interface SyncResult {
  sessions_parsed: number;
  last_sync: number | null;
  errors: string[];
}

export interface CollectorStatus {
  running: boolean;
  sessions_parsed: number;
  last_sync: number | null;
  errors: string[];
  hook_status: string;
}

// ==================== Tools ====================

export async function getAiTools(): Promise<AiTool[]> {
  return invoke<AiTool[]>("get_ai_tools");
}

export async function updateAiTool(
  id: string,
  enabled: boolean,
  watchPaths: string,
  config: string,
): Promise<void> {
  return invoke<void>("update_ai_tool", { id, enabled, watchPaths, config });
}

// ==================== Sessions ====================

export async function getSessions(params: {
  toolId?: string;
  projectName?: string;
  start: number;
  end: number;
  limit: number;
  offset: number;
}): Promise<AiSession[]> {
  return invoke<AiSession[]>("get_sessions", {
    toolId: params.toolId ?? null,
    projectName: params.projectName ?? null,
    start: params.start,
    end: params.end,
    limit: params.limit,
    offset: params.offset,
  });
}

export async function getSessionDetail(id: string): Promise<SessionDetail> {
  return invoke<SessionDetail>("get_session_detail", { id });
}

export async function getTodayStats(): Promise<TodayStats> {
  return invoke<TodayStats>("get_today_stats");
}

// ==================== Sync ====================

export async function syncNow(): Promise<SyncResult> {
  return invoke<SyncResult>("sync_now");
}

export async function getCollectorStatus(): Promise<CollectorStatus> {
  return invoke<CollectorStatus>("get_collector_status");
}

export async function resetActivityData(): Promise<SyncResult> {
  return invoke<SyncResult>("reset_activity_data");
}

// ==================== Hooks ====================

export async function setupHooks(): Promise<{
  path: string;
  events: string[];
  backup: string;
}> {
  return invoke("setup_hooks");
}

export async function removeHooks(): Promise<{ removed: number; path: string }> {
  return invoke("remove_hooks");
}

// ==================== Reports ====================

export async function generateReport(params: {
  reportType: string;
  rangeStart: number;
  rangeEnd: number;
  summaryMethod: string;
  summaryTool?: string;
  apiKey?: string;
  model?: string;
  templateId?: string;
}): Promise<{ report: AiReport; stats: Record<string, unknown>; prompt: string }> {
  return invoke("generate_report", {
    reportType: params.reportType,
    rangeStart: params.rangeStart,
    rangeEnd: params.rangeEnd,
    summaryMethod: params.summaryMethod,
    summaryTool: params.summaryTool ?? null,
    apiKey: params.apiKey ?? null,
    model: params.model ?? null,
    templateId: params.templateId ?? null,
  });
}

export async function getReports(reportType?: string, limit?: number): Promise<AiReport[]> {
  return invoke<AiReport[]>("get_reports", { reportType: reportType ?? null, limit: limit ?? 50 });
}

export async function deleteReport(id: string): Promise<void> {
  return invoke<void>("delete_report", { id });
}

// ==================== Report Templates ====================

export interface AiReportTemplate {
  id: string;
  name: string;
  body: string;
  is_default: boolean;
  created_at: number;
  updated_at: number;
}

export async function getReportTemplates(): Promise<AiReportTemplate[]> {
  return invoke<AiReportTemplate[]>("get_report_templates");
}

export async function saveReportTemplate(params: {
  id?: string;
  name: string;
  body: string;
  isDefault?: boolean;
}): Promise<AiReportTemplate> {
  return invoke<AiReportTemplate>("save_report_template", {
    id: params.id ?? null,
    name: params.name,
    body: params.body,
    isDefault: params.isDefault ?? false,
  });
}

export async function deleteReportTemplate(id: string): Promise<void> {
  return invoke<void>("delete_report_template", { id });
}

export async function setDefaultReportTemplate(id: string): Promise<void> {
  return invoke<void>("set_default_report_template", { id });
}

// ==================== Report Rendering / Export ====================

/** Render a Markdown report into a standalone, styled HTML document. */
export async function renderReportHtml(content: string, title: string): Promise<string> {
  return invoke<string>("render_report_html", { content, title });
}

/** Write text content to a user-chosen file path (generic helper). */
export async function writeTextFile(path: string, content: string): Promise<void> {
  return invoke<void>("write_text_file", { path, content });
}

// ==================== Date Helpers ====================

export async function getTodayRange(): Promise<DateRange> {
  return invoke<DateRange>("get_today_range");
}

export async function getDateRange(rangeType: string, offset?: number): Promise<DateRange> {
  return invoke<DateRange>("get_date_range", { rangeType, offset: offset ?? 0 });
}

// ==================== Messages ====================

export interface ClaudeMessage {
  role: string;
  content: string;
  ts: number | null;
}

export async function loadSessionMessages(rawPath: string): Promise<ClaudeMessage[]> {
  return invoke<ClaudeMessage[]>("load_session_messages", { rawPath });
}

// ==================== Formatters ====================

export function formatDuration(secs: number): string {
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatFullTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const TOOL_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "CodeX",
  "gemini-cli": "Gemini CLI",
  "qwen-cli": "Qwen CLI",
};

export function getToolLabel(toolId: string): string {
  return TOOL_LABELS[toolId] || toolId;
}

export const TOOL_COLORS: Record<string, string> = {
  "claude-code": "#D97706",
  codex: "#2563EB",
  "gemini-cli": "#059669",
  "qwen-cli": "#7C3AED",
};

export function getToolColor(toolId: string): string {
  return TOOL_COLORS[toolId] || "#6B7280";
}
