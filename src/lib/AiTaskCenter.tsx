import { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { RefreshCw, X, Bot } from "lucide-react";
import { callAi, type AiProviderConfig, type AiResponse } from "./api/ai";
import { useMigrateAiSettings } from "@/lib/query/aiQueries";

// ---- types ----

export type TaskStatus = "running" | "done" | "error";

export interface AiLog { time: number; stage: string; text: string; }

export interface AiTask {
  id: string;
  type: "testgen" | "daily_report" | "weekly_report" | "monthly_report" | "generic";
  providerId: string;
  providerName: string;
  status: TaskStatus;
  logs: AiLog[];
  streamText: string;
  thinkingTokens: number | null;
  result: AiResponse | null;
  error: string | null;
  createdAt: number;
}

export interface AiTaskRequest {
  type: AiTask["type"];
  providerId: string;
  providerConfig: AiProviderConfig;
  prompt: string;
  continueSession?: boolean;
  onDone?: (result: AiResponse) => void;
  onError?: (error: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  testgen: "单测执行",
  daily_report: "日报生成",
  weekly_report: "周报生成",
  monthly_report: "月报生成",
  generic: "AI 调用",
};

interface AiTaskCenterValue {
  tasks: AiTask[];
  panelOpen: boolean; setPanelOpen: (v: boolean) => void;
  detailTaskId: string | null; openDetail: (id: string) => void; closeDetail: () => void;
  startTask: (req: AiTaskRequest) => string;
  removeTask: (id: string) => void;
  clearDone: () => void;
  getTask: (id: string) => AiTask | undefined;
  updateTaskFromStream: (id: string, data: StreamEventData) => void;
  appendTaskLog: (id: string, stage: string, text: string) => void;
  setTaskStatus: (id: string, status: TaskStatus, error?: string) => void;
  addExternalTask: (task: AiTask) => void;
}

interface StreamEventData {
  kind: string;
  stage?: string;
  message?: string;
  tokens?: number;
  text?: string;
}

const AiTaskCenterContext = createContext<AiTaskCenterValue | null>(null);

export function useAiTaskCenter() {
  const ctx = useContext(AiTaskCenterContext);
  if (!ctx) throw new Error("useAiTaskCenter must be used within AiTaskCenterProvider");
  return ctx;
}

let taskCounter = 0;
function genTaskId(): string { taskCounter++; return `ai-${Date.now()}-${taskCounter}`; }

export function AiTaskCenterProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Map<string, AiTask>>(new Map());
  const [panelOpen, setPanelOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  useMigrateAiSettings();

  // Global ai-stream listener
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<{ task_id: string } & StreamEventData>("ai-stream", (e) => {
      const { task_id, kind, stage, message, tokens, text } = e.payload;
      setTasks((prev) => {
        const task = prev.get(task_id);
        if (!task) return prev;
        const next = new Map(prev);
        const updated = { ...task };
        switch (kind) {
          case "progress":
            updated.logs = [...updated.logs, { time: Date.now(), stage: stage ?? "info", text: message ?? "" }];
            break;
          case "thinking":
            updated.thinkingTokens = tokens ?? 0;
            break;
          case "text":
            updated.streamText = text ?? "";
            break;
          case "done":
            updated.status = "done";
            break;
          case "error":
            updated.status = "error";
            updated.error = message ?? "未知错误";
            break;
        }
        next.set(task_id, updated);
        return next;
      });
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  const tasksArray = useMemo(() => Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt), [tasks]);

  const startTask = useCallback((req: AiTaskRequest): string => {
    const id = genTaskId();
    const newTask: AiTask = {
      id, type: req.type,
      providerId: req.providerId, providerName: req.providerConfig.id,
      status: "running", logs: [], streamText: "", thinkingTokens: null,
      result: null, error: null, createdAt: Date.now(),
    };
    setTasks((prev) => new Map(prev).set(id, newTask));
    setPanelOpen(true);

    // Add start log
    const appendLog = (stage: string, text: string) => {
      setTasks((prev) => {
        const t = prev.get(id);
        if (!t) return prev;
        const next = new Map(prev);
        next.set(id, { ...t, logs: [...t.logs, { time: Date.now(), stage, text }] });
        return next;
      });
    };
    appendLog("start", `Provider: ${req.providerConfig.id}`);

    callAi({
      providerId: req.providerId,
      prompt: req.prompt,
      configJson: JSON.stringify(req.providerConfig),
      continueSession: req.continueSession ?? false,
      taskId: id,
    }).then((result) => {
      setTasks((prev) => {
        const t = prev.get(id);
        if (!t) return prev;
        const next = new Map(prev);
        next.set(id, { ...t, status: "done", result, logs: [...t.logs, { time: Date.now(), stage: "done", text: "完成" }] });
        return next;
      });
      req.onDone?.(result);
    }).catch((e) => {
      const msg = String(e);
      setTasks((prev) => {
        const t = prev.get(id);
        if (!t) return prev;
        const next = new Map(prev);
        next.set(id, { ...t, status: "error", error: msg, logs: [...t.logs, { time: Date.now(), stage: "error", text: msg }] });
        return next;
      });
      req.onError?.(msg);
    });

    return id;
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    if (detailTaskId === id) setDetailTaskId(null);
  }, [detailTaskId]);

  const clearDone = useCallback(() => {
    setTasks((prev) => {
      const next = new Map(prev);
      for (const [k, v] of next) { if (v.status !== "running") next.delete(k); }
      return next;
    });
  }, []);

  const getTask = useCallback((id: string) => tasks.get(id), [tasks]);

  const addExternalTask = useCallback((task: AiTask) => {
    setTasks((prev) => new Map(prev).set(task.id, task));
    setPanelOpen(true);
  }, []);

  const value: AiTaskCenterValue = {
    tasks: tasksArray, panelOpen, setPanelOpen,
    detailTaskId, openDetail: setDetailTaskId, closeDetail: () => setDetailTaskId(null),
    startTask, removeTask, clearDone, getTask,
    updateTaskFromStream: () => {}, // handled by global listener
    appendTaskLog: () => {},
    setTaskStatus: () => {},
    addExternalTask,
  };

  return (
    <AiTaskCenterContext.Provider value={value}>
      {children}
      <FloatingButton />
      {panelOpen && <TaskListPanel />}
      {detailTaskId && <TaskDetailModal />}
    </AiTaskCenterContext.Provider>
  );
}

// ---- FloatingButton ----

function FloatingButton() {
  const ctx = useContext(AiTaskCenterContext)!;
  const running = ctx.tasks.filter((t) => t.status === "running").length;

  return (
    <button
      onClick={() => ctx.setPanelOpen(!ctx.panelOpen)}
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg transition-all ${
        running > 0 ? "bg-primary text-primary-foreground animate-pulse" : "bg-background border border-border text-muted-foreground"
      }`}
    >
      <Bot className="w-4 h-4" />
      <span className="text-xs font-medium">AI</span>
      {running > 0 && (
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-primary text-[10px] font-bold">
          {running}
        </span>
      )}
    </button>
  );
}

// ---- TaskListPanel ----

function TaskListPanel() {
  const ctx = useContext(AiTaskCenterContext)!;

  return (
    <div className="fixed bottom-16 right-4 z-50 w-[360px] max-h-[400px] bg-background border border-border rounded-lg shadow-xl flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <span className="text-sm font-medium">AI 任务中心</span>
        <div className="flex items-center gap-1">
          {ctx.tasks.some((t) => t.status !== "running") && (
            <button onClick={ctx.clearDone} className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-secondary">
              清除已完成
            </button>
          )}
          <button onClick={() => ctx.setPanelOpen(false)} className="p-1 rounded hover:bg-secondary">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {ctx.tasks.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">暂无任务</div>
        ) : (
          ctx.tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => ctx.openDetail(task.id)}
              className="w-full text-left px-3 py-2.5 hover:bg-secondary/50 border-b border-border/50 last:border-0 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate">{TYPE_LABELS[task.type] ?? task.type}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{task.providerName}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {task.status === "running" && <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />}
                {task.status === "done" && <span className="text-green-500 text-xs">✓</span>}
                {task.status === "error" && <span className="text-red-500 text-xs">✗</span>}
                <button
                  onClick={(e) => { e.stopPropagation(); ctx.removeTask(task.id); }}
                  className="p-0.5 rounded hover:bg-secondary"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---- TaskDetailModal ----

function TaskDetailModal() {
  const ctx = useContext(AiTaskCenterContext)!;
  const task = ctx.tasks.find((t) => t.id === ctx.detailTaskId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    if (!task?.streamText) { setDisplayedText(""); return; }
    setDisplayedText("");
    let i = 0;
    const total = task.streamText.length;
    const step = Math.max(2, Math.ceil(total / 240));
    const id = setInterval(() => {
      i += step;
      if (i >= total) { setDisplayedText(task.streamText); clearInterval(id); }
      else setDisplayedText(task.streamText.slice(0, i));
    }, 16);
    return () => clearInterval(id);
  }, [task?.streamText]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [task?.logs, displayedText, task?.thinkingTokens]);

  if (!task) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-lg w-[620px] max-w-[92vw] h-[460px] max-h-[82vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${task.status === "running" ? "animate-spin" : ""} text-primary`} />
            <span className="text-sm font-medium">{TYPE_LABELS[task.type] ?? task.type}</span>
            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{task.providerName}</span>
            {task.status === "running" && <span className="text-[10px] text-amber-500">进行中</span>}
            {task.status === "done" && <span className="text-[10px] text-green-500">已完成</span>}
            {task.status === "error" && <span className="text-[10px] text-red-500">失败</span>}
          </div>
          <div className="flex gap-1">
            <button onClick={ctx.closeDetail} className="p-1.5 rounded hover:bg-secondary"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-2 space-y-1 text-xs">
          {task.logs.map((l, i) => (
            <div key={i} className="break-words"><span className="text-[10px] text-muted-foreground/70 mr-1">[{l.stage}]</span>{l.text}</div>
          ))}
          {task.thinkingTokens !== null && !task.streamText && (
            <div className="text-amber-500">思考中... {task.thinkingTokens} tokens</div>
          )}
          {displayedText && (
            <div className="whitespace-pre-wrap break-words border-t border-border/40 pt-1">
              {displayedText}
              {displayedText.length < (task.streamText?.length ?? 0) && <span className="animate-pulse">|</span>}
            </div>
          )}
          {task.status === "error" && (
            <div className="mt-2 pt-2 border-t border-red-500/30 text-red-500">执行失败: {task.error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
