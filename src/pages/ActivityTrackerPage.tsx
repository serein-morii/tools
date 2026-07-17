import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { Activity, History, FileText, Settings, RefreshCw, Zap, Download, FileCode, Minus, X, LayoutTemplate } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { useSettings, useUpdateSetting, getSettingValue } from "../lib/query/settingsQueries";
import {
  getTodayStats,
  getTodayRange,
  getSessions,
  getSessionDetail,
  getReports,
  getAiTools,
  updateAiTool,
  syncNow,
  getCollectorStatus,
  generateReport,
  deleteReport,
  getReportTemplates,
  saveReportTemplate,
  deleteReportTemplate,
  setDefaultReportTemplate,
  getDateRange,
  loadSessionMessages,
  setupHooks,
  removeHooks,
  resetActivityData,
  renderReportHtml,
  listReportThemes,
  writeTextFile,
  formatDuration,
  formatTimestamp,
  formatFullTimestamp,
  getToolLabel,
  getToolColor,
  type TodayStats,
  type AiSession,
  type AiActivity,
  type AiReport,
  type AiReportTemplate,
  type AiTool,
  type DateRange,
  type CollectorStatus,
  type SessionDetail,
  type ClaudeMessage,
} from "../lib/api/activity";

// ==================== Main Page ====================

export default function ActivityTrackerPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { data: settings } = useSettings();

  const tabs = [
    { id: "dashboard", label: "概览", icon: Activity },
    { id: "sessions", label: "会话", icon: History },
    { id: "reports", label: "报告", icon: FileText },
    { id: "templates", label: "模板", icon: LayoutTemplate },
    { id: "settings", label: "设置", icon: Settings },
  ];

  // ----- Report generation state (page-level so it survives tab switches) -----
  const [genOpen, setGenOpen] = useState(false);
  const [genMinimized, setGenMinimized] = useState(false);
  const [genLogs, setGenLogs] = useState<GenLog[]>([]);
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genThinking, setGenThinking] = useState<number | null>(null);
  const [genText, setGenText] = useState("");
  const [reportsNonce, setReportsNonce] = useState(0);

  const appendLog = useCallback((stage: string, text: string) => {
    setGenLogs((prev) => [...prev, { time: Date.now(), stage, text }]);
  }, []);

  const startGeneration = useCallback(
    async (
      reportType: "daily" | "weekly" | "monthly",
      range: { start: number; end: number },
      templateId?: string
    ) => {
      setGenLogs([]);
      setGenThinking(null);
      setGenText("");
      setGenStatus("generating");
      setGenOpen(true);
      setGenMinimized(false);

      const unlistenProgress = await listen<{ stage: string; message: string }>(
        "report-gen-progress",
        (e) => appendLog(e.payload.stage, e.payload.message)
      );
      const unlistenStream = await listen<{ kind: string; text?: string; tokens?: number }>(
        "report-gen-stream",
        (e) => {
          const p = e.payload;
          if (p.kind === "thinking") setGenThinking(p.tokens ?? 0);
          else if (p.kind === "text") setGenText(p.text ?? "");
        }
      );

      try {
        const method = getSettingValue?.(settings as any, "ai_summary_method", "cli") ?? "cli";
        const tool = getSettingValue?.(settings as any, "ai_summary_tool", "claude") ?? "claude";
        const provider = getSettingValue?.(settings as any, "ai_summary_provider", "anthropic") ?? "anthropic";
        const apiKey = getSettingValue?.(settings as any, "ai_summary_api_key", "") ?? "";
        const model = getSettingValue?.(settings as any, "ai_summary_model", "") || undefined;

        await generateReport({
          reportType,
          rangeStart: range.start,
          rangeEnd: range.end,
          summaryMethod: method,
          summaryTool: method === "cli" ? tool : provider,
          apiKey: apiKey || undefined,
          model,
          templateId,
        });
        setGenStatus("done");
        appendLog("done", "报告已生成并保存");
        setReportsNonce((n) => n + 1);
      } catch (e) {
        setGenStatus("error");
        appendLog("error", String(e));
      } finally {
        unlistenProgress();
        unlistenStream();
      }
    },
    [settings, appendLog]
  );

  const closeGen = useCallback(() => {
    setGenOpen(false);
    setGenMinimized(false);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h1 className="text-base font-semibold">AI 活动追踪</h1>
        </div>
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "sessions" && <SessionList />}
        {activeTab === "reports" && (
          <ReportViewer onGenerate={startGeneration} reportsNonce={reportsNonce} genStatus={genStatus} />
        )}
        {activeTab === "templates" && <TemplateManager />}
        {activeTab === "settings" && <ToolSettings />}
      </div>

      {/* Generation modal / floating chip - page-level, visible on every tab */}
      <ReportGenModal
        open={genOpen}
        minimized={genMinimized}
        status={genStatus}
        logs={genLogs}
        thinking={genThinking}
        text={genText}
        onMinimize={() => setGenMinimized(true)}
        onRestore={() => setGenMinimized(false)}
        onClose={closeGen}
      />
    </div>
  );
}

// ==================== Confirm Dialog ====================

