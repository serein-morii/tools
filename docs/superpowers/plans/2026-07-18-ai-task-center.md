# AI Task Center 实现计划

> **For agentic workers:** Use superpowers:subagent-driven-development to implement. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 将单任务 AiContext 改造为右下角多任务 AI 任务中心，TestGen 和 Activity 报告都走它，AiSelector 在页面上显眼展示。

**Architecture:** `AiTaskCenter.tsx` 替换 `AiContext.tsx`，维护任务 Map 支持并发。Rust `call_ai` 和 `run_test_gen` 事件带上 `task_id`。前端根据 `task_id` 路由事件到对应任务。三层 UI：FloatingButton → TaskListPanel → TaskDetailModal。

**Tech Stack:** React 19 Context, Tauri 2 events, existing Tailwind + Radix patterns

**Spec:** `docs/superpowers/specs/2026-07-18-ai-task-center-design.md`

## Global Constraints

- 所有 AI 调用事件通过 `ai-stream` 通道，带 `task_id` 字段
- AiTaskCenter 维护 `Map<string, AiTask>`，每个任务独立状态
- FloatingButton 在右下角 z-50，始终可见
- TaskListPanel 从右下角弹出，宽 360px，高 400px
- TaskDetailModal 居中 Modal，宽 620px
- AiSelector 在 TestGenPage 工具栏和执行按钮同排；在 Activity 报告生成工具栏和生成按钮同排
- 保留 TestGenContext（管理 git/mvn 等非 AI 逻辑），保留旧的 `testgen-stream`/`testgen-progress` 事件兼容
- Rust `call_ai` 命令加 `task_id` 参数；`run_test_gen` 命令加 `task_id` 参数

---

### Task 1: Rust 后端 - call_ai 命令加 task_id

**Files:**
- Modify: `src-tauri/src/commands/ai.rs`

**Interfaces:**
- Produces: `call_ai` 新签名带 `task_id: String`，事件 payload 带 `task_id`

- [ ] **Step 1: Add task_id parameter + update event emission**

Read current file. Add `task_id: String` parameter. Change event emission to include `task_id` in the serialized JSON:

```rust
#[tauri::command]
pub async fn call_ai(
    app: AppHandle,
    registry: State<'_, Arc<ProviderRegistry>>,
    task_id: String,
    provider_id: String,
    prompt: String,
    config_json: String,
    continue_session: bool,
) -> Result<crate::services::ai::AiResponse, String> {
    let config: AiProviderConfig = serde_json::from_str(&config_json)
        .map_err(|e| format!("Invalid config JSON: {}", e))?;

    let provider = registry
        .get(&provider_id)
        .ok_or_else(|| format!("Unknown AI provider: {}", provider_id))?;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<AiEvent>();

    let request = AiRequest {
        prompt,
        provider_config: config,
        continue_session,
    };

    let app_handle = app.clone();
    let provider_clone = provider.clone();
    let tid = task_id.clone();

    let handle = tokio::spawn(async move {
        provider_clone.call_streaming(request, tx).await
    });

    while let Some(event) = rx.recv().await {
        let mut payload = serde_json::to_value(&event).unwrap_or_default();
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("task_id".to_string(), serde_json::Value::String(tid.clone()));
        }
        let _ = app_handle.emit("ai-stream", payload);
    }

    handle.await.map_err(|e| format!("Task join error: {}", e))?
}
```

- [ ] **Step 2: Verify cargo check**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -3`
Expected: no errors (only pre-existing warnings)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/ai.rs
git commit -m "feat(ai): add task_id parameter to call_ai command"
```

---

### Task 2: Rust 后端 - run_test_gen 命令加 task_id

**Files:**
- Modify: `src-tauri/src/commands/testgen.rs` (TestGenRequest)
- Modify: `src-tauri/src/services/testgen/runner.rs` (事件转发)

**Interfaces:**
- Consumes: `call_ai` 新签名（已有 task_id）
- Produces: `run_test_gen` 新签名带 `task_id`，AI 事件同时发 `ai-stream`

- [ ] **Step 1: Add task_id to TestGenRequest**

In `src-tauri/src/services/testgen/runner.rs`, add field to `TestGenRequest`:
```rust
#[serde(default)]
pub task_id: Option<String>,
```

- [ ] **Step 2: Forward AI events as ai-stream in runner.rs**

In `runner.rs` the AI streaming loop, when forwarding AiEvent to `testgen-stream`, also emit to `ai-stream` with `task_id`:

In the AI provider branch (where `AiEvent` variants are matched), add after the existing `app.emit("testgen-stream", ...)`:

