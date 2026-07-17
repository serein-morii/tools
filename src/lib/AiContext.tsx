import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { RefreshCw, Minus, X } from "lucide-react";
import { callAi, type AiProviderConfig, type AiResponse } from "./api/ai";
import { useMigrateAiSettings } from "@/lib/query/aiQueries";

export type RunStatus = "idle" | "running" | "done" | "error";

export interface AiLog {
  time: number;
  stage: string;
  text: string;
}

export interface AiCallRequest {
  providerId: string;
  providerConfig: AiProviderConfig;
  prompt: string;
  continueSession?: boolean;
  onDone?: (result: AiResponse) => void;
  onError?: (error: string) => void;
}

interface AiContextValue {
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  panelMinimized: boolean;
  setPanelMinimized: (v: boolean) => void;
  status: RunStatus;
  logs: AiLog[];
  appendLog: (stage: string, text: string) => void;
  thinkingTokens: number | null;
  streamText: string;
  displayedText: string;
  currentProviderName: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  startRun: (req: AiCallRequest) => Promise<void>;
  runId: number;
}

const AiContext = createContext<AiContextValue | null>(null);

export function useAi() {
  const ctx = useContext(AiContext);
  if (!ctx) throw new Error("useAi must be used within AiProvider");
  return ctx;
}

export function AiProvider({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [logs, setLogs] = useState<AiLog[]>([]);
  const [thinkingTokens, setThinkingTokens] = useState<number | null>(null);
  const [streamText, setStreamText] = useState("");
  const [displayedText, setDisplayedText] = useState("");
  const [currentProviderName, setCurrentProviderName] = useState("");
  const [runId, setRunId] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useMigrateAiSettings();

  const appendLog = useCallback((stage: string, text: string) => {
    setLogs((p) => [...p, { time: Date.now(), stage, text }]);
  }, []);

  // Typewriter effect
  useEffect(() => {
    if (!streamText) { setDisplayedText(""); return; }
    setDisplayedText("");
    let i = 0;
    const total = streamText.length;
    const step = Math.max(2, Math.ceil(total / 240));
    const id = setInterval(() => {
      i += step;
      if (i >= total) { setDisplayedText(streamText); clearInterval(id); }
      else setDisplayedText(streamText.slice(0, i));
    }, 16);
    return () => clearInterval(id);
  }, [streamText]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs, displayedText, thinkingTokens]);

  const startRun = useCallback(async (req: AiCallRequest) => {
    setLogs([]);
    setStreamText("");
    setThinkingTokens(null);
    setStatus("running");
    setPanelOpen(true);
    setPanelMinimized(false);
    setCurrentProviderName(req.providerConfig.id);

    appendLog("start", `AI Provider: ${req.providerConfig.id}`);
    appendLog("prompt", `Prompt length: ${req.prompt.length} chars`);

    const unlisten = await listen<{ kind: string; stage?: string; message?: string; tokens?: number; text?: string }>(
      "ai-stream",
      (e) => {
        switch (e.payload.kind) {
          case "progress":
            appendLog(e.payload.stage ?? "info", e.payload.message ?? "");
            break;
          case "thinking":
            setThinkingTokens(e.payload.tokens ?? 0);
            break;
          case "text":
            setStreamText(e.payload.text ?? "");
            break;
          case "done":
            break;
        }
      }
    );

    try {
      const result = await callAi({
        providerId: req.providerId,
        prompt: req.prompt,
        configJson: JSON.stringify(req.providerConfig),
        continueSession: req.continueSession ?? false,
      });
      setStatus("done");
      appendLog("done", "AI 调用完成");
      req.onDone?.(result);
    } catch (e) {
      setStatus("error");
      const msg = String(e);
      appendLog("error", msg);
      req.onError?.(msg);
    } finally {
      unlisten();
      setRunId((n) => n + 1);
    }
  }, [appendLog]);

  const value: AiContextValue = {
    panelOpen, setPanelOpen,
    panelMinimized, setPanelMinimized,
    status, logs, appendLog,
    thinkingTokens, streamText, displayedText,
    currentProviderName,
    scrollRef,
    startRun, runId,
  };

  return (
    <AiContext.Provider value={value}>
      {children}
      <AiPanel />
    </AiContext.Provider>
  );
}

function AiPanel() {
  const ctx = useContext(AiContext)!;
  const { panelOpen, setPanelOpen, panelMinimized, setPanelMinimized, status, logs, thinkingTokens, streamText, displayedText, currentProviderName, scrollRef } = ctx;

  return (
    <>
      {panelOpen && !panelMinimized && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background border border-border rounded-lg w-[620px] max-w-[92vw] h-[460px] max-h-[82vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <RefreshCw className={`w-3.5 h-3.5 ${status === "running" ? "animate-spin" : ""} text-primary`} />
                <span className="text-sm font-medium">AI 执行过程</span>
                {currentProviderName && (
                  <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{currentProviderName}</span>
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setPanelMinimized(true)} className="p-1.5 rounded hover:bg-secondary"><Minus className="w-3.5 h-3.5" /></button>
                {status !== "running" && (
                  <button onClick={() => setPanelOpen(false)} className="p-1.5 rounded hover:bg-secondary"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-2 space-y-1 text-xs">
              {logs.map((l, i) => (
                <div key={i} className="break-words">
                  <span className="text-[10px] text-muted-foreground/70 mr-1">[{l.stage}]</span>
                  {l.text}
                </div>
              ))}
              {thinkingTokens !== null && !streamText && (
                <div className="text-amber-500">思考中... {thinkingTokens} tokens</div>
              )}
              {displayedText && (
                <div className="whitespace-pre-wrap break-words border-t border-border/40 pt-1">
                  {displayedText}
                  {displayedText.length < (streamText?.length ?? 0) && <span className="animate-pulse">|</span>}
                </div>
              )}
              {status === "error" && (
                <div className="mt-2 pt-2 border-t border-red-500/30 text-red-500">执行失败，详见上方错误日志</div>
              )}
            </div>
          </div>
        </div>
      )}
      {panelMinimized && (
        <button
          onClick={() => setPanelMinimized(false)}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-full shadow-lg"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${status === "running" ? "animate-spin" : ""}`} />
          <span className="text-xs">
            {status === "running" ? "AI 执行中..."
              : status === "done" ? "AI 完成（点击查看）"
              : status === "error" ? "AI 失败（点击查看）"
              : "AI 面板"}
          </span>
        </button>
      )}
    </>
  );
}
