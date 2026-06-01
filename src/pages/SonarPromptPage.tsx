import { useState, useCallback, useMemo } from "react";
import {
  Search, FileCode, Copy, Download, Loader2, ChevronRight, ChevronLeft, Check,
  Trash2, RotateCcw, ClipboardCopy, History, Sparkles, Clock,
  Plus, Star, Pencil, AlertCircle, Zap, FileText, BarChart3, SlidersHorizontal,
  CheckSquare, Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { sonarApi, type SonarAuth, type SonarReport, type FileCoverage } from "@/lib/api/sonar";
import { useGitLabConfig, useGitLabProjects, useGitLabBranches } from "@/lib/query/gitlabQueries";
import { getHistory, saveRecord, deleteRecord, clearHistory, type SonarScanRecord } from "@/lib/sonar/history";
import {
  getTemplates, saveTemplate, updateTemplate, deleteTemplate,
  setDefaultTemplate, resetTemplates,
  type SonarTemplate,
} from "@/lib/sonar/templates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function getDefaultTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

const tabs = [
  { key: "generator", label: "Prompt 生成", icon: Zap },
  { key: "template", label: "模板管理", icon: FileText },
  { key: "history", label: "扫描历史", icon: BarChart3 },
] as const;

export function SonarPromptPage() {
  const { data: config } = useGitLabConfig();
  const { data: gitlabProjects } = useGitLabProjects();

  // --- 配置参数 ---
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectKey, setProjectKey] = useState(
    () => localStorage.getItem("sonar_project_key") || "yl-jmsuk-lmdm-api"
  );
  const [branch, setBranch] = useState(
    () => localStorage.getItem("sonar_branch") || "master"
  );
  const [createTimeEnd, setCreateTimeEnd] = useState(getDefaultTime);
  const [limit, setLimit] = useState(7);
  const [author, setAuthor] = useState(
    () => localStorage.getItem("sonar_author") || ""
  );

  const { data: gitlabBranches } = useGitLabBranches(selectedProjectId);

  // --- 高级选项 ---
  const [showAdvanced, setShowAdvanced] = useState(false);

  // --- 模板 ---
  const [templates, setTemplates] = useState<SonarTemplate[]>(getTemplates);
  const [editingTemplate, setEditingTemplate] = useState<SonarTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplContent, setTplContent] = useState("");
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  const activeTemplate = useMemo(() => {
    return templates.find((t) => t.isDefault) || templates[0];
  }, [templates]);

  // --- 向导状态 ---
  const [step, setStep] = useState<"config" | "select" | "result">("config");
  const [reports, setReports] = useState<SonarReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<SonarReport | null>(null);
  const [fileCoverages, setFileCoverages] = useState<FileCoverage[]>([]);
  const [selectedFileIndices, setSelectedFileIndices] = useState<Set<number>>(new Set());
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // --- 历史 ---
  const [history, setHistory] = useState<SonarScanRecord[]>(getHistory);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // --- Tab ---
  const [activeTab, setActiveTab] = useState("generator");

  // --- 数据源 ---
  const projectOptions = useMemo(() => {
    if (!gitlabProjects?.length) return [];
    return gitlabProjects.map((p) => ({
      value: p.id.toString(),
      label: p.path_with_namespace,
    }));
  }, [gitlabProjects]);

  const branchOptions = useMemo(() => {
    if (gitlabBranches?.length) {
      return gitlabBranches.map((b) => ({ value: b, label: b }));
    }
    return [
      { value: "master", label: "master" },
      { value: "main", label: "main" },
      { value: "develop", label: "develop" },
    ];
  }, [gitlabBranches]);

  const handleProjectChange = (value: string) => {
    const project = gitlabProjects?.find((p) => p.id.toString() === value);
    if (project) {
      setSelectedProjectId(project.id);
      const lastSegment = project.path_with_namespace.split("/").pop() || project.path_with_namespace;
      setProjectKey(lastSegment);
    }
  };

  // --- Auth ---
  const getAuth = useCallback((): SonarAuth | null => {
    if (!config?.walkin_url || !config?.walkin_csrf_token) return null;
    return {
      csrf_token: config.walkin_csrf_token,
      project: config.walkin_project_header,
      workspace: config.walkin_workspace_name,
      x_auth_token: config.walkin_x_auth_token,
    };
  }, [config]);

  const persistForm = useCallback(() => {
    localStorage.setItem("sonar_project_key", projectKey);
    localStorage.setItem("sonar_branch", branch);
    localStorage.setItem("sonar_author", author);
  }, [projectKey, branch, author]);

  // --- 获取报告 ---
  const handleFetchReports = async () => {
    const auth = getAuth();
    if (!auth || !config?.walkin_url) {
      toast.error("请先配置 Walkin 登录信息");
      return;
    }
    if (!createTimeEnd) {
      toast.error("请填写截止时间");
      return;
    }

    persistForm();
    setLoading(true);
    try {
      const formattedTime = createTimeEnd.replace("T", " ") + ":00";
      const data = await sonarApi.getReports(
        config.walkin_url, auth, config.walkin_dept_id,
        formattedTime, projectKey, branch, 1, limit,
      );
      const filtered = data.filter((r) => r.reportType === "增量");
      setReports(filtered);
      setStep("select");
      if (filtered.length === 0) {
        toast.warning("没有符合条件的增量报告");
      }
    } catch (e) {
      toast.error(`获取报告失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // --- 选择报告并分析 ---
  const handleSelectReport = async (report: SonarReport) => {
    const auth = getAuth();
    if (!auth || !config?.walkin_url) return;

    setSelectedReport(report);
    setProcessing(true);
    setStep("result");

    try {
      const files = await sonarApi.getFiles(
        config.walkin_url, auth,
        report.projectKey || "", report.branch || branch, report.id,
      );

      setProgress({ current: 0, total: files.length });
      const coverages: FileCoverage[] = [];

      for (let i = 0; i < files.length; i++) {
        setProgress({ current: i + 1, total: files.length });
        try {
          const cov = await sonarApi.getFileCoverage(
            config.walkin_url, auth,
            report.projectKey || "", report.branch || branch,
            files[i].key, files[i].path, author,
          );
          if (cov.ranges.length > 0) {
            coverages.push(cov);
          }
        } catch (e) {
          console.warn(`Failed: ${files[i].path}`, e);
        }
      }

      setFileCoverages(coverages);
      setSelectedFileIndices(new Set(coverages.map((_, i) => i)));

      if (coverages.length > 0) {
        const selectedCoverages = coverages;
        const generated = await sonarApi.generatePrompt(selectedCoverages, activeTemplate?.content || "");
        setPrompt(generated);
        const record = saveRecord({
          projectKey,
          branch,
          createTimeEnd,
          author,
          reportId: report.id,
          reportCreateTime: report.createTime,
          fileCount: coverages.length,
          prompt: generated,
        });
        setHistory((prev) => [record, ...prev]);
      } else {
        setPrompt("没有找到需要补充单测的代码区域。");
      }
    } catch (e) {
      toast.error(`处理失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  };

  const handleExport = () => {
    const blob = new Blob([prompt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "claude_code_prompt.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("已导出");
  };

  const handleBack = () => {
    setStep("config");
    setReports([]);
    setSelectedReport(null);
    setFileCoverages([]);
    setSelectedFileIndices(new Set());
    setPrompt("");
  };

  const toggleFileSelection = (index: number) => {
    setSelectedFileIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedFileIndices(prev => {
      if (prev.size === fileCoverages.length) return new Set();
      return new Set(fileCoverages.map((_, i) => i));
    });
  };

  const regeneratePrompt = useCallback(async () => {
    const selected = fileCoverages.filter((_, i) => selectedFileIndices.has(i));
    if (selected.length === 0) {
      setPrompt("没有选中任何文件。");
      return;
    }
    const generated = await sonarApi.generatePrompt(selected, activeTemplate?.content || "");
    setPrompt(generated);
  }, [fileCoverages, selectedFileIndices, activeTemplate]);

  // --- 历史操作 ---
  const handleLoadFromHistory = (record: SonarScanRecord) => {
    setProjectKey(record.projectKey);
    setBranch(record.branch);
    setCreateTimeEnd(record.createTimeEnd);
    setAuthor(record.author);
    setActiveTab("generator");
    setStep("config");
    toast.success("已加载历史配置");
  };

  const handleDeleteRecord = (id: string) => {
    deleteRecord(id);
    setHistory((prev) => prev.filter((r) => r.id !== id));
    setDeleteId(null);
    toast.success("已删除");
  };

  const handleClearHistory = () => {
    clearHistory();
    setHistory([]);
    setShowClearConfirm(false);
    toast.success("已清空");
  };

  // --- 模板操作 ---
  const handleStartCreate = () => {
    setIsCreating(true);
    setEditingTemplate(null);
    setTplName("");
    setTplContent("");
  };

  const handleStartEdit = (tpl: SonarTemplate) => {
    setIsCreating(false);
    setEditingTemplate(tpl);
    setTplName(tpl.name);
    setTplContent(tpl.content);
  };

  const handleCancelEdit = () => {
    setEditingTemplate(null);
    setIsCreating(false);
  };

  const handleSaveTemplate = () => {
    if (!tplName.trim() || !tplContent.trim()) {
      toast.error("名称和内容不能为空");
      return;
    }
    if (isCreating) {
      const created = saveTemplate({ name: tplName, content: tplContent, isDefault: false });
      setTemplates((prev) => [...prev, created]);
      toast.success("已创建");
    } else if (editingTemplate) {
      updateTemplate(editingTemplate.id, { name: tplName, content: tplContent });
      setTemplates((prev) =>
        prev.map((t) => (t.id === editingTemplate.id ? { ...t, name: tplName, content: tplContent } : t))
      );
      toast.success("已保存");
    }
    setEditingTemplate(null);
    setIsCreating(false);
  };

  const handleDeleteTemplate = (id: string) => {
    const updated = deleteTemplate(id);
    setTemplates(updated);
    setDeleteTemplateId(null);
    toast.success("已删除");
  };

  const handleSetDefault = (id: string) => {
    setDefaultTemplate(id);
    setTemplates((prev) => prev.map((t) => ({ ...t, isDefault: t.id === id })));
    toast.success("已设为默认");
  };

  const handleResetTemplates = () => {
    const updated = resetTemplates();
    setTemplates(updated);
    toast.success("已恢复默认");
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleString("zh-CN", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  };

  const formatDateTime = (s?: string) => {
    if (!s) return "-";
    return s.replace(/:\d{2}$/, "");
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">代码补测</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sonar 覆盖率分析 &rarr; 未覆盖代码提取 &rarr; Claude Code 单测 Prompt 生成
            </p>
          </div>
          <div className="inline-flex gap-1 rounded-lg bg-muted p-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  activeTab === tab.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        {/* ===== Tab 1: Prompt 生成 ===== */}
        {activeTab === "generator" && (
          <div className="space-y-4">
            {/* Step indicator */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {[
                { key: "config", label: "配置参数", num: "1" },
                { key: "select", label: "选择报告", num: "2" },
                { key: "result", label: "生成结果", num: "3" },
              ].map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <div className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                    step === s.key
                      ? "bg-blue-500 text-white"
                      : ["select", "result"].indexOf(step) > ["config", "select", "result"].indexOf(s.key)
                        ? "bg-emerald-500/15 text-emerald-600"
                        : "bg-muted text-muted-foreground"
                  )}>
                    {["select", "result"].indexOf(step) > ["config", "select", "result"].indexOf(s.key)
                      ? <Check className="h-3 w-3" />
                      : s.num}
                  </div>
                  <span className={cn(step === s.key && "text-foreground font-medium")}>
                    {s.label}
                  </span>
                  {i < 2 && <ChevronRight className="h-3 w-3" />}
                </div>
              ))}
            </div>

            {/* Step 1: 配置 */}
            {step === "config" && (
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">扫描项目 *</Label>
                      <SearchableSelect
                        value={selectedProjectId?.toString() || ""}
                        onChange={handleProjectChange}
                        options={projectOptions}
                        placeholder="搜索或选择项目"
                        emptyMessage="无匹配项目"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">分支</Label>
                      <SearchableSelect
                        value={branch}
                        onChange={setBranch}
                        options={branchOptions}
                        placeholder="选择分支"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">截止时间 *</Label>
                      <input
                        type="datetime-local"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={createTimeEnd}
                        onChange={(e) => setCreateTimeEnd(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">数量限制</Label>
                      <Input
                        type="number"
                        className="h-9 text-xs"
                        value={limit}
                        onChange={(e) => setLimit(parseInt(e.target.value) || 7)}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant={showAdvanced ? "secondary" : "ghost"}
                      size="sm"
                      className="h-9 text-xs gap-1.5"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      高级
                    </Button>
                  </div>

                  {showAdvanced && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">开发者邮箱</Label>
                        <Input
                          className="h-9 text-xs"
                          value={author}
                          onChange={(e) => setAuthor(e.target.value)}
                          placeholder="留空则不过滤"
                        />
                      </div>
                    </div>
                  )}

                  {/* 当前配置摘要 */}
                  {selectedProjectId && (
                    <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">目标</span>
                      <span className="font-medium">{projectKey}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="font-medium">{branch}</span>
                      <span className="text-muted-foreground">|</span>
                      <span className="text-muted-foreground">最近 {limit} 条</span>
                      <span className="text-muted-foreground">|</span>
                      <span className="text-muted-foreground truncate">{author}</span>
                    </div>
                  )}

                  <Button
                    className="w-full h-9"
                    onClick={handleFetchReports}
                    disabled={loading || !selectedProjectId}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    获取增量报告
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step 2: 选择报告 */}
            {step === "select" && (
              <Card>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleBack}>
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-sm font-medium">选择增量报告</span>
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">
                        {reports.length}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {projectKey} / {branch}
                    </span>
                  </div>

                  {reports.length === 0 ? (
                    <div className="flex flex-col items-center py-12 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mb-2" />
                      <p className="text-sm">没有符合条件的报告</p>
                    </div>
                  ) : (
                    <div className="divide-y max-h-[420px] overflow-auto">
                      {reports.map((r) => (
                        <button
                          key={r.id}
                          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
                          onClick={() => handleSelectReport(r)}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                              <FileCode className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">#{r.id}</span>
                                {r.commitId && (
                                  <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {r.commitId}
                                  </code>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDateTime(r.createTime)}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 3: 结果 */}
            {step === "result" && (
              <div className="space-y-3">
                {/* 顶部操作栏 */}
                <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleBack}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    {selectedReport && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">#{selectedReport.id}</span>
                        <span className="text-muted-foreground">|</span>
                        <span className="text-muted-foreground text-xs">{formatDateTime(selectedReport.createTime)}</span>
                      </div>
                    )}
                  </div>
                  {!processing && prompt && (
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleCopy(prompt)}>
                        <Copy className="h-3 w-3 mr-1" /> 复制
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExport}>
                        <Download className="h-3 w-3 mr-1" /> 导出
                      </Button>
                    </div>
                  )}
                </div>

                {/* 进度条 */}
                {processing && (
                  <Card>
                    <CardContent className="flex items-center gap-3 p-4">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-medium">正在分析文件...</span>
                          <span className="text-muted-foreground">{progress.current}/{progress.total}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-300"
                            style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : "0%" }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* 覆盖文件列表 */}
                {fileCoverages.length > 0 && (
                  <Card>
                    <CardContent className="p-0">
                      <div className="flex items-center gap-2 border-b px-4 py-2.5">
                        <button onClick={toggleSelectAll} className="flex items-center gap-2 hover:opacity-80">
                          {selectedFileIndices.size === fileCoverages.length
                            ? <CheckSquare className="h-4 w-4 text-emerald-500" />
                            : selectedFileIndices.size > 0
                              ? <CheckSquare className="h-4 w-4 text-emerald-500/50" />
                              : <Square className="h-4 w-4 text-muted-foreground" />}
                        </button>
                        <span className="text-sm font-medium">覆盖区域</span>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                          {selectedFileIndices.size}/{fileCoverages.length} 个文件
                        </span>
                        {selectedFileIndices.size !== fileCoverages.length && selectedFileIndices.size > 0 && (
                          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={regeneratePrompt}>
                            重新生成
                          </Button>
                        )}
                      </div>
                      <div className="divide-y max-h-[200px] overflow-auto">
                        {fileCoverages.map((fc, i) => (
                          <div key={i} className={`flex items-start gap-3 px-4 py-2 cursor-pointer hover:bg-muted/30 ${!selectedFileIndices.has(i) ? "opacity-50" : ""}`} onClick={() => toggleFileSelection(i)}>
                            {selectedFileIndices.has(i)
                              ? <CheckSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                              : <Square className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-mono truncate">{fc.path}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {fc.ranges.map((r) =>
                                  r.start === r.end ? `第${r.start}行` : `第${r.start}-${r.end}行`
                                ).join("、")}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* 生成的 Prompt */}
                {!processing && prompt && (
                  <Card>
                    <CardContent className="p-0">
                      <div className="flex items-center justify-between border-b px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-blue-500" />
                          <span className="text-sm font-medium">生成的 Prompt</span>
                          <span className="text-xs text-muted-foreground">
                            {prompt.length} 字符
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">
                            模板: {activeTemplate?.name || "默认"}
                          </span>
                        </div>
                      </div>
                      <textarea
                        className="w-full h-[360px] bg-muted/20 p-4 text-xs font-mono leading-relaxed resize-y border-0 focus:outline-none focus:ring-0"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== Tab 2: 模板管理 ===== */}
        {activeTab === "template" && (
          <div className="space-y-4">
            {/* 编辑/创建表单 */}
            {(editingTemplate || isCreating) && (
              <Card>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {isCreating ? "新建模板" : "编辑模板"}
                      </span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {"{file_list}"}
                      </code>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleCancelEdit}>
                      取消
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">模板名称</Label>
                    <Input
                      className="h-9 text-xs"
                      value={tplName}
                      onChange={(e) => setTplName(e.target.value)}
                      placeholder="输入模板名称"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">模板内容</Label>
                    <textarea
                      className="w-full h-[260px] rounded-md border border-input bg-muted/20 p-3 text-xs font-mono leading-relaxed resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={tplContent}
                      onChange={(e) => setTplContent(e.target.value)}
                    />
                  </div>
                  <Button size="sm" className="h-8" onClick={handleSaveTemplate}>
                    保存模板
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* 模板列表 */}
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">模板列表</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {templates.length}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleStartCreate}>
                      <Plus className="h-3 w-3 mr-1" /> 新建
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleResetTemplates}>
                      <RotateCcw className="h-3 w-3 mr-1" /> 恢复默认
                    </Button>
                  </div>
                </div>
                <div className="divide-y">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 transition-colors",
                        tpl.isDefault && "bg-blue-500/5"
                      )}
                    >
                      <button
                        onClick={() => handleSetDefault(tpl.id)}
                        title={tpl.isDefault ? "当前默认" : "设为默认"}
                        className="shrink-0"
                      >
                        <Star
                          className={cn(
                            "h-4 w-4 transition-colors",
                            tpl.isDefault
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground/40 hover:text-yellow-400"
                          )}
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{tpl.name}</span>
                          {tpl.isDefault && (
                            <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                              默认
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-[500px]">
                          {tpl.content.slice(0, 100)}
                        </p>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleStartEdit(tpl)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {tpl.id !== "built-in" && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteTemplateId(tpl.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ===== Tab 3: 扫描历史 ===== */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {history.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">共 {history.length} 条记录</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setShowClearConfirm(true)}>
                  <Trash2 className="h-3 w-3 mr-1" /> 清空全部
                </Button>
              </div>
            )}

            {history.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center py-16">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted mb-3">
                    <History className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">暂无扫描历史</p>
                  <p className="text-xs text-muted-foreground mt-1">生成 Prompt 后将自动保存</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {history.map((record) => (
                  <Card key={record.id}>
                    <CardContent className="p-0">
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{record.projectKey}</span>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-sm">{record.branch}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatTime(record.createdAt)} &middot; {record.fileCount} 个文件 &middot; {record.author}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleLoadFromHistory(record)}>
                            <RotateCcw className="h-3 w-3 mr-1" /> 加载
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleCopy(record.prompt)}>
                            <ClipboardCopy className="h-3 w-3 mr-1" /> 复制
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDeleteId(record.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 确认弹窗 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="删除扫描记录"
        description="确定删除这条扫描记录吗？此操作不可撤销。"
        destructive
        onConfirm={() => deleteId && handleDeleteRecord(deleteId)}
      />
      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="清空扫描历史"
        description="确定清空所有扫描历史吗？此操作不可撤销。"
        destructive
        onConfirm={handleClearHistory}
      />
      <ConfirmDialog
        open={!!deleteTemplateId}
        onOpenChange={() => setDeleteTemplateId(null)}
        title="删除模板"
        description="确定删除这个模板吗？此操作不可撤销。"
        destructive
        onConfirm={() => deleteTemplateId && handleDeleteTemplate(deleteTemplateId)}
      />
    </div>
  );
}