```rust
// Also forward to ai-stream with task_id for AiTaskCenter
if let Some(ref tid) = req.task_id {
    let mut ai_payload = serde_json::json!({
        "task_id": tid,
        "kind": match event {
            AiEvent::Progress { .. } => "progress",
            AiEvent::Thinking { .. } => "thinking",
            AiEvent::TextDelta { .. } => "text",
            AiEvent::Done => "done",
        }
    });
    // merge event fields
    match &event {
        AiEvent::Progress { stage, message } => {
            ai_payload["stage"] = serde_json::Value::String(stage.clone());
            ai_payload["message"] = serde_json::Value::String(message.clone());
        }
        AiEvent::Thinking { tokens } => {
            ai_payload["tokens"] = serde_json::json!(tokens);
        }
        AiEvent::TextDelta { text } => {
            ai_payload["text"] = serde_json::Value::String(text.clone());
        }
        AiEvent::Done => {}
    }
    let _ = app.emit("ai-stream", ai_payload);
}
```

- [ ] **Step 3: Update frontend API for run_test_gen**

In `src/lib/api/testgen.ts`, add `taskId` parameter to `runTestGen()`:

```typescript
export async function runTestGen(config: TestGenRequest & { taskId?: string }): Promise<TestGenResult> {
  return invoke<TestGenResult>("run_test_gen", { req: { ...config, task_id: config.taskId } });
}
```

- [ ] **Step 4: Verify cargo check + tsc**

