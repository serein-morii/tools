import { useState, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { FlaskConical, FolderOpen, Play, Minus, X, RefreshCw } from "lucide-react";
import { useSettings, useUpdateSetting, getSettingValue } from "../lib/query/settingsQueries";
import {
  validateGitRepo,
  listGitBranches,
  runTestGen,
  pushBranch,
  type RepoInfo,
  type BranchInfo,
  type TestGenResult,
} from "../lib/api/testgen";

function ConfirmDialog({
  open, title, description, confirmText = "确定", cancelText = "取消", danger = false, onConfirm, onCancel,
}: {
  open: boolean; title: string; description?: ReactNode; confirmText?: string; cancelText?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg shadow-xl w-[380px] max-w-[calc(100vw-32px)] overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 text-sm font-semibold">{title}</div>
        {description && <div className="px-4 py-3 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{description}</div>}
        <div className="px-4 py-3 border-t border-border/50 bg-muted/30 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary">{cancelText}</button>
          <button onClick={onConfirm} className={`px-3 py-1.5 text-xs rounded-md text-white ${danger ? "bg-red-500 hover:opacity-90" : "bg-primary hover:opacity-90"}`}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

type RunStatus = "idle" | "running" | "done" | "error";
interface RunLog { time: number; stage: string; text: string }

export default function TestGenPage() {
  const loc = useLocation();
  const presetPrompt = (loc.state as { prompt?: string } | null)?.prompt ?? "";
  const [prompt, setPrompt] = useState(presetPrompt);

  const { data: settings } = useSettings();
  const updateSetting = useUpdateSetting();
  const getVal = (k: string, fb: string) => getSettingValue(settings, k, fb);
  const setSetting = (k: string, v: string) => updateSetting.mutate({ key: k, value: v });

  const [dir, setDir] = useState("");
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [baseBranch, setBaseBranch] = useState("");
  const [branchMode, setBranchMode] = useState<"new" | "direct">("new");
  const [newBranchName, setNewBranchName] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [pushConfirmSkip, setPushConfirmSkip] = useState(false); // false = 需确认
  const [mvnLocalRepo, setMvnLocalRepo] = useState(() => getVal("testgen_mvn_local_repo", ""));
  const [mvnSettingsXml, setMvnSettingsXml] = useState(() => getVal("testgen_mvn_settings_xml", ""));

  useEffect(() => {
    setMvnLocalRepo(getVal("testgen_mvn_local_repo", ""));
    setMvnSettingsXml(getVal("testgen_mvn_settings_xml", ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // Execution state
  const [runOpen, setRunOpen] = useState(false);
  const [runMinimized, setRunMinimized] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runLogs, setRunLogs] = useState<RunLog[]>([]);
  const [runThinking, setRunThinking] = useState<number | null>(null);
  const [runText, setRunText] = useState("");
  const [result, setResult] = useState<TestGenResult | null>(null);
  const [pushConfirm, setPushConfirm] = useState(false);
  const [execConfirm, setExecConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const appendLog = (stage: string, text: string) => setRunLogs((p) => [...p, { time: Date.now(), stage, text }]);

  const [displayedText, setDisplayedText] = useState("");
  useEffect(() => {
    if (!runText) { setDisplayedText(""); return; }
    setDisplayedText("");
    let i = 0; const total = runText.length; const step = Math.max(2, Math.ceil(total / 240));
    const id = setInterval(() => { i += step; if (i >= total) { setDisplayedText(runText); clearInterval(id); } else setDisplayedText(runText.slice(0, i)); }, 16);
    return () => clearInterval(id);
  }, [runText]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [runLogs, displayedText, runThinking]);

  const canRun = !!prompt.trim() && !!dir && !!baseBranch && !!commitMessage.trim() && !!repoInfo?.is_repo && !!repoInfo?.clean;

  const maybeAskPush = (res: TestGenResult) => {
    if (res.commit_sha && !res.pushed && !res.error) setPushConfirm(true);
  };

  const startRun = async () => {
    setRunLogs([]); setRunThinking(null); setRunText(""); setResult(null);
    setRunStatus("running"); setRunOpen(true); setRunMinimized(false);
    const up = await listen<{ stage: string; message: string }>("testgen-progress", (e) => appendLog(e.payload.stage, e.payload.message));
    const us = await listen<{ kind: string; text?: string; tokens?: number }>("testgen-stream", (e) => {
      if (e.payload.kind === "thinking") setRunThinking(e.payload.tokens ?? 0);
      else if (e.payload.kind === "text") setRunText(e.payload.text ?? "");
    });
    try {
      const res = await runTestGen({
        dir, base_branch: baseBranch, branch_mode: branchMode,
        new_branch_name: branchMode === "new" ? newBranchName || undefined : undefined,
        commit_message: commitMessage, prompt, push_confirm_skip: pushConfirmSkip,
        mvn_local_repo: mvnLocalRepo || undefined, mvn_settings_xml: mvnSettingsXml || undefined,
      });
      setResult(res);
      maybeAskPush(res);
      if (res.error && !res.commit_sha) {
        setRunStatus("error"); appendLog("error", res.error);
      } else if (res.error && res.commit_sha) {
        // committed but a later step (push) failed
        setRunStatus("error"); appendLog("error", `${res.error}（本地已提交 ${res.commit_sha}）`);
      } else {
        setRunStatus("done"); appendLog("done", `完成：分支 ${res.branch}，提交 ${res.commit_sha ?? "-"}，${res.files_changed} 文件，测试${res.test_passed ? "通过" : "失败"}${res.pushed ? "，已推送" : ""}`);
      }
    } catch (e) {
      setRunStatus("error"); appendLog("error", String(e));
    } finally { up(); us(); }
  };

  const onExecuteClick = () => setExecConfirm(true);
  const confirmExec = () => { setExecConfirm(false); startRun(); };

  const confirmPush = async () => {
    setPushConfirm(false);
    if (!result) return;
    appendLog("push", "确认推送...");
    try {
      const out = await pushBranch(dir, result.branch);
      setResult({ ...result, pushed: true, push_output: out });
      appendLog("push", "已推送");
    } catch (e) { appendLog("push", `推送失败: ${e}`); }
  };

  const pickDir = async () => {
    const p = await open({ directory: true, multiple: false });
    if (typeof p === "string" && p) {
      setDir(p);
      const info = await validateGitRepo(p);
      setRepoInfo(info);
      if (info.is_repo) {
        const bs = await listGitBranches(p);
        setBranches(bs);
        const cur = bs.find((b) => b.current)?.name ?? bs[0]?.name ?? "";
        setBaseBranch(cur);
      }
    }
  };

  const pickMvnDir = async () => {
    const p = await open({ directory: true, multiple: false });
    if (typeof p === "string" && p) { setMvnLocalRepo(p); setSetting("testgen_mvn_local_repo", p); }
  };
  const pickMvnFile = async () => {
    const p = await open({ multiple: false });
    if (typeof p === "string" && p) { setMvnSettingsXml(p); setSetting("testgen_mvn_settings_xml", p); }
  };

  const inputCls = "h-8 rounded-md border border-border bg-background px-2 text-sm";

  return (
    <div className="flex flex-col h-full p-5 gap-3 overflow-auto">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-primary" />
        <h1 className="text-base font-semibold">单测执行</h1>
      </div>

      {/* Prompt */}
      <div>
        <label className="text-xs text-muted-foreground">覆盖率 Prompt（可编辑）</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="从单测覆盖率页点「用 AI 执行」带入，或在此粘贴"
          className="w-full h-40 mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
        />
      </div>

      {/* 目录 */}
      <div>
        <label className="text-xs text-muted-foreground">项目目录</label>
        <div className="flex items-center gap-2 mt-1">
          <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="选择本地项目目录" className={`${inputCls} flex-1`} />
          <button onClick={pickDir} className="flex items-center gap-1 h-8 px-3 text-xs border border-border rounded-md hover:bg-secondary">
            <FolderOpen className="w-3.5 h-3.5" /> 选择
          </button>
        </div>
        {repoInfo && (
          <div className="text-[11px] text-muted-foreground mt-1">
            {repoInfo.is_repo ? `git 仓库 | 当前: ${repoInfo.current_branch ?? "?"} | ${repoInfo.clean ? "工作区干净" : "⚠ 工作区不干净"} | remote: ${repoInfo.remote ?? "无"}` : "⚠ 不是 git 仓库"}
          </div>
        )}
      </div>

      {/* 分支 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">基础分支</label>
          <select value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} className={`${inputCls} w-full mt-1`}>
            {branches.map((b) => <option key={b.name} value={b.name}>{b.name}{b.current ? " *" : ""}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">分支模式</label>
          <div className="flex gap-3 mt-1 text-xs items-center h-8">
            <label className="flex items-center gap-1"><input type="radio" checked={branchMode === "new"} onChange={() => setBranchMode("new")} /> 新建工作分支</label>
            <label className="flex items-center gap-1"><input type="radio" checked={branchMode === "direct"} onChange={() => setBranchMode("direct")} /> 在选中分支</label>
          </div>
        </div>
      </div>
      {branchMode === "new" && (
        <div>
          <label className="text-xs text-muted-foreground">新分支名</label>
          <input value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} placeholder="留空则自动 test/<提交名>" className={`${inputCls} w-full mt-1`} />
        </div>
      )}

      {/* 提交名 + push 开关 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">提交信息</label>
          <input value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} className={`${inputCls} w-full mt-1`} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">推送策略</label>
          <label className="flex items-center gap-1 mt-1 h-8 text-xs">
            <input type="checkbox" checked={pushConfirmSkip} onChange={(e) => setPushConfirmSkip(e.target.checked)} />
            跳过 push 确认（直接推送）
          </label>
        </div>
      </div>

      {/* mvn 配置 */}
      <details className="border border-border rounded-md p-2">
        <summary className="text-xs font-medium cursor-pointer">Maven 配置</summary>
        <div className="mt-2 space-y-2">
          <div>
            <label className="text-[11px] text-muted-foreground">本地仓库目录（-Dmaven.repo.local，同时告知 AI）</label>
            <div className="flex gap-2 mt-1">
              <input value={mvnLocalRepo} onChange={(e) => { setMvnLocalRepo(e.target.value); setSetting("testgen_mvn_local_repo", e.target.value); }} className={`${inputCls} flex-1`} />
              <button onClick={pickMvnDir} className="h-8 px-2 text-xs border border-border rounded-md hover:bg-secondary">选目录</button>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">settings.xml 路径（-s，可含 Nexus mirror）</label>
            <div className="flex gap-2 mt-1">
              <input value={mvnSettingsXml} onChange={(e) => { setMvnSettingsXml(e.target.value); setSetting("testgen_mvn_settings_xml", e.target.value); }} className={`${inputCls} flex-1`} />
              <button onClick={pickMvnFile} className="h-8 px-2 text-xs border border-border rounded-md hover:bg-secondary">选文件</button>
            </div>
          </div>
        </div>
      </details>

      <button onClick={onExecuteClick} disabled={!canRun || runStatus === "running"} className="flex items-center gap-1 self-start h-9 px-4 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50">
        <Play className="w-4 h-4" /> 执行
      </button>

      <ConfirmDialog open={execConfirm} title="执行单测生成" description={`目录：${dir}\n分支：${baseBranch}${branchMode === "new" ? `（新建 ${newBranchName || "test/..."}）` : ""}\n提交信息：${commitMessage}\n\n将调用 AI 写单测并跑 mvn test，确认继续？`} confirmText="开始" onCancel={() => setExecConfirm(false)} onConfirm={confirmExec} />
      <ConfirmDialog open={pushConfirm} title="确认推送" description={`已提交到 ${result?.branch}，是否推送到远程？`} confirmText="推送" onCancel={() => setPushConfirm(false)} onConfirm={confirmPush} />

      {runOpen && !runMinimized && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background border border-border rounded-lg w-[620px] max-w-[92vw] h-[460px] max-h-[82vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <RefreshCw className={`w-3.5 h-3.5 ${runStatus === "running" ? "animate-spin" : ""} text-primary`} />
                <span className="text-sm font-medium">单测执行过程</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setRunMinimized(true)} title="静默" className="p-1.5 rounded hover:bg-secondary"><Minus className="w-3.5 h-3.5" /></button>
                {runStatus !== "running" && <button onClick={() => setRunOpen(false)} className="p-1.5 rounded hover:bg-secondary"><X className="w-3.5 h-3.5" /></button>}
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-2 space-y-1 text-xs">
              {runLogs.map((l, i) => <div key={i} className="break-words"><span className="text-[10px] text-muted-foreground/70 mr-1">[{l.stage}]</span>{l.text}</div>)}
              {runThinking !== null && !runText && <div className="text-amber-500">思考中... {runThinking} tokens</div>}
              {displayedText && <div className="whitespace-pre-wrap break-words border-t border-border/40 pt-1">{displayedText}{displayedText.length < (runText?.length ?? 0) && <span className="animate-pulse">▍</span>}</div>}
              {result && runStatus !== "running" && (
                <div className="mt-2 pt-2 border-t border-border/40 text-xs space-y-0.5">
                  <div><span className="text-muted-foreground">分支：</span>{result.branch}</div>
                  {result.commit_sha && <div><span className="text-muted-foreground">提交：</span>{result.commit_sha}（{result.files_changed} 文件）</div>}
                  <div><span className="text-muted-foreground">测试：</span>{result.test_passed ? "✓ 通过" : "✗ 失败"}</div>
                  <div><span className="text-muted-foreground">推送：</span>{result.pushed ? "✓ 已推送" : result.commit_sha ? "未推送" : "—"}</div>
                  {result.error && <div className="text-red-500">错误：{result.error}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {runMinimized && (
        <button onClick={() => setRunMinimized(false)} className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-full shadow-lg">
          <RefreshCw className={`w-3.5 h-3.5 ${runStatus === "running" ? "animate-spin" : ""}`} />
          <span className="text-xs">{runStatus === "running" ? "执行中..." : runStatus === "done" ? "完成（点击查看）" : "失败（点击查看）"}</span>
        </button>
      )}
    </div>
  );
}
