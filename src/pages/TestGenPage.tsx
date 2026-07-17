import { useState, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { FlaskConical, FolderOpen, Play, Search, RotateCw } from "lucide-react";
import { AiSelector } from "@/components/modules/ai/AiSelector";
import { useAiProvidersConfig, getProviderConfig, useDefaultProviderId } from "@/lib/query/aiQueries";
import type { AiProviderConfig } from "@/lib/api/ai";
import { useSettings, useUpdateSetting, getSettingValue } from "../lib/query/settingsQueries";
import {
  validateGitRepo,
  listGitBranches,
  pushBranch,
  scanProjects,
  getTestgenRuns,
  type RepoInfo,
  type BranchInfo,
  type ProjectEntry,
  type TestgenRun,
} from "../lib/api/testgen";
import { useTestGen } from "../lib/TestGenContext";

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

const PROTECTED_BRANCHES = ["main", "master", "develop", "dev", "release"];
const formatNow = () => {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const formatTs = (ms: number) => {
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function TestGenPage() {
  const loc = useLocation();
  const locState = loc.state as { prompt?: string; projectKey?: string; projectName?: string; branch?: string } | null;
  const presetPrompt = locState?.prompt ?? "";
  const fromProject = locState?.projectName || locState?.projectKey || null;
  const fromBranch = locState?.branch || null;
  const [prompt, setPrompt] = useState(presetPrompt);

  const { data: settings } = useSettings();
  const updateSetting = useUpdateSetting();
  const getVal = (k: string, fb: string) => getSettingValue(settings, k, fb);
  const setSetting = (k: string, v: string) => updateSetting.mutate({ key: k, value: v });

  // Project scanning
  const [projectRoot, setProjectRoot] = useState(() => getVal("testgen_project_root", ""));
  const [scannedProjects, setScannedProjects] = useState<ProjectEntry[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [dir, setDir] = useState("");
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [baseBranch, setBaseBranch] = useState("");

  const [branchMode, setBranchMode] = useState<"new" | "direct">("direct");
  const [newBranchName, setNewBranchName] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [pushConfirmSkip, setPushConfirmSkip] = useState(false);
  const [commitOnlyIfPass, setCommitOnlyIfPass] = useState(() => getVal("testgen_commit_only_if_pass", "true") === "true");
  const [mvnLocalRepo, setMvnLocalRepo] = useState(() => getVal("testgen_mvn_local_repo", ""));
  const [mvnSettingsXml, setMvnSettingsXml] = useState(() => getVal("testgen_mvn_settings_xml", ""));
  const [mvnExtraArgs, setMvnExtraArgs] = useState("");
  const [claudeCommand, setClaudeCommand] = useState(() => getVal("testgen_claude_command", ""));

  // AI provider
  const providersConfig = useAiProvidersConfig();
  const defaultProviderId = useDefaultProviderId();
  const [aiProvider, setAiProvider] = useState<AiProviderConfig>(
    () => getProviderConfig(providersConfig, defaultProviderId) || providersConfig.providers[0]
  );

  // Execution state from global context
  const tg = useTestGen();
  const { runStatus, result, setPushConfirm } = tg;

  // Local confirm dialogs
  const [execConfirm, setExecConfirm] = useState(false);

  // History
  const [history, setHistory] = useState<TestgenRun[]>([]);
  // Tab
  const [activeTab, setActiveTab] = useState("exec");
  const tabs = [
    { id: "exec", label: "执行" },
    { id: "history", label: "记录" },
  ];

  // Default commit message on mount
  useEffect(() => { setCommitMessage((prev) => prev || `【单测】${formatNow()}`); }, []);
  // Scan projects when root changes
  const doScan = async (root: string) => {
    if (!root.trim()) { setScannedProjects([]); return; }
    try { setScannedProjects(await scanProjects(root.trim())); } catch (_) { setScannedProjects([]); }
  };
  useEffect(() => { doScan(projectRoot); }, [projectRoot]);
  // Load history
  const loadHistory = async () => { try { setHistory(await getTestgenRuns(30)); } catch (_) {} };
  useEffect(() => { loadHistory(); }, []);
  useEffect(() => { if (activeTab === "history") loadHistory(); }, [activeTab]);
  useEffect(() => { loadHistory(); }, [tg.runId]); // reload after each run completes

  const pickProjectRoot = async () => {
    const p = await open({ directory: true, multiple: false });
    if (typeof p === "string" && p) { setProjectRoot(p); setSetting("testgen_project_root", p); }
  };

  const branchWarn = branchMode === "direct" && PROTECTED_BRANCHES.includes(baseBranch);
  const canRun = !!prompt.trim() && !!dir && !!baseBranch && !!commitMessage.trim() && !!repoInfo?.is_repo && !!repoInfo?.clean;

  const filteredProjects = projectSearch.trim()
    ? scannedProjects.filter((p) => p.name.toLowerCase().includes(projectSearch.toLowerCase()) || p.path.toLowerCase().includes(projectSearch.toLowerCase()))
    : scannedProjects;
  const shownProjects = filteredProjects.slice(0, 30);

  const selectProject = async (p: ProjectEntry) => {
    setDir(p.path);
    setProjectSearch(p.name);
    const info = await validateGitRepo(p.path);
    setRepoInfo(info);
    if (info.is_repo) {
      const bs = await listGitBranches(p.path);
      setBranches(bs);
      // 优先匹配传入的分支，否则用当前分支
      const targetBranch = fromBranch ? bs.find(b => b.name === fromBranch) : undefined;
      setBaseBranch(targetBranch?.name ?? bs.find((b) => b.current)?.name ?? bs[0]?.name ?? "");
    }
  };

  // 从 Sonar 跳转过来时，自动匹配项目并填充
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current || !fromProject || scannedProjects.length === 0) return;
    const match = scannedProjects.find(p =>
      p.name === fromProject ||
      p.name.toLowerCase().includes(fromProject.toLowerCase()) ||
      fromProject.toLowerCase().includes(p.name.toLowerCase())
    );
    if (match) {
      autoSelectedRef.current = true;
      selectProject(match);
    }
  }, [scannedProjects, fromProject]);

  const onManualDir = async () => {
    const p = await open({ directory: true, multiple: false });
    if (typeof p === "string" && p) {
      setDir(p); setProjectSearch("");
      const info = await validateGitRepo(p);
      setRepoInfo(info);
      if (info.is_repo) {
        const bs = await listGitBranches(p);
        setBranches(bs);
        setBaseBranch(bs.find((b) => b.current)?.name ?? bs[0]?.name ?? "");
      }
    }
  };

  const buildConfig = () => ({
    dir, base_branch: baseBranch, branch_mode: branchMode,
    new_branch_name: branchMode === "new" ? newBranchName || undefined : undefined,
    commit_message: commitMessage, prompt,
    push_confirm_skip: pushConfirmSkip,
    mvn_local_repo: mvnLocalRepo || undefined, mvn_settings_xml: mvnSettingsXml || undefined,
    claude_command: claudeCommand || undefined,
    commit_only_if_pass: commitOnlyIfPass,
    mvn_extra_args: mvnExtraArgs || undefined,
    ai_provider_json: JSON.stringify(aiProvider),
  });

  const onExecuteClick = () => setExecConfirm(true);
  const confirmExec = () => { setExecConfirm(false); tg.startRun(buildConfig() as any, false); };
  const startRetry = () => { if (result) tg.startRun(buildConfig() as any, true, result.test_output_excerpt); };

  const confirmPush = async () => {
    setPushConfirm(false);
    if (!result) return;
    tg.appendLog("push", "确认推送...");
    try {
      await pushBranch(dir, result.branch);
      tg.appendLog("push", "已推送");
    } catch (e) { tg.appendLog("push", `推送失败: ${e}`); }
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
  const canRetry = runStatus === "error" && result !== null && !result.commit_sha && !result.test_passed;

  return (
    <div className="flex flex-col h-full">
      {/* Header + tabs */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <FlaskConical className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold">单测执行</h1>
              <p className="text-xs text-muted-foreground mt-0.5">AI 生成单测并自动提交</p>
            </div>
          </div>
          <div className="inline-flex gap-1 rounded-lg bg-muted p-0.5">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${activeTab === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
            ))}
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "exec" && (
        <div className="p-5 space-y-3">

      {/* Prompt */}
      <div>
        <label className="text-xs text-muted-foreground">覆盖率 Prompt（可编辑）</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="从单测覆盖率页点「用 AI 执行」带入，或在此粘贴" className="w-full h-40 mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono" />
      </div>

      {/* Project selection */}
      <div>
        <label className="text-xs text-muted-foreground">项目根目录（预扫描）</label>
        <div className="flex gap-2 mt-1">
          <input value={projectRoot} onChange={(e) => { setProjectRoot(e.target.value); setSetting("testgen_project_root", e.target.value); }} placeholder="配置根目录，自动扫描下级项目" className={`${inputCls} flex-1`} />
          <button onClick={pickProjectRoot} className="flex items-center gap-1 h-8 px-3 text-xs border border-border rounded-md hover:bg-secondary"><FolderOpen className="w-3.5 h-3.5" /> 选择</button>
          <button onClick={() => doScan(projectRoot)} className="h-8 px-3 text-xs border border-border rounded-md hover:bg-secondary">扫描</button>
        </div>
        {scannedProjects.length > 0 && (
          <>
            <div className="flex items-center gap-2 mt-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} placeholder={`搜索 ${scannedProjects.length} 个项目...`} className={`${inputCls} flex-1`} />
              <button onClick={onManualDir} className="flex items-center gap-1 h-8 px-3 text-xs border border-border rounded-md hover:bg-secondary"><FolderOpen className="w-3.5 h-3.5" /> 手动选</button>
            </div>
            <div className="mt-1 max-h-40 overflow-auto border border-border/50 rounded-md">
              {shownProjects.map((p) => (
                <button key={p.path} onClick={() => selectProject(p)} className={`w-full text-left px-2 py-1 text-xs hover:bg-secondary flex items-center gap-2 ${dir === p.path ? "bg-primary/10" : ""}`}>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground truncate flex-1">{p.path}</span>
                  {p.has_mvn && <span className="text-[9px] px-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded">mvn</span>}
                  {p.has_gradle && <span className="text-[9px] px-1 bg-green-100 dark:bg-green-900/30 text-green-600 rounded">gradle</span>}
                </button>
              ))}
              {filteredProjects.length > 30 && <div className="px-2 py-1 text-[10px] text-muted-foreground">还有 {filteredProjects.length - 30} 个，请细化搜索...</div>}
            </div>
          </>
        )}
        {scannedProjects.length === 0 && (
          <button onClick={onManualDir} className="flex items-center gap-1 mt-1 h-8 px-3 text-xs border border-border rounded-md hover:bg-secondary"><FolderOpen className="w-3.5 h-3.5" /> 手动选择项目目录</button>
        )}
        {dir && (
          <div className="text-[11px] text-muted-foreground mt-1 break-all">
            {repoInfo ? (repoInfo.is_repo ? `git 仓库 | 当前: ${repoInfo.current_branch ?? "?"} | ${repoInfo.clean ? "工作区干净" : "⚠ 不干净"} | remote: ${repoInfo.remote ?? "无"}` : "⚠ 不是 git 仓库") : dir}
          </div>
        )}
      </div>

      {/* Branch */}
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
        <div><label className="text-xs text-muted-foreground">新分支名</label><input value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} placeholder="留空则自动 test/<提交名>" className={`${inputCls} w-full mt-1`} /></div>
      )}
      {branchWarn && <div className="text-xs text-amber-500">⚠ 在受保护分支「{baseBranch}」上直接操作，请谨慎</div>}

      {/* Commit + toggles */}
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs text-muted-foreground">提交信息</label><input value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} className={`${inputCls} w-full mt-1`} /></div>
        <div className="space-y-1">
          <label className="flex items-center gap-1 mt-1 h-4 text-xs"><input type="checkbox" checked={pushConfirmSkip} onChange={(e) => setPushConfirmSkip(e.target.checked)} />跳过 push 确认（直接推送）</label>
          <label className="flex items-center gap-1 h-4 text-xs"><input type="checkbox" checked={commitOnlyIfPass} onChange={(e) => { setCommitOnlyIfPass(e.target.checked); setSetting("testgen_commit_only_if_pass", e.target.checked ? "true" : "false"); }} />仅测试通过才提交</label>
        </div>
      </div>

      {/* Maven + AI config */}
      <details className="border border-border rounded-md p-2">
        <summary className="text-xs font-medium cursor-pointer">Maven / AI 配置</summary>
        <div className="mt-2 space-y-2">
          <div><label className="text-[11px] text-muted-foreground">本地仓库目录（-Dmaven.repo.local）</label>
            <div className="flex gap-2 mt-1"><input value={mvnLocalRepo} onChange={(e) => { setMvnLocalRepo(e.target.value); setSetting("testgen_mvn_local_repo", e.target.value); }} className={`${inputCls} flex-1`} /><button onClick={pickMvnDir} className="h-8 px-2 text-xs border border-border rounded-md hover:bg-secondary">选目录</button></div>
          </div>
          <div><label className="text-[11px] text-muted-foreground">settings.xml 路径（-s）</label>
            <div className="flex gap-2 mt-1"><input value={mvnSettingsXml} onChange={(e) => { setMvnSettingsXml(e.target.value); setSetting("testgen_mvn_settings_xml", e.target.value); }} className={`${inputCls} flex-1`} /><button onClick={pickMvnFile} className="h-8 px-2 text-xs border border-border rounded-md hover:bg-secondary">选文件</button></div>
          </div>
          <div><label className="text-[11px] text-muted-foreground">mvn 额外参数（如 -pl moduleA -Dtest=Xxx）</label><input value={mvnExtraArgs} onChange={(e) => setMvnExtraArgs(e.target.value)} className={`${inputCls} w-full mt-1`} /></div>
          <div><label className="text-[11px] text-muted-foreground">AI 命令（留空用 claude，可填路径）</label><input value={claudeCommand} onChange={(e) => { setClaudeCommand(e.target.value); setSetting("testgen_claude_command", e.target.value); }} placeholder="claude" className={`${inputCls} w-full mt-1`} /></div>
          <div>
            <label className="text-[11px] text-muted-foreground">AI 提供商（优先使用统一 AI 模块）</label>
            <div className="mt-1">
              <AiSelector value={aiProvider} onChange={setAiProvider} />
            </div>
          </div>
        </div>
      </details>

      {/* Execute + Retry */}
      <div className="flex gap-2">
        <button onClick={onExecuteClick} disabled={!canRun || runStatus === "running"} className="flex items-center gap-1 h-8 px-3 text-xs bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"><Play className="w-3.5 h-3.5" /> 执行</button>
        {canRetry && <button onClick={startRetry} className="flex items-center gap-1 h-8 px-3 text-xs border border-border rounded-md hover:bg-secondary"><RotateCw className="w-3.5 h-3.5" /> 重试（修复测试）</button>}
      </div>

        </div>
        )}
        {activeTab === "history" && (
          <div className="p-5 space-y-2">
            <h2 className="text-sm font-medium">执行记录</h2>
            {history.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">暂无记录</div>}
            <div className="space-y-2">
              {history.map((r) => (
                <div key={r.id} className="p-3 border border-border rounded-lg text-xs">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium">{r.project_name ?? r.dir ?? "-"}</span>
                      <span className="ml-2 text-muted-foreground">{r.branch ?? "-"}</span>
                    </div>
                    <span className={r.status === "done" ? "text-green-500" : r.status === "error" ? "text-red-500" : r.status === "cancelled" ? "text-muted-foreground" : "text-amber-500"}>{r.status ?? "-"}</span>
                  </div>
                  <div className="text-muted-foreground mt-1">{formatTs(r.started_at)}{r.commit_sha ? ` · ${r.commit_sha}` : ""}{r.pushed ? " · 已推送" : ""}{r.test_passed ? " · 测试通过" : " · 测试未通过"}{r.files_changed > 0 ? ` · ${r.files_changed} 文件` : ""}</div>
                  {r.error && <div className="text-red-500 mt-1 break-all">{r.error}</div>}
                  {r.prompt_summary && <div className="text-muted-foreground/70 mt-1 break-all">{r.prompt_summary}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog open={execConfirm} title="执行单测生成" description={`目录：${dir}\n分支：${baseBranch}${branchMode === "new" ? `（新建 ${newBranchName || "test/..."}）` : ""}${branchWarn ? `\n⚠ 受保护分支 ${baseBranch}` : ""}\n提交信息：${commitMessage}\n\n将调用 AI 写单测并跑 mvn test，确认继续？`} confirmText="开始" onCancel={() => setExecConfirm(false)} onConfirm={confirmExec} />
      <ConfirmDialog open={tg.pushConfirm} title="确认推送" description={`已提交到 ${result?.branch}，是否推送到远程？`} confirmText="推送" onCancel={() => setPushConfirm(false)} onConfirm={confirmPush} />
    </div>
  );
}