Run:
- `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -3`
- `npx tsc --noEmit 2>&1 | grep "error TS" | head -5`

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/testgen.rs src-tauri/src/services/testgen/runner.rs src/lib/api/testgen.ts
git commit -m "feat(ai): add task_id to run_test_gen for AiTaskCenter routing"
```

---

### Task 3: 前端 - AiTaskCenter.tsx 替换 AiContext.tsx

**Files:**
- Create: `src/lib/AiTaskCenter.tsx`
- Delete: `src/lib/AiContext.tsx`

**Interfaces:**
- Consumes: `callAi()` from `src/lib/api/ai.ts`
- Produces: `AiTaskCenterProvider`, `useAiTaskCenter()` hook, `AiTask`, `AiTaskRequest`

- [ ] **Step 1: Create `src/lib/AiTaskCenter.tsx`**

Full file content:

```tsx
import { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { RefreshCw, Minus, X, Bot } from "lucide-react";
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
            // status set by caller via setTaskStatus
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

  const value: AiTaskCenterValue = {
    tasks: tasksArray, panelOpen, setPanelOpen,
    detailTaskId, openDetail: setDetailTaskId, closeDetail: () => setDetailTaskId(null),
    startTask, removeTask, clearDone, getTask,
    updateTaskFromStream: () => {}, // handled by global listener
    appendTaskLog: () => {},
    setTaskStatus: () => {},
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
```

- [ ] **Step 2: Update `src/lib/api/ai.ts` callAi signature**

Add `taskId` field:
```typescript
export async function callAi(params: {
  providerId: string;
  prompt: string;
  configJson: string;
  continueSession: boolean;
  taskId: string;
}): Promise<AiResponse> {
  return invoke<AiResponse>("call_ai", {
    providerId: params.providerId,
    prompt: params.prompt,
    configJson: params.configJson,
    continueSession: params.continueSession,
    taskId: params.taskId,
  });
}
```

- [ ] **Step 3: Verify tsc**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | head -5`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/AiTaskCenter.tsx src/lib/api/ai.ts
git rm src/lib/AiContext.tsx
git commit -m "feat(ai): replace AiContext with AiTaskCenter (multi-task support)"
```

---

### Task 4: App.tsx 换 Provider

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `AiTaskCenterProvider` from `src/lib/AiTaskCenter.tsx`
- Removes: `AiProvider` import

- [ ] **Step 1: Replace import and provider**

Change line 11:
```typescript
import { AiProvider } from "@/lib/AiContext";
```
to:
```typescript
import { AiTaskCenterProvider } from "@/lib/AiTaskCenter";
```

Replace all `<AiProvider>` with `<AiTaskCenterProvider>` and `</AiProvider>` with `</AiTaskCenterProvider>`.

There are two places: the setup wizard branch (line 78, 84) and main app branch (line 91, 133).

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | head -5`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ai): wire AiTaskCenterProvider in App.tsx"
```

---

### Task 5: TestGenPage - AiSelector 提到显眼位置 + 接入任务中心

**Files:**
- Modify: `src/pages/TestGenPage.tsx`

**Interfaces:**
- Consumes: `useAiTaskCenter()` from `src/lib/AiTaskCenter.tsx`
- Removes: AiSelector from collapsed `<details>`

- [ ] **Step 1: Read current TestGenPage structure**

Key sections:
- Line 316-334: `<details>` with AiSelector hidden inside
- Line 338: Execute button
- Lines 177-203: `buildConfig()` and execution flow
- Import line 5: AiSelector already imported
- Import lines 6-7: ai query hooks already imported

- [ ] **Step 2: Move AiSelector to toolbar beside execute button**

Remove the existing AiSelector from the `<details>` block (lines 326-332). Add it to the toolbar row with the execute button:

After the execute button (around line 338), restructure the toolbar:

```tsx
<div className="flex items-center gap-2">
  <AiSelector value={aiProvider} onChange={setAiProvider} showModel={false} />
  <button onClick={onExecuteClick} disabled={!canRun || runStatus === "running"} className="flex items-center gap-1 h-8 px-3 text-xs bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50">
    <Play className="w-3.5 h-3.5" /> 执行
  </button>
</div>
```

Also remove the old AiSelector and its label from `<details>`:
- Remove lines 326-332

- [ ] **Step 3: Add useAiTaskCenter import and hook**

```typescript
import { useAiTaskCenter } from "../lib/AiTaskCenter";
```

Inside component:
```typescript
const atc = useAiTaskCenter();
```

- [ ] **Step 4: Wire task_id into buildConfig**

In `buildConfig()`:
```typescript
const buildConfig = () => ({
  ...
  task_id: undefined as string | undefined, // filled at exec time
});
```

In the execute flow, generate task_id and set it:
```typescript
const taskId = atc.startTask({
  type: "testgen",
  providerId: aiProvider.id,
  providerConfig: aiProvider,
  prompt: prompt,
});
// Pass taskId to runTestGen
tg.startRun({ ...buildConfig(), taskId: taskId } as any, false);
```

Wait — this is tricky because TestGen's AI call is embedded in Rust `run_test_gen`. The task center can't directly start the AI call for TestGen. Instead:
1. TestGenContext handles the git/mvn flow as before
2. The task_id is passed to `run_test_gen` which emits `ai-stream` events with that task_id
3. AiTaskCenter creates a "placeholder" task entry that gets updated by the stream events

So in the execute flow:
```typescript
const taskId = genTaskId(); // or use a simple function
const newTask: AiTask = { id: taskId, type: "testgen", ... };
// Add task to the center's map (via a method we add)
atc.addTask(newTask);
// Pass taskId to runTestGen
tg.startRun({ ...buildConfig() as any, taskId }, false);
```

Actually, we need a simpler approach. Add an `addExternalTask` method to AiTaskCenterValue that allows externally-managed tasks:

```typescript
// In AiTaskCenter.tsx
const addExternalTask = useCallback((task: AiTask) => {
  setTasks((prev) => new Map(prev).set(task.id, task));
  setPanelOpen(true);
}, []);
```

Then in TestGenPage:
```typescript
const taskId = `testgen-${Date.now()}`;
atc.addExternalTask({
  id: taskId, type: "testgen",
  providerId: aiProvider.id, providerName: aiProvider.id,
  status: "running", logs: [], streamText: "", thinkingTokens: null,
  result: null, error: null, createdAt: Date.now(),
});
tg.startRun({ ...buildConfig() as any, taskId }, false);
```

The Rust side's `ai-stream` events with `task_id` will update this task automatically.

Let me add this to the plan.

- [ ] **Step 5: Verify tsc**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | head -5`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/pages/TestGenPage.tsx
git commit -m "feat(ai): move AiSelector to TestGen toolbar + wire task center"
```

---

### Task 6: ActivityTrackerPage - AiSelector 提到显眼位置 + 接入任务中心 + 删除 ReportGenModal

**Files:**
- Modify: `src/pages/ActivityTrackerPage.tsx`

**Interfaces:**
- Consumes: `useAiTaskCenter()` from `src/lib/AiTaskCenter.tsx`
- Removes: `ReportGenModal` component, old `GenStatus`/`GenLog` state

- [ ] **Step 1: Add AiSelector in report toolbar**

Read the report toolbar area (lines 980-1025). Add AiSelector before the generate button:

```tsx
import { AiSelector } from "@/components/modules/ai/AiSelector";
import { useAiProvidersConfig, getProviderConfig, useDefaultProviderId } from "@/lib/query/aiQueries";
import { useAiTaskCenter } from "@/lib/AiTaskCenter";
import type { AiProviderConfig } from "@/lib/api/ai";
```

In the component that has the report toolbar, add:
```typescript
const providersConfig = useAiProvidersConfig();
const defaultProviderId = useDefaultProviderId();
const [aiProvider, setAiProvider] = useState<AiProviderConfig>(
  () => getProviderConfig(providersConfig, defaultProviderId) ?? providersConfig.providers[0]
);
const atc = useAiTaskCenter();
```

Insert AiSelector in the toolbar between the template select and the generate button:

```tsx
<AiSelector value={aiProvider} onChange={setAiProvider} showModel={true} />
```

- [ ] **Step 2: Wire task center into report generation**

Replace the `onGenerate` callback's direct `generateReport()` call. Instead of calling the Rust `generate_report` command directly, use `atc.startTask()`:

```typescript
const confirmGenerate = () => {
  setGenConfirm(false);
  const range = computeRange();
  const prompt = ""; // The prompt is built on the Rust side for reports
  atc.startTask({
    type: genType === "daily" ? "daily_report" : genType === "weekly" ? "weekly_report" : "monthly_report",
    providerId: aiProvider.id,
    providerConfig: aiProvider,
    prompt: "", // prompt built by Rust reporter
  });
  // Still call the existing generateReport for the Rust-side logic
  // but Rust now uses the ai module internally
  onGenerate(genType, computeRange(), selectedTemplateId);
};
```

Actually, for reports the Rust side handles prompt building. The frontend still calls `generateReport` which now uses the AI module internally. But we also want AiTaskCenter to track it...

The simplest approach: 
1. Frontend creates a task in AiTaskCenter (placeholder)
2. Frontend calls `generateReport` with `taskId` and `aiProvider` info
3. Rust emits `ai-stream` events with that `taskId`

Need to update `generateReport` to accept `taskId`:

In `src/lib/api/activity.ts`:
```typescript
export async function generateReport(params: {
  ...
  taskId?: string;
  providerConfigJson?: string;
  providerId?: string;
}): Promise<...> {
```

In `src-tauri/src/commands/activity_tracker.rs`, the `generate_report` command reads these new params and emits `ai-stream` with `taskId`.

Let me simplify: since the Rust `generate_report` already handles everything internally, just pass `taskId` through and have it emit `ai-stream` events. The frontend creates the placeholder task.

- [ ] **Step 3: Update generateReport API and Rust command**

In `src/lib/api/activity.ts`:
```typescript
export async function generateReport(params: {
  reportType: string; rangeStart: number; rangeEnd: number;
  summaryMethod: string; summaryTool?: string; apiKey?: string;
  model?: string; templateId?: string;
  taskId?: string;
}): Promise<...> {
  return invoke("generate_report", {
    reportType: params.reportType, rangeStart: params.rangeStart,
    rangeEnd: params.rangeEnd, summaryMethod: params.summaryMethod,
    summaryTool: params.summaryTool ?? null, apiKey: params.apiKey ?? null,
    model: params.model ?? null, templateId: params.templateId ?? null,
    taskId: params.taskId ?? null,
  });
}
```

In `src-tauri/src/commands/activity_tracker.rs` `generate_report`, add `task_id` parameter and in the AI branch emit `ai-stream` with task_id alongside existing events.

- [ ] **Step 4: Delete ReportGenModal**

Remove the entire `ReportGenModal` function (lines 730-846).
Remove GenStatus/GenLog state variables from the calling component.
Remove `report-gen-progress` and `report-gen-stream` event listeners.

- [ ] **Step 5: Remove AiSelector from Settings tab**

In `ToolSettings`, remove lines 1282-1302 (the AI summary method section). Keep the auto-report toggle.

- [ ] **Step 6: Verify tsc + cargo check**

Run both:
- `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -3`
- `npx tsc --noEmit 2>&1 | grep "error TS" | head -5`

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/pages/ActivityTrackerPage.tsx src/lib/api/activity.ts src-tauri/src/commands/activity_tracker.rs
git commit -m "feat(ai): move AiSelector to Activity toolbar + wire task center + remove ReportGenModal"
```

---

### Task 7: E2E 验证

- [ ] **Step 1: cargo check**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -3`
Expected: no errors

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | head -5`
Expected: no errors

- [ ] **Step 3: Full build**

Run: `npm run build 2>&1 | tail -5`
Expected: ✓ built

- [ ] **Step 4: Commit**

```bash
git add -A
git diff --cached --stat
git commit -m "chore: final verification pass for AI task center"
```
