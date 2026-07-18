import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { Minus, X, FlaskConical } from "lucide-react";
import { RefreshCw, Minus, X } from "lucide-react";
import {
  runTestGen,
  pushBranch,
  cancelTestGen,
  type TestGenRequest,
  type TestGenResult,
} from "./api/testgen";

export type RunStatus = "idle" | "running" | "done" | "error" | "awaiting_answer";
export interface RunLog { time: number; stage: string; text: string }

interface TestGenContextValue {
  runOpen: boolean; setRunOpen: (v: boolean) => void;
  runMinimized: boolean; setRunMinimized: (v: boolean) => void;
  runStatus: RunStatus;
  runLogs: RunLog[];
  appendLog: (stage: string, text: string) => void;
  runThinking: number | null;
  runText: string;
  displayedText: string;
  result: TestGenResult | null;
  pushConfirm: boolean; setPushConfirm: (v: boolean) => void;
  aiQuestion: string | null;
  aiAnswer: string; setAiAnswer: (v: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  lastConfigRef: React.MutableRefObject<TestGenRequest | null>;
  runId: number;
  startRun: (config: TestGenRequest, retry: boolean, failureExcerpt?: string, continueAnswer?: string) => Promise<void>;
  submitAnswer: () => void;
  confirmPush: (dir: string, branch: string) => Promise<void>;
}

const TestGenContext = createContext<TestGenContextValue | null>(null);

export function useTestGen() {
  const ctx = useContext(TestGenContext);
  if (!ctx) throw new Error("useTestGen must be used within TestGenProvider");
  return ctx;
}

export function TestGenProvider({ children }: { children: ReactNode }) {
  const [runOpen, setRunOpen] = useState(false);
  const [runMinimized, setRunMinimized] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runLogs, setRunLogs] = useState<RunLog[]>([]);
  const [runThinking, setRunThinking] = useState<number | null>(null);
  const [runText, setRunText] = useState("");
  const [displayedText, setDisplayedText] = useState("");
  const [result, setResult] = useState<TestGenResult | null>(null);
  const [pushConfirm, setPushConfirm] = useState(false);
  const [aiQuestion, setAiQuestion] = useState<string | null>(null);
  const [aiAnswer, setAiAnswer] = useState("");
  const [runId, setRunId] = useState(0); // increments on each run completion
  const scrollRef = useRef<HTMLDivElement>(null);

  const appendLog = useCallback((stage: string, text: string) => {
    setRunLogs((p) => [...p, { time: Date.now(), stage, text }]);
  }, []);

  // Typewriter effect
  useEffect(() => {
    if (!runText) { setDisplayedText(""); return; }
    setDisplayedText("");
    let i = 0; const total = runText.length; const step = Math.max(2, Math.ceil(total / 240));
    const id = setInterval(() => { i += step; if (i >= total) { setDisplayedText(runText); clearInterval(id); } else setDisplayedText(runText.slice(0, i)); }, 16);
    return () => clearInterval(id);
  }, [runText]);

  // Auto-scroll
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [runLogs, displayedText, runThinking]);

  const startRun = useCallback(async (config: TestGenRequest, retry: boolean, failureExcerpt?: string, continueAnswer?: string) => {
    const isContinue = !!continueAnswer;
    if (!isContinue) { setRunLogs([]); setRunText(""); setResult(null); lastConfigRef.current = config; }
    setRunThinking(null);
    setRunStatus("running"); setRunOpen(true); setRunMinimized(false);
    const up = await listen<{ stage: string; message: string }>("testgen-progress", (e) => appendLog(e.payload.stage, e.payload.message));
    const us = await listen<{ kind: string; text?: string; tokens?: number }>("testgen-stream", (e) => {
      if (e.payload.kind === "thinking") setRunThinking(e.payload.tokens ?? 0);
      else if (e.payload.kind === "text") setRunText(e.payload.text ?? "");
    });
    try {
      const res = await runTestGen({
        ...config,
        prompt: isContinue ? continueAnswer! : config.prompt,
        retry,
        mvn_failure_excerpt: retry ? failureExcerpt : undefined,
        continue_session: isContinue,
      });
      setResult(res);
      if (res.ai_question) {
        setAiQuestion(res.ai_question);
        setRunStatus("awaiting_answer");
        appendLog("ai", "AI 有问题需要回答");
        return;
      }
      if (res.commit_sha && !res.pushed && !res.error) setPushConfirm(true);
      if (res.error && !res.commit_sha) { setRunStatus("error"); appendLog("error", res.error); }
      else if (res.error && res.commit_sha) { setRunStatus("error"); appendLog("error", `${res.error}（本地已提交 ${res.commit_sha}）`); }
      else { setRunStatus("done"); appendLog("done", `完成：分支 ${res.branch}，提交 ${res.commit_sha ?? "-"}，${res.files_changed} 文件，测试${res.test_passed ? "通过" : "失败"}${res.pushed ? "，已推送" : ""}`); }
    } catch (e) {
      setRunStatus("error"); appendLog("error", String(e));
    } finally { up(); us(); setRunId((n) => n + 1); }
  }, [appendLog]);

  // Store last config so answer/push can reuse it
  const lastConfigRef = useRef<TestGenRequest | null>(null);

  const submitAnswer = useCallback(() => {
    if (!aiAnswer.trim()) return;
    const config = lastConfigRef.current;
    if (!config) return;
    const answer = aiAnswer;
    setAiQuestion(null);
    setAiAnswer("");
    appendLog("ai", `> ${answer}`);
    startRun(config, false, undefined, answer);
  }, [aiAnswer, appendLog, startRun]);

  const confirmPush = useCallback(async (dir: string, branch: string) => {
    setPushConfirm(false);
    if (!result) return;
    appendLog("push", "确认推送...");
    try {
      const out = await pushBranch(dir, branch);
      setResult({ ...result, pushed: true, push_output: out });
      appendLog("push", "已推送");
    } catch (e) { appendLog("push", `推送失败: ${e}`); }
  }, [result, appendLog]);

  const value: TestGenContextValue = {
    runOpen, setRunOpen, runMinimized, setRunMinimized,
    runStatus, runLogs, appendLog,
    runThinking, runText, displayedText,
    result, pushConfirm, setPushConfirm,
    aiQuestion, aiAnswer, setAiAnswer,
    scrollRef, startRun, submitAnswer, confirmPush,
    lastConfigRef, runId,
  };

  return (
    <TestGenContext.Provider value={value}>
      {children}
      <TestGenPanel />
    </TestGenContext.Provider>
  );
}

