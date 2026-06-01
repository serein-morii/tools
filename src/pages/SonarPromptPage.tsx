import { useState, useCallback, useMemo } from "react";
import {
  Search, FileCode, Copy, Download, Loader2, ChevronRight, Check,
  Trash2, RotateCcw, ClipboardCopy, History, Sparkles, BookTemplate, Clock,
  Plus, Star, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    () => localStorage.getItem("sonar_author") || "pengchenghui@jtexpress.com"
  );

  // 根据选中的项目获取分支列表
  const { data: gitlabBranches } = useGitLabBranches(selectedProjectId);

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

  // 项目选择变更时，提取最后一层作为 projectKey，并加载分支
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

  // --- 保存表单到 localStorage ---
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

      if (coverages.length > 0) {
        const generated = await sonarApi.generatePrompt(coverages, activeTemplate?.content || "");
        setPrompt(generated);
        // 自动保存到历史
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

  // --- 复制/导出 ---
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
    toast.success("已导出 claude_code_prompt.txt");
  };

  // --- 返回 ---
  const handleBack = () => {
    setStep("config");
    setReports([]);
    setSelectedReport(null);
    setFileCoverages([]);
    setPrompt("");
  };

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
    toast.success("已清空历史");
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

  // --- 时间格式化 ---
  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleString("zh-CN", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="flex h-full flex-col p-6 space-y-4 overflow-auto">
      <div>
        <h1 className="text-2xl font-bold">代码补测</h1>
        <p className="text-sm text-muted-foreground mt-1">
          从 Sonar 覆盖率报告中提取未覆盖代码，生成 Claude Code 单测 Prompt
        </p>
      </div>

      {/* Tab 导航 — pill 风格 */}
      <nav className="flex gap-1">
        <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
          {[
            { key: "generator", label: "Prompt 生成", icon: Sparkles },
            { key: "template", label: "模板编辑", icon: BookTemplate },
            { key: "history", label: "扫描历史", icon: Clock },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200",
                activeTab === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ===== Tab 1: Prompt 生成 ===== */}
      {activeTab === "generator" && (
        <div className="flex-1 overflow-auto space-y-4">
          {/* Step 1: 配置 */}
          {step === "config" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">扫描参数</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>扫描项目 *</Label>
                    <SearchableSelect
                      value={selectedProjectId?.toString() || ""}
                      onChange={handleProjectChange}
                      options={projectOptions}
                      placeholder="选择项目"
                      emptyMessage="无匹配项目"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>分支</Label>
                    <SearchableSelect
                      value={branch}
                      onChange={setBranch}
                      options={branchOptions}
                      placeholder="选择分支"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>截止时间 *</Label>
                    <input
                      type="datetime-local"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={createTimeEnd}
                      onChange={(e) => setCreateTimeEnd(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>数量限制</Label>
                    <Input
                      type="number"
                      value={limit}
                      onChange={(e) => setLimit(parseInt(e.target.value) || 7)}
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>开发者邮箱</Label>
                    <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
                  </div>
                </div>
                <Button onClick={handleFetchReports} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                  获取报告
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: 选择报告 */}
          {step === "select" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">选择扫描报告（增量）</CardTitle>
                <Button variant="ghost" size="sm" onClick={handleBack}>返回</Button>
              </CardHeader>
              <CardContent>
                {reports.length === 0 ? (
                  <p className="text-sm text-muted-foreground">没有符合条件的报告</p>
                ) : (
                  <div className="space-y-2">
                    {reports.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted cursor-pointer transition-colors"
                        onClick={() => handleSelectReport(r)}
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{r.id}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.createTime} | {r.projectKey} | {r.branch}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: 结果 */}
          {step === "result" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleBack}>返回</Button>
                  {selectedReport && (
                    <span className="text-sm text-muted-foreground">
                      {selectedReport.id} | {selectedReport.createTime}
                    </span>
                  )}
                </div>
                {!processing && prompt && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleCopy(prompt)}>
                      <Copy className="h-4 w-4 mr-1" /> 复制
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExport}>
                      <Download className="h-4 w-4 mr-1" /> 导出 txt
                    </Button>
                  </div>
                )}
              </div>

              {processing && (
                <Card>
                  <CardContent className="flex items-center gap-3 py-6">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">
                      正在分析文件... {progress.current}/{progress.total}
                    </span>
                  </CardContent>
                </Card>
              )}

              {fileCoverages.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileCode className="h-4 w-4" />
                      覆盖区域 ({fileCoverages.length} 个文件)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-[200px] overflow-auto">
                      {fileCoverages.map((fc, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          <span className="font-mono text-xs break-all">{fc.path}</span>
                          <span className="text-muted-foreground shrink-0">
                            {fc.ranges.map((r) =>
                              r.start === r.end ? `第${r.start}行` : `第${r.start}-${r.end}行`
                            ).join("、")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {!processing && prompt && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">生成的 Prompt</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <textarea
                      className="w-full h-[400px] rounded-md border bg-muted/30 p-3 text-sm font-mono resize-y"
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

      {/* ===== Tab 2: 模板编辑 ===== */}
      {activeTab === "template" && (
        <div className="flex-1 overflow-auto space-y-4">
          {/* 编辑/创建表单 */}
          {(editingTemplate || isCreating) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {isCreating ? "新建模板" : "编辑模板"}
                  <span className="text-xs text-muted-foreground font-normal ml-2">
                    可用变量：{"{file_list}"}（扫描到的文件和行号）
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>模板名称</Label>
                  <Input
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    placeholder="输入模板名称"
                  />
                </div>
                <div className="space-y-2">
                  <Label>模板内容</Label>
                  <textarea
                    className="w-full h-[300px] rounded-md border bg-muted/30 p-3 text-sm font-mono resize-y"
                    value={tplContent}
                    onChange={(e) => setTplContent(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveTemplate}>保存</Button>
                  <Button variant="ghost" size="sm" onClick={handleCancelEdit}>取消</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 模板列表 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">模板列表</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleStartCreate}>
                  <Plus className="h-4 w-4 mr-1" /> 新建
                </Button>
                <Button variant="ghost" size="sm" onClick={handleResetTemplates}>
                  <RotateCcw className="h-4 w-4 mr-1" /> 恢复默认
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3 transition-colors",
                    tpl.isDefault && "border-primary/50 bg-primary/5"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
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
                            : "text-muted-foreground hover:text-yellow-400"
                        )}
                      />
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[400px]">
                        {tpl.content.slice(0, 80)}...
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleStartEdit(tpl)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {tpl.id !== "built-in" && (
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTemplateId(tpl.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== Tab 3: 扫描历史 ===== */}
      {activeTab === "history" && (
        <div className="flex-1 overflow-auto space-y-3">
          {history.length > 0 && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowClearConfirm(true)}>
                <Trash2 className="h-4 w-4 mr-1" /> 清空全部
              </Button>
            </div>
          )}

          {history.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <History className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">暂无扫描历史</p>
              </CardContent>
            </Card>
          ) : (
            history.map((record) => (
              <Card key={record.id}>
                <CardContent className="py-3 flex items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {record.projectKey} / {record.branch}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(record.createdAt)} | {record.fileCount} 个文件 | {record.author}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleLoadFromHistory(record)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> 加载
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleCopy(record.prompt)}>
                      <ClipboardCopy className="h-3.5 w-3.5 mr-1" /> 复制
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(record.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> 删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="删除扫描记录"
        description="确定删除这条扫描记录吗？此操作不可撤销。"
        destructive
        onConfirm={() => deleteId && handleDeleteRecord(deleteId)}
      />

      {/* 清空确认 */}
      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="清空扫描历史"
        description="确定清空所有扫描历史吗？此操作不可撤销。"
        destructive
        onConfirm={handleClearHistory}
      />

      {/* 删除模板确认 */}
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