function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确定",
  cancelText = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg shadow-xl w-[380px] max-w-[calc(100vw-32px)] overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50">
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {description && (
          <div className="px-4 py-3 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {description}
          </div>
        )}
        <div className="px-4 py-3 border-t border-border/50 bg-muted/30 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs rounded-md text-white ${
              danger ? "bg-red-500 hover:opacity-90" : "bg-primary hover:opacity-90"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== Dashboard Tab ====================

function Dashboard() {
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [status, setStatus] = useState<CollectorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [todayStats, collectorStatus] = await Promise.all([
        getTodayStats(),
        getCollectorStatus(),
      ]);
      setStats(todayStats);
      setStatus(collectorStatus);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncNow();
      await loadData();
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className={`w-2 h-2 rounded-full ${status?.running ? "bg-green-500" : "bg-red-500"}`} />
          {status?.running ? "采集器运行中" : "采集器已停止"}
          {status?.last_sync && (
            <span>· 上次同步: {formatTimestamp(status.last_sync)}</span>
          )}
          {status && (status.sessions_parsed ?? 0) > 0 && (
            <span>· 已解析 {status.sessions_parsed} 个会话</span>
          )}
          {status?.hook_status && (
            <span>· Hook: {status.hook_status}</span>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "同步中..." : "立即同步"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="今日会话" value={stats?.total_sessions ?? 0} />
        <StatCard label="对话轮次" value={stats?.total_messages ?? 0} />
        <StatCard label="使用时长" value={stats?.total_duration_formatted ?? "0h 0m"} />
        <StatCard
          label="活跃工具"
          value={Object.keys(stats?.tool_distribution ?? {}).length}
        />
      </div>

      {/* Tool distribution */}
      {stats && Object.keys(stats.tool_distribution).length > 0 && (
        <div className="p-4 border border-border rounded-lg">
          <h3 className="text-sm font-medium mb-3">工具使用分布</h3>
          <div className="flex gap-4 flex-wrap">
            {Object.entries(stats.tool_distribution).map(([tool, count]) => (
              <div key={tool} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getToolColor(tool) }}
                />
                <span className="text-sm">{getToolLabel(tool)}</span>
                <span className="text-sm font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent sessions */}
      <div>
        <h3 className="text-sm font-medium mb-3">最近会话</h3>
        {stats?.recent_sessions && stats.recent_sessions.length > 0 ? (
          <div className="space-y-2">
            {stats.recent_sessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Zap className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">今天还没有 AI 工具活动记录</p>
            <p className="text-xs mt-1 max-w-md mx-auto">
              采集器正在监控以下目录：
            </p>
            <div className="text-xs mt-1 font-mono bg-secondary/50 rounded p-2 max-w-md mx-auto text-left">
              <div>~/.claude/projects/ (Claude Code)</div>
              <div>~/.codex/sessions/ (CodeX)</div>
              <div>~/.gemini/ (Gemini CLI)</div>
              <div>~/.qwen/ (Qwen CLI)</div>
            </div>
            <p className="text-xs mt-2">
              打开 AI 工具开始工作后，点击「立即同步」或等待自动扫描（每 30 分钟）
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-3 border border-border rounded-lg bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

function SessionRow({ session }: { session: AiSession }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  const loadDetail = async () => {
    if (!detail) {
      try {
        const d = await getSessionDetail(session.id);
        setDetail(d);
      } catch (_) { /* ignore */ }
    }
  };

  const handleToggle = () => {
    setExpanded(!expanded);
    if (!expanded) loadDetail();
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 p-3 hover:bg-secondary/50 text-left transition-colors"
      >
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: getToolColor(session.tool_id) }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {session.title || `${getToolLabel(session.tool_id)} 会话`}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>{getToolLabel(session.tool_id)}</span>
            {session.project_name && (
              <>
                <span>·</span>
                <span>{session.project_name}</span>
              </>
            )}
            <span>·</span>
            <span>{session.message_count} 轮</span>
            <span>·</span>
            <span>{formatDuration(session.duration_secs)}</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatTimestamp(session.started_at)}
        </span>
      </button>
      {expanded && detail && (
        <ConversationView session={session} detail={detail} />
      )}
    </div>
  );
}

// ===== Conversation View (cc-switch style) =====

function ConversationView({ session, detail }: { session: AiSession; detail: SessionDetail }) {
  const [messages, setMessages] = useState<ClaudeMessage[] | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(false);

  useEffect(() => {
    if (session.raw_path) {
      setLoadingMsg(true);
      loadSessionMessages(session.raw_path)
        .then(setMessages)
        .catch(() => setMessages(null))
        .finally(() => setLoadingMsg(false));
    }
  }, [session.raw_path]);

  const msgCount = messages?.length || detail.activities.length;

  return (
    <div className="border-t border-border bg-secondary/10">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <span className="text-xs font-medium">
          {session.title || `${getToolLabel(session.tool_id)} 会话`}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {msgCount} 条消息 · {session.message_count} 轮 · {formatDuration(session.duration_secs)}
        </span>
      </div>

      <div className="max-h-[60vh] overflow-auto px-3 py-3 space-y-2">
        {loadingMsg && (
          <div className="text-center py-8 text-xs text-muted-foreground">加载消息中...</div>
        )}
        {!loadingMsg && messages && messages.length > 0 && (
          messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
        )}
        {!loadingMsg && (!messages || messages.length === 0) && (
          detail.activities.map((a) => <ActivityBubble key={a.id} activity={a} />)
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ClaudeMessage }) {
  const [collapsed, setCollapsed] = useState(msg.content.length > 3000);
  const isUser = msg.role === "user";
  const isAssistant = msg.role === "assistant";
  const isTool = msg.role === "tool";
  const displayContent = collapsed ? msg.content.slice(0, 1500) + "…" : msg.content;

  return (
    <div className={`rounded-lg border px-3 py-2.5 text-sm min-w-0 ${
      isUser
        ? "bg-primary/5 border-primary/20 ml-8"
        : isAssistant
        ? "bg-blue-500/5 border-blue-500/20 mr-8"
        : isTool
        ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 ml-4 mr-4"
        : "bg-muted/40 border-border/60"
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[11px] font-semibold ${
          isUser ? "text-primary" : isAssistant ? "text-blue-500" : isTool ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
        }`}>
          {isUser ? "YOU" : isAssistant ? "AI" : isTool ? "TOOL" : msg.role.toUpperCase()}
        </span>
        {msg.ts && (
          <span className="text-[10px] text-muted-foreground">{formatTimestamp(msg.ts)}</span>
        )}
      </div>
      <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
        {displayContent}
      </div>
      {msg.content.length > 3000 && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? `展开 (${Math.round(msg.content.length / 1000)}k)` : "收起"}
        </button>
      )}
    </div>
  );
}

function ActivityBubble({ activity }: { activity: AiActivity }) {
  const isUser = activity.role === "user";
  const isTool = activity.activity_type === "tool_call";

  return (
    <div className={`rounded-lg border px-3 py-2.5 text-sm ${
      isUser
        ? "bg-primary/5 border-primary/20 ml-8"
        : isTool
        ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 ml-4 mr-4"
        : "bg-blue-500/5 border-blue-500/20 mr-8"
    }`}>
      <div className="text-[11px] font-semibold mb-1">
        <span className={
          isUser ? "text-primary" : isTool ? "text-amber-600 dark:text-amber-400" : "text-blue-500"
        }>
          {isUser ? "YOU" : isTool ? `🔧 ${activity.tool_name || "TOOL"}` : "AI"}
        </span>
      </div>
      <div className="whitespace-pre-wrap break-words leading-relaxed">
        {activity.content_preview || "(empty)"}
      </div>
      {activity.file_path && (
        <div className="text-[10px] text-muted-foreground mt-1">
          📁 {activity.file_path}
          {activity.lines_added != null && ` +${activity.lines_added}`}
          {activity.lines_removed != null && ` -${activity.lines_removed}`}
        </div>
      )}
    </div>
  );
}

// ==================== Sessions Tab ====================

function SessionList() {
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [range, setRange] = useState<DateRange | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const r = await getTodayRange();
      setRange(r);
      const data = await getSessions({
        start: r.start,
        end: r.end,
        limit: 100,
        offset: 0,
      });
      setSessions(data);
    } catch (_) { /* ignore */ }
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">加载中...</div>;

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">会话历史 ({range?.label})</h2>
        <div className="flex gap-2">
          {["today", "yesterday", "this_week", "this_month"].map((type) => (
            <RangeButton key={type} type={type} onSelect={async (r) => {
              setRange(r);
              const data = await getSessions({ start: r.start, end: r.end, limit: 100, offset: 0 });
              setSessions(data);
            }} />
          ))}
        </div>
      </div>
      {sessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">暂无会话记录</div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function RangeButton({ type, onSelect }: { type: string; onSelect: (r: DateRange) => void }) {
  const labels: Record<string, string> = { today: "今天", yesterday: "昨天", this_week: "本周", this_month: "本月" };
  return (
    <button
      onClick={() => getDateRange(type).then(onSelect)}
      className="px-2.5 py-1 text-xs border border-border rounded-md hover:bg-secondary transition-colors"
    >
      {labels[type] ?? type}
    </button>
  );
}

// ==================== Reports Tab ====================

// --- Date/week/month picker helpers (local time) ---

function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function toIsoMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function toIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
function rangeForDate(val: string): { start: number; end: number } {
  const [y, m, d] = val.split("-").map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0).getTime(),
    end: new Date(y, m - 1, d, 23, 59, 59, 999).getTime(),
  };
}
function rangeForMonth(val: string): { start: number; end: number } {
  const [y, m] = val.split("-").map(Number);
  return {
    start: new Date(y, m - 1, 1, 0, 0, 0, 0).getTime(),
    end: new Date(y, m, 0, 23, 59, 59, 999).getTime(), // day 0 of month m == last day of m-1
  };
}
function rangeForWeek(val: string): { start: number; end: number } {
  const [ys, ws] = val.split("-W");
  const year = Number(ys);
  const week = Number(ws);
  const jan4 = new Date(year, 0, 4);
  const dayNum = jan4.getDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setDate(jan4.getDate() - (dayNum - 1));
  const mon = new Date(week1Mon);
  mon.setDate(week1Mon.getDate() + (week - 1) * 7);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { start: mon.getTime(), end: sun.getTime() };
}

type GenStatus = "idle" | "generating" | "done" | "error";
interface GenLog { time: number; stage: string; text: string }

function ReportGenModal({
  open, minimized, status, logs, thinking, text, onMinimize, onRestore, onClose,
}: {
  open: boolean;
  minimized: boolean;
  status: GenStatus;
  logs: GenLog[];
  thinking: number | null;
  text: string;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [displayedText, setDisplayedText] = useState("");

  // Reveal the streaming text gradually for a live "typing" effect.
  useEffect(() => {
    if (!text) { setDisplayedText(""); return; }
    setDisplayedText("");
    let i = 0;
    const total = text.length;
    const step = Math.max(2, Math.ceil(total / 240));
    const id = setInterval(() => {
      i += step;
      if (i >= total) { setDisplayedText(text); clearInterval(id); }
      else setDisplayedText(text.slice(0, i));
    }, 16);
    return () => clearInterval(id);
  }, [text]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs, displayedText, thinking]);

  if (!open && !minimized) return null;

  if (minimized) {
    return (
      <button
        onClick={onRestore}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-full shadow-lg hover:opacity-90"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${status === "generating" ? "animate-spin" : ""}`} />
        <span className="text-xs">
          {status === "generating"
            ? (thinking !== null ? `思考中 ${thinking}` : "生成中")
            : status === "done" ? "已完成（点击查看）" : status === "error" ? "失败（点击查看）" : "处理中"}
        </span>
      </button>
    );
  }

  const stageColor: Record<string, string> = {
    query: "text-blue-500",
    stats: "text-blue-500",
    prompt: "text-purple-500",
    summarize: "text-amber-500",
    save: "text-blue-500",
    done: "text-green-500",
    error: "text-red-500",
  };
  const statusLabel = status === "generating" ? "进行中" : status === "done" ? "已完成" : status === "error" ? "失败" : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-lg w-[620px] max-w-[92vw] h-[460px] max-h-[82vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${status === "generating" ? "animate-spin" : ""} text-primary`} />
            <h3 className="text-sm font-medium">报告生成过程</h3>
            {statusLabel && <span className="text-[10px] text-muted-foreground">{statusLabel}</span>}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onMinimize} title="静默（缩小到右下角）" className="p-1.5 rounded hover:bg-secondary">
              <Minus className="w-3.5 h-3.5" />
            </button>
            {status !== "generating" && (
              <button onClick={onClose} title="关闭" className="p-1.5 rounded hover:bg-secondary">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-2 space-y-1 text-xs">
          {logs.length === 0 && !text && thinking === null && (
            <div className="text-muted-foreground">等待开始...</div>
          )}
          {logs.map((l, i) => (
            <div
              key={i}
              className={`leading-relaxed break-words ${stageColor[l.stage] || "text-muted-foreground"}`}
            >
              <span className="text-[10px] text-muted-foreground/70 mr-1">[{l.stage}]</span>
              {l.text}
            </div>
          ))}
          {thinking !== null && !text && (
            <div className="flex items-center gap-1.5 text-amber-500">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>思考中... {thinking} tokens</span>
            </div>
          )}
          {displayedText && (
            <div className="mt-1 pt-1 border-t border-border/40 whitespace-pre-wrap break-words text-foreground/90 leading-relaxed font-sans">
              {displayedText}
              {displayedText.length < (text?.length ?? 0) && <span className="animate-pulse">▍</span>}
            </div>
          )}
          {status === "generating" && !displayedText && thinking === null && (
            <div className="text-muted-foreground animate-pulse">▍</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportViewer({
  onGenerate,
  reportsNonce,
  genStatus,
}: {
  onGenerate: (
    reportType: "daily" | "weekly" | "monthly",
    range: { start: number; end: number },
    templateId?: string
  ) => void;
  reportsNonce: number;
  genStatus: GenStatus;
}) {
  const [reports, setReports] = useState<AiReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewReport, setPreviewReport] = useState<AiReport | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  // Time picker state for report generation.
  const [genType, setGenType] = useState<"daily" | "weekly" | "monthly">("daily");
  const todayRef = useRef(new Date());
  const [genDate, setGenDate] = useState(toIsoDate(todayRef.current));
  const [genWeek, setGenWeek] = useState(toIsoWeek(todayRef.current));
  const [genMonth, setGenMonth] = useState(toIsoMonth(todayRef.current));

  // Template selector state.
  const [templates, setTemplates] = useState<AiReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined);

  const loadTemplates = async () => {
    try {
      const t = await getReportTemplates();
      setTemplates(t);
      setSelectedTemplateId((prev) => prev ?? t.find((x) => x.is_default)?.id ?? t[0]?.id);
    } catch (_) { /* ignore */ }
  };
  useEffect(() => { loadTemplates(); }, [reportsNonce]);

  // HTML theme selector.
  const [themes, setThemes] = useState<{ id: string; label: string }[]>([]);
  const [htmlTheme, setHtmlTheme] = useState("github");
  useEffect(() => { listReportThemes().then(setThemes).catch(() => {}); }, []);

  // Render the selected report's Markdown into styled HTML for preview/export.
  useEffect(() => {
    setPreviewHtml(null);
    if (!previewReport || !previewReport.content) return;
    let cancelled = false;
    renderReportHtml(previewReport.content, previewReport.title, htmlTheme)
      .then((html) => { if (!cancelled) setPreviewHtml(html); })
      .catch(() => { if (!cancelled) setPreviewHtml(null); });
    return () => { cancelled = true; };
  }, [previewReport, htmlTheme]);

  const safeName = (title: string) =>
    title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "report";

  const handleExportMd = async () => {
    if (!previewReport?.content) return;
    setExportMsg(null);
    try {
      const path = await save({
        defaultPath: `${safeName(previewReport.title)}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (path) {
        await writeTextFile(path, previewReport.content);
        setExportMsg(`已导出 Markdown: ${path}`);
      }
    } catch (e) {
      setExportMsg(`导出失败: ${e}`);
    }
  };

  const handleExportHtml = async () => {
    if (!previewReport?.content) return;
    setExportMsg(null);
    try {
      const html =
        previewHtml ??
        (await renderReportHtml(previewReport.content, previewReport.title, htmlTheme));
      const path = await save({
        defaultPath: `${safeName(previewReport.title)}.html`,
        filters: [{ name: "HTML", extensions: ["html"] }],
      });
      if (path) {
        await writeTextFile(path, html);
        setExportMsg(`已导出 HTML: ${path}`);
      }
    } catch (e) {
      setExportMsg(`导出失败: ${e}`);
    }
  };

  const loadReports = async () => {
    try {
      const data = await getReports();
      setReports(data);
    } catch (_) { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadReports(); }, [reportsNonce]);

  const computeRange = (): { start: number; end: number } => {
    if (genType === "daily") return rangeForDate(genDate);
    if (genType === "weekly") return rangeForWeek(genWeek);
    return rangeForMonth(genMonth);
  };

  // Generate confirmation.
  const [genConfirm, setGenConfirm] = useState(false);
  const typeLabel = genType === "daily" ? "日报" : genType === "weekly" ? "周报" : "月报";
  const timeLabel = genType === "daily" ? genDate : genType === "weekly" ? genWeek : genMonth;
  const templateName =
    templates.find((t) => t.id === selectedTemplateId)?.name ?? "默认模板";
  const confirmGenerate = () => {
    setGenConfirm(false);
    onGenerate(genType, computeRange(), selectedTemplateId);
  };

  const handleDelete = async (id: string) => {
    await deleteReport(id);
    setReports((prev) => prev.filter((r) => r.id !== id));
    if (previewReport?.id === id) setPreviewReport(null);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">加载中...</div>;

  return (
    <div className="flex flex-col h-full p-5 gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap flex-shrink-0">
        <h2 className="text-sm font-medium">报告中心</h2>
        <div className="flex items-center gap-2">
          <select
            value={genType}
            onChange={(e) => setGenType(e.target.value as "daily" | "weekly" | "monthly")}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="daily">日报</option>
            <option value="weekly">周报</option>
            <option value="monthly">月报</option>
          </select>
          {genType === "daily" && (
            <input type="date" value={genDate} onChange={(e) => setGenDate(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
          )}
          {genType === "weekly" && (
            <input type="week" value={genWeek} onChange={(e) => setGenWeek(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
          )}
          {genType === "monthly" && (
            <input type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
          )}
          <select
            value={selectedTemplateId ?? ""}
            onChange={(e) => setSelectedTemplateId(e.target.value || undefined)}
            title="选择报告模板"
            className="h-8 rounded-md border border-border bg-background px-2 text-xs max-w-[140px]"
          >
            {templates.length === 0 && <option value="">默认模板</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.is_default ? " ★" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() => setGenConfirm(true)}
            disabled={genStatus === "generating"}
            className="flex items-center gap-1 h-8 px-3 text-xs bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${genStatus === "generating" ? "animate-spin" : ""}`} />
            {genStatus === "generating" ? "生成中" : "生成"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[240px_1fr] grid-rows-1 gap-4 flex-1 min-h-0">
        {/* Report list */}
        <div className="space-y-1 border border-border rounded-lg p-2 min-h-0 overflow-auto">
          {reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">暂无报告</div>
          ) : (
            reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setPreviewReport(r)}
                className={`w-full text-left p-2 rounded text-xs transition-colors ${
                  previewReport?.id === r.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-secondary"
                }`}
              >
                <div className="font-medium truncate">{r.title}</div>
                <div className="text-muted-foreground mt-0.5">
                  {r.report_type === "daily" ? "日报" : r.report_type === "weekly" ? "周报" : "月报"}
                  {r.generated_at && <> · {formatFullTimestamp(r.generated_at)}</>}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Preview */}
        <div className="border border-border rounded-lg p-4 flex flex-col min-h-0">
          {previewReport ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm truncate">{previewReport.title}</h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select
                    value={htmlTheme}
                    onChange={(e) => setHtmlTheme(e.target.value)}
                    title="HTML 主题（预览与导出共用）"
                    className="h-7 rounded-md border border-border bg-background px-1.5 text-xs max-w-[110px]"
                  >
                    {themes.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleExportMd}
                    disabled={!previewReport.content}
                    title="导出为 Markdown 文件"
                    className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded-md hover:bg-secondary disabled:opacity-50"
                  >
                    <Download className="w-3 h-3" /> 导出 MD
                  </button>
                  <button
                    onClick={handleExportHtml}
                    disabled={!previewReport.content}
                    title="生成并导出 HTML 文件（当前主题）"
                    className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded-md hover:bg-secondary disabled:opacity-50"
                  >
                    <FileCode className="w-3 h-3" /> 导出 HTML
                  </button>
                  <button
                    onClick={() => handleDelete(previewReport.id)}
                    className="px-2 py-1 text-xs text-red-500 hover:text-red-600"
                  >
                    删除
                  </button>
                </div>
              </div>
              {exportMsg && (
                <div className="mb-2 text-[11px] text-muted-foreground break-all">{exportMsg}</div>
              )}
              <div className="flex-1 min-h-0">
                {previewReport.content ? (
                  previewHtml ? (
                    <iframe
                      title="report-preview"
                      srcDoc={previewHtml}
                      className="w-full h-full rounded border border-border/60 bg-white"
                      sandbox="allow-same-origin"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">渲染中...</div>
                  )
                ) : (
                  <div className="text-muted-foreground text-sm">报告内容为空</div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              选择左侧报告查看详情
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={genConfirm}
        title={`生成${typeLabel}`}
        description={`类型：${typeLabel}\n时间：${timeLabel}\n模板：${templateName}\n\n将调用 AI 进行总结，可能需要一些时间。是否继续？`}
        confirmText="开始生成"
        onCancel={() => setGenConfirm(false)}
        onConfirm={confirmGenerate}
      />
    </div>
  );
}

// ==================== Settings Tab ====================

function ToolSettings() {
  const { data: settings } = useSettings();
  const updateSetting = useUpdateSetting();
  const [tools, setTools] = useState<AiTool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAiTools().then(setTools).finally(() => setLoading(false));
  }, []);

  const handleToggle = async (tool: AiTool) => {
    await updateAiTool(tool.id, !tool.enabled, tool.watch_paths, tool.config);
    setTools((prev) =>
      prev.map((t) => (t.id === tool.id ? { ...t, enabled: !t.enabled } : t))
    );
  };

  const setSetting = (key: string, value: string) => {
    updateSetting.mutate({ key, value });
  };

  const getVal = (key: string, fallback: string) =>
    getSettingValue(settings, key, fallback);

  const [hookMsg, setHookMsg] = useState<string | null>(null);
  const [hookBusy, setHookBusy] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState<string | null>(null);

  const handleSetupHooks = async () => {
    setHookBusy(true);
    setHookMsg(null);
    try {
      const r = await setupHooks();
      setHookMsg(`已写入 ${r.events.length} 个 Hook 到 ${r.path}（已备份 ${r.backup}）`);
    } catch (e) {
      setHookMsg(`配置失败: ${e}`);
    } finally {
      setHookBusy(false);
    }
  };

  const handleRemoveHooks = async () => {
    setHookBusy(true);
    setHookMsg(null);
    try {
      const r = await removeHooks();
      setHookMsg(`已移除 ${r.removed} 个 Hook`);
    } catch (e) {
      setHookMsg(`移除失败: ${e}`);
    } finally {
      setHookBusy(false);
    }
  };

  const handleRebuild = async () => {
    if (!window.confirm("将清空所有会话与活动记录，并使用修复后的解析器重新解析全部文件。确定继续？")) return;
    setRebuilding(true);
    setRebuildMsg(null);
    try {
      const r = await resetActivityData();
      setRebuildMsg(`完成，已重新解析 ${r.sessions_parsed} 个会话`);
    } catch (e) {
      setRebuildMsg(`重建失败: ${e}`);
    } finally {
      setRebuilding(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">加载中...</div>;

  const summaryMethod = getVal("ai_summary_method", "cli");

  return (
    <div className="p-5 space-y-4">
      {/* AI 工具列表 */}
      <div>
        <h2 className="text-sm font-medium mb-2">已注册的 AI 工具</h2>
        <p className="text-xs text-muted-foreground mb-4">
          启用需要追踪的工具，采集器会自动扫描会话数据。要添加新工具，修改 watch_paths 后会生效。
        </p>
        <div className="space-y-2">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className="flex items-center justify-between p-3 border border-border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getToolColor(tool.id) }}
                />
                <div>
                  <div className="text-sm font-medium">{tool.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {tool.id} · {tool.parser_type}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleToggle(tool)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  tool.enabled
                    ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                }`}
              >
                {tool.enabled ? "已启用" : "已禁用"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 自动报告 */}
      <div className="pt-4 border-t border-border">
        <h2 className="text-sm font-medium mb-3">报告与总结</h2>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 border border-border rounded-lg">
            <div>
              <div className="text-sm font-medium">自动生成报告</div>
              <div className="text-xs text-muted-foreground">每天 18:00 日报，每周五周报，月末月报</div>
            </div>
            <button
              onClick={() => setSetting("ai_report_auto_generate", getVal("ai_report_auto_generate", "true") === "true" ? "false" : "true")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                getVal("ai_report_auto_generate", "true") === "true"
                  ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500"
              }`}
            >
              {getVal("ai_report_auto_generate", "true") === "true" ? "已开启" : "已关闭"}
            </button>
          </div>

          {/* 总结方式 */}
          <div className="p-3 border border-border rounded-lg space-y-2">
            <label className="text-sm font-medium">AI 总结方式</label>
            <select
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={summaryMethod}
              onChange={(e) => setSetting("ai_summary_method", e.target.value)}
            >
              <option value="cli">CLI 调用（claude / codex 命令）</option>
              <option value="api">API 调用（Anthropic / OpenAI）</option>
              <option value="manual">手动模式（生成 Prompt，自行复制粘贴）</option>
            </select>

            {summaryMethod === "cli" && (
              <select
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm mt-2"
                value={getVal("ai_summary_tool", "claude")}
                onChange={(e) => setSetting("ai_summary_tool", e.target.value)}
              >
                <option value="claude">Claude Code (claude CLI)</option>
                <option value="codex">CodeX CLI</option>
              </select>
            )}

            {summaryMethod === "api" && (
              <div className="space-y-2 mt-2">
                <select
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={getVal("ai_summary_provider", "anthropic")}
                  onChange={(e) => setSetting("ai_summary_provider", e.target.value)}
                >
                  <option value="anthropic">Anthropic (Claude API)</option>
                  <option value="openai">OpenAI (GPT API)</option>
                </select>
                <input
                  placeholder="API Key（加密存储）"
                  type="password"
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                  defaultValue={getVal("ai_summary_api_key", "")}
                  onBlur={(e) => { if (e.target.value) setSetting("ai_summary_api_key", e.target.value); }}
                />
                <input
                  placeholder="模型名（默认: claude-sonnet-4-20250514）"
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                  defaultValue={getVal("ai_summary_model", "")}
                  onBlur={(e) => { if (e.target.value) setSetting("ai_summary_model", e.target.value); }}
                />
              </div>
            )}
          </div>

          {/* Hook 管理 */}
          <div className="p-3 border border-border rounded-lg">
            <div className="text-sm font-medium mb-1">Claude Code Hook 配置</div>
            <p className="text-[10px] text-muted-foreground mb-2">
              自动写入 ~/.claude/settings.json，让 Claude Code 每次操作时实时上报活动数据（写入前自动备份原文件）
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSetupHooks}
                disabled={hookBusy}
                className="px-3 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded-md hover:opacity-80 disabled:opacity-50"
              >
                {hookBusy ? "处理中..." : "一键配置 Hook"}
              </button>
              <button
                onClick={handleRemoveHooks}
                disabled={hookBusy}
                className="px-3 py-1 text-xs bg-red-50 dark:bg-red-900/20 text-red-500 rounded-md hover:opacity-80 disabled:opacity-50"
              >
                移除 Hook
              </button>
            </div>
            {hookMsg && (
              <div className="mt-2 text-[11px] text-muted-foreground break-all">{hookMsg}</div>
            )}
          </div>

          {/* 重建数据 */}
          <div className="p-3 border border-border rounded-lg">
            <div className="text-sm font-medium mb-1">重建活动数据</div>
            <p className="text-[10px] text-muted-foreground mb-2">
              清空所有会话与活动记录，用修复后的解析器重新解析全部历史文件（用于清理重复/空数据）
            </p>
            <button
              onClick={handleRebuild}
              disabled={rebuilding}
              className="px-3 py-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-md hover:opacity-80 disabled:opacity-50"
            >
              {rebuilding ? "重建中..." : "重建数据"}
            </button>
            {rebuildMsg && (
              <div className="mt-2 text-[11px] text-muted-foreground break-all">{rebuildMsg}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== Templates Tab ====================

function TemplateManager() {
  const [tplList, setTplList] = useState<AiReportTemplate[]>([]);
  const [editingTpl, setEditingTpl] = useState<{ id?: string; name: string; body: string; isDefault: boolean } | null>(null);
  const [tplMsg, setTplMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTemplates = async () => {
    try {
      const list = await getReportTemplates();
      setTplList(list);
      // If nothing is being edited, auto-select the first (default) for editing.
      setEditingTpl((prev) => {
        if (prev) return prev;
        const t = list.find((x) => x.is_default) ?? list[0];
        return t ? { id: t.id, name: t.name, body: t.body, isDefault: t.is_default } : null;
      });
    } catch (_) { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { loadTemplates(); }, []);

  const startNew = () => {
    setTplMsg(null);
    setEditingTpl({ name: "", body: "", isDefault: false });
  };
  const saveTpl = async () => {
    if (!editingTpl) return;
    if (!editingTpl.name.trim()) { setTplMsg("请填写模板名称"); return; }
    setTplMsg(null);
    try {
      const saved = await saveReportTemplate({
        id: editingTpl.id,
        name: editingTpl.name.trim(),
        body: editingTpl.body,
        isDefault: editingTpl.isDefault,
      });
      await loadTemplates();
      setEditingTpl({ id: saved.id, name: saved.name, body: saved.body, isDefault: saved.is_default });
      setTplMsg("已保存");
    } catch (e) {
      setTplMsg(`保存失败: ${e}`);
    }
  };
  const [delConfirm, setDelConfirm] = useState<{ id: string; name: string } | null>(null);
  const requestDelete = () => {
    if (!editingTpl?.id) return;
    setDelConfirm({ id: editingTpl.id, name: editingTpl.name });
  };
  const confirmDelete = async () => {
    if (!delConfirm) return;
    const id = delConfirm.id;
    setDelConfirm(null);
    try {
      await deleteReportTemplate(id);
      if (editingTpl?.id === id) setEditingTpl(null);
      await loadTemplates();
      setTplMsg("已删除");
    } catch (e) {
      setTplMsg(`删除失败: ${e}`);
    }
  };
  const setDefaultTpl = async (id: string) => {
    try {
      await setDefaultReportTemplate(id);
      await loadTemplates();
    } catch (e) {
      setTplMsg(`设置失败: ${e}`);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">加载中...</div>;

  return (
    <div className="flex flex-col h-full p-5 gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h2 className="text-sm font-medium">报告模板</h2>
        <button
          onClick={startNew}
          className="px-2.5 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:opacity-90"
        >
          + 新建模板
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground flex-shrink-0 border border-border/60 rounded-md p-2 bg-secondary/30">
        <div className="font-medium mb-1">占位符（生成时自动替换为实际数据，直接写在模板正文里即可）：</div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <code className="text-primary">{"{{report_type}}"}</code>
          <span>报告类型：日报 / 周报 / 月报</span>
          <code className="text-primary">{"{{date_range}}"}</code>
          <span>时间范围，如 2026-07-13 - 2026-07-16</span>
          <code className="text-primary">{"{{total_sessions}}"}</code>
          <span>总会话数（数字）</span>
          <code className="text-primary">{"{{total_messages}}"}</code>
          <span>总对话轮次（数字）</span>
          <code className="text-primary">{"{{total_duration}}"}</code>
          <span>AI 工具使用总时长，如 3h 42m</span>
          <code className="text-primary">{"{{tool_distribution}}"}</code>
          <span>各 AI 工具使用次数分布（JSON，如 {"{claude-code:5, codex:2}"})</span>
          <code className="text-primary">{"{{session_questions}}"}</code>
          <span>会话与你的真实提问记录（按时间顺序，每条提问≤400字，这是最核心的内容）</span>
        </div>
      </div>

      <div className="grid grid-cols-[220px_1fr] grid-rows-1 gap-4 flex-1 min-h-0">
        {/* List */}
        <div className="border border-border rounded-lg p-2 min-h-0 overflow-auto space-y-1">
          {tplList.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs">暂无模板</div>
          )}
          {tplList.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTplMsg(null); setEditingTpl({ id: t.id, name: t.name, body: t.body, isDefault: t.is_default }); }}
              className={`w-full text-left p-2 rounded text-xs transition-colors ${
                editingTpl?.id === t.id ? "bg-primary/10 text-primary" : "hover:bg-secondary"
              }`}
            >
              <div className="font-medium truncate">{t.name}</div>
              {t.is_default && <div className="text-[10px] text-amber-500">默认</div>}
            </button>
          ))}
        </div>

        {/* Editor */}
        <div className="border border-border rounded-lg p-3 flex flex-col min-h-0">
          {editingTpl ? (
            <>
              <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                <input
                  placeholder="模板名称"
                  value={editingTpl.name}
                  onChange={(e) => setEditingTpl({ ...editingTpl, name: e.target.value })}
                  className="flex-1 h-8 rounded-md border border-border bg-background px-2 text-sm"
                />
                {!editingTpl.id && <span className="text-[10px] text-muted-foreground">新建</span>}
              </div>
              <textarea
                placeholder={"模板内容（Prompt 正文）。把 {{report_type}}、{{date_range}}、{{session_questions}} 等占位符写在需要的位置即可（占位符说明见上方）"}
                value={editingTpl.body}
                onChange={(e) => setEditingTpl({ ...editingTpl, body: e.target.value })}
                className="flex-1 min-h-0 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono resize-none"
              />
              <div className="flex items-center gap-2 mt-2 flex-shrink-0">
                <button
                  onClick={saveTpl}
                  className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:opacity-90"
                >
                  保存
                </button>
                <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingTpl.isDefault}
                    onChange={(e) => setEditingTpl({ ...editingTpl, isDefault: e.target.checked })}
                  />
                  设为默认
                </label>
                {editingTpl.id && !editingTpl.isDefault && (
                  <button onClick={() => setDefaultTpl(editingTpl.id!)} className="px-2 py-1 text-xs border border-border rounded hover:bg-secondary">设默认</button>
                )}
                {editingTpl.id && (
                  <button onClick={requestDelete} className="px-2 py-1 text-xs text-red-500 hover:text-red-600">删除</button>
                )}
                <button onClick={() => setEditingTpl(null)} className="px-2 py-1 text-xs border border-border rounded hover:bg-secondary">关闭</button>
                {tplMsg && <span className="text-[11px] text-muted-foreground ml-auto">{tplMsg}</span>}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              选择左侧模板编辑，或点「+ 新建模板」
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!delConfirm}
        title="删除模板"
        description={`确定删除模板「${delConfirm?.name ?? ""}」？此操作不可撤销。`}
        confirmText="删除"
        danger
        onCancel={() => setDelConfirm(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