/** Global execution panel + floating minimized button */
function TestGenPanel() {
  const ctx = useContext(TestGenContext)!;
  const { runOpen, setRunOpen, runMinimized, setRunMinimized, runStatus, runLogs, runThinking, runText, displayedText, result, aiQuestion, aiAnswer, setAiAnswer, scrollRef, submitAnswer } = ctx;

  return (
    <>
      {runOpen && !runMinimized && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background border border-emerald-500/30 rounded-lg w-[620px] max-w-[92vw] h-[460px] max-h-[82vh] flex flex-col shadow-xl shadow-emerald-500/5">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-emerald-500/20 bg-emerald-500/[0.03]">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/10">
                  <FlaskConical className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <span className="text-sm font-medium">单测执行过程</span>
              </div>
          <div className="bg-background border border-border rounded-lg w-[620px] max-w-[92vw] h-[460px] max-h-[82vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2"><RefreshCw className={`w-3.5 h-3.5 ${runStatus === "running" ? "animate-spin" : ""} text-primary`} /><span className="text-sm font-medium">单测执行过程</span></div>
              <div className="flex gap-1">
                {runStatus === "running" && <button onClick={() => cancelTestGen()} className="px-2 py-1 text-xs text-emerald-600 hover:text-emerald-700 rounded hover:bg-emerald-500/10">取消</button>}
                {runStatus === "running" && <button onClick={() => cancelTestGen()} className="px-2 py-1 text-xs text-red-500 hover:text-red-600 rounded hover:bg-secondary">取消</button>}
                <button onClick={() => setRunMinimized(true)} className="p-1.5 rounded hover:bg-secondary"><Minus className="w-3.5 h-3.5" /></button>
                {runStatus !== "running" && <button onClick={() => setRunOpen(false)} className="p-1.5 rounded hover:bg-secondary"><X className="w-3.5 h-3.5" /></button>}
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-2 space-y-1 text-xs">
              {runLogs.map((l, i) => <div key={i} className="break-words"><span className="text-[10px] text-muted-foreground/70 mr-1">[{l.stage}]</span>{l.text}</div>)}
              {runThinking !== null && !runText && <div className="text-amber-500">思考中... {runThinking} tokens</div>}
              {displayedText && <div className="whitespace-pre-wrap break-words border-t border-border/40 pt-1">{displayedText}{displayedText.length < (runText?.length ?? 0) && <span className="animate-pulse">▍</span>}</div>}
              {runStatus === "awaiting_answer" && aiQuestion && (
                <div className="mt-2 pt-2 border-t border-amber-500/30 space-y-2">
                  <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                    <p className="text-xs font-medium text-amber-600 mb-1">🤖 AI 提问</p>
                    <p className="text-xs text-foreground whitespace-pre-wrap">{aiQuestion}</p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={aiAnswer}
                      onChange={(e) => setAiAnswer(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitAnswer(); }}
                      placeholder="输入你的回答，按 Enter 发送..."
                      className="flex-1 h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                    />
                    <button onClick={submitAnswer} disabled={!aiAnswer.trim()} className="h-8 px-3 text-xs bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50">
                      发送
                    </button>
                  </div>
                </div>
              )}
              {result && runStatus !== "running" && runStatus !== "awaiting_answer" && (
                <div className="mt-2 pt-2 border-t border-emerald-500/20 text-xs space-y-0.5 bg-emerald-500/[0.02] -mx-4 px-4 pb-3">
                <div className="mt-2 pt-2 border-t border-border/40 text-xs space-y-0.5">
                  <div><span className="text-muted-foreground">分支：</span>{result.branch}</div>
                  {result.commit_sha && <div><span className="text-muted-foreground">提交：</span>{result.commit_sha}（{result.files_changed} 文件）</div>}
                  <div><span className="text-muted-foreground">测试：</span>{result.test_passed ? "✓ 通过" : "✗ 失败"}</div>
                  <div><span className="text-muted-foreground">推送：</span>{result.pushed ? "✓ 已推送" : result.commit_sha ? "未推送" : "-"}</div>
                  {result.error && <div className="text-red-500">错误：{result.error}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {runMinimized && (
        <button onClick={() => setRunMinimized(false)} className="fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
          <FlaskConical className="w-3.5 h-3.5" />
          <span className="text-xs">{runStatus === "running" ? "单测执行中..." : runStatus === "done" ? "单测完成 ✓" : runStatus === "awaiting_answer" ? "AI 提问中..." : "单测失败 ✗"}</span>
        <button onClick={() => setRunMinimized(false)} className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-full shadow-lg">
          <RefreshCw className={`w-3.5 h-3.5 ${runStatus === "running" ? "animate-spin" : ""}`} />
          <span className="text-xs">{runStatus === "running" ? "执行中..." : runStatus === "done" ? "完成（点击查看）" : runStatus === "awaiting_answer" ? "AI 提问中..." : "失败（点击查看）"}</span>
        </button>
      )}
    </>
  );
}
