import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search, FileCode, Loader2, ChevronRight, ChevronLeft, Check,
  Trash2, RotateCcw, History, Sparkles, Clock,
  Plus, Star, Pencil, AlertCircle, Zap, FileText, BarChart3, SlidersHorizontal,
  CheckSquare, Square, FlaskConical, Settings, Shield, XCircle, CheckCircle, RefreshCw, X,
  ArrowUp, ArrowDown, FolderGit2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CopyButton } from "@/components/ui/copy-button";
import { sonarApi, type SonarAuth, type SonarReport, type SonarFile, type FileCoverage } from "@/lib/api/sonar";
import { useGitLabConfig, useSaveGitLabConfig, useGitLabProjects, useGitLabBranches } from "@/lib/query/gitlabQueries";
import { useWalkinAuth } from "@/components/modules/gitlab/WalkinAuthManager";
import { defaultGitLabConfig } from "@/lib/gitlab/defaults";
import type { GitLabConfig, LdapProfile } from "@/types";
import { getHistory, saveRecord, deleteRecord, clearHistory, type SonarScanRecord } from "@/lib/sonar/history";
import {
  getTemplates, saveTemplate, updateTemplate, deleteTemplate,
  setDefaultTemplate, resetTemplates,
  type SonarTemplate,
} from "@/lib/sonar/templates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { UnitBoardCard } from "@/components/modules/gitlab/UnitBoardCard";
import { UnitCoverageList, getWeekOptions, fmtDate } from "@/components/modules/gitlab/UnitCoverageList";

function getDefaultTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

const tabs = [
  { key: "coverage", label: "覆盖率", icon: FlaskConical },
  { key: "generator", label: "Prompt 生成", icon: Zap },
  { key: "template", label: "模板管理", icon: FileText },
  { key: "history", label: "生成历史", icon: BarChart3 },
  { key: "settings", label: "配置", icon: Settings },
] as const;

export function SonarPromptPage() {
  const { data: config } = useGitLabConfig();
  const saveConfig = useSaveGitLabConfig();
  const { data: gitlabProjects } = useGitLabProjects();

  // --- Walkin 配置 ---
  const { isLoggedIn, userName, checkLogin, startAutoLogin } = useWalkinAuth();
  const [isCheckingLogin, setIsCheckingLogin] = useState(false);
  const [loginCheckInterval, setLoginCheckInterval] = useState<number>(() => {
    const saved = localStorage.getItem("walkin_login_check_interval");
    return saved ? parseFloat(saved) : 0;
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");

  const [walkinForm, setWalkinForm] = useState<GitLabConfig>(defaultGitLabConfig);
  useEffect(() => {
    if (!config) return;
    const m = { ...config };
    if (!config.ldap_profiles || config.ldap_profiles.length === 0) {
      m.ldap_profiles = defaultGitLabConfig.ldap_profiles;
      m.selected_ldap_id = defaultGitLabConfig.selected_ldap_id;
    }
    if (!m.selected_ldap_id && m.ldap_profiles.length > 0) {
      m.selected_ldap_id = m.ldap_profiles[0].id;
    }
    setWalkinForm(m);
    if (config.select_page_type) {
      setPageType(config.select_page_type);
    }
  }, [config]);

  const handleWalkinIntervalChange = (interval: number) => {
    setLoginCheckInterval(interval);
    localStorage.setItem("walkin_login_check_interval", interval.toString());
  };

  function generateId(): string {
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  const addLdapProfile = () => {
    const p: LdapProfile = { id: generateId(), username: "", password: "", label: "" };
    setWalkinForm({ ...walkinForm, ldap_profiles: [...walkinForm.ldap_profiles, p], selected_ldap_id: p.id });
  };
  const deleteLdapProfile = (id: string) => {
    const updated = walkinForm.ldap_profiles.filter(p => p.id !== id);
    setWalkinForm({ ...walkinForm, ldap_profiles: updated, selected_ldap_id: walkinForm.selected_ldap_id === id ? updated[0]?.id : walkinForm.selected_ldap_id });
  };
  const updateLdapProfiles = (profiles: LdapProfile[]) => {
    setWalkinForm({ ...walkinForm, ldap_profiles: profiles });
  };
  const getSelectedLdap = () => {
    const p = walkinForm.ldap_profiles.find(p => p.id === walkinForm.selected_ldap_id);
    return p ? { username: p.username, password: p.password } : undefined;
  };
  const handleSaveWalkin = async () => {
    setSaveStatus("saving");
    try {
      await saveConfig.mutateAsync(walkinForm);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  };

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
  const [author, setAuthor] = useState("");
  const [pageType, setPageType] = useState(
    () => localStorage.getItem("sonar_page_type") || "代码行"
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
  const [step, setStep] = useState<"config" | "select" | "selectFiles" | "result">("config");
  const [reports, setReports] = useState<SonarReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<SonarReport | null>(null);
  const [sonarFiles, setSonarFiles] = useState<SonarFile[]>([]);
  const [selectedFileKeys, setSelectedFileKeys] = useState<Set<string>>(new Set());
  const [selectedCoverageIndices, setSelectedCoverageIndices] = useState<Set<number>>(new Set());
  const [fileCoverages, setFileCoverages] = useState<FileCoverage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [highlightCommitId, setHighlightCommitId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<"path" | "coverage" | "uncovered" | "newCovered">("uncovered");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // --- 历史 ---
  const [history, setHistory] = useState<SonarScanRecord[]>(getHistory);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [detailRecord, setDetailRecord] = useState<SonarScanRecord | null>(null);

  // --- Tab ---
  const [activeTab, setActiveTab] = useState("coverage");
  const [cameFromCoverage, setCameFromCoverage] = useState(false);

  // --- 覆盖率周期 ---
  const weekOptions = useMemo(() => getWeekOptions(24), []);
  const [weekIndex, setWeekIndex] = useState(0);
  const currentWeek = weekOptions[weekIndex];

  // --- 数据源 ---
  const projectOptions = useMemo(() => {
    if (!gitlabProjects?.length) return [];
    return gitlabProjects.map((p) => ({
      value: p.id.toString(),
      label: p.name,
      description: p.path_with_namespace,
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

  // --- 排序后的文件列表 ---
  const sortedFiles = useMemo(() => {
    const sorted = [...sonarFiles];
    sorted.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortField) {
        case "path":
          return sortOrder === "asc" ? a.path.localeCompare(b.path) : b.path.localeCompare(a.path);
        case "coverage":
          aVal = pageType === "条件"
            ? (a.coverageConditions ?? 0)
            : (a.coverage ?? 0);
          bVal = pageType === "条件"
            ? (b.coverageConditions ?? 0)
            : (b.coverage ?? 0);
          break;
        case "uncovered":
          aVal = pageType === "条件"
            ? (a.uncoveredConditions ?? 0)
            : (a.uncoveredLines ?? 0);
          bVal = pageType === "条件"
            ? (b.uncoveredConditions ?? 0)
            : (b.uncoveredLines ?? 0);
          break;
        case "newCovered":
          aVal = a.newCoveredLines ?? 0;
          bVal = b.newCoveredLines ?? 0;
          break;
        default:
          return 0;
      }
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [sonarFiles, sortField, sortOrder, pageType]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

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

  // --- 选择报告并获取文件列表 ---
  const handleSelectReport = async (report: SonarReport) => {
    const auth = getAuth();
    if (!auth || !config?.walkin_url) return;

    setSelectedReport(report);
    setLoadingFiles(true);
    setStep("selectFiles");

    try {
      const files = await sonarApi.getFiles(
        config.walkin_url, auth,
        report.projectKey || "", report.branch || branch, report.id,
        pageType,
      );

      setSonarFiles(files);
      setSelectedFileKeys(new Set(files.map(f => f.key)));
    } catch (e) {
      toast.error(`获取文件失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingFiles(false);
    }
  };

  // --- 切换扫描类型后重新获取文件列表 ---
  const handlePageTypeChange = async (newPageType: string) => {
    setPageType(newPageType);
    localStorage.setItem("sonar_page_type", newPageType);
    saveConfig.mutateAsync({ ...config!, select_page_type: newPageType });

    // 如果已经在 selectFiles 步骤且有选中的报告，重新获取文件列表
    if (step === "selectFiles" && selectedReport) {
      const auth = getAuth();
      if (!auth || !config?.walkin_url) return;

      setLoadingFiles(true);
      try {
        const files = await sonarApi.getFiles(
          config.walkin_url, auth,
          selectedReport.projectKey || "", selectedReport.branch || branch, selectedReport.id,
          newPageType,
        );

        setSonarFiles(files);
        setSelectedFileKeys(new Set(files.map(f => f.key)));
      } catch (e) {
        toast.error(`获取文件失败: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoadingFiles(false);
      }
    }
  };

  // --- 生成结果（加载选中文件的覆盖数据并生成 Prompt）---
  const handleGenerateResult = async () => {
    if (!selectedReport || !config?.walkin_url) return;

    const auth = getAuth();
    if (!auth) return;

    setProcessing(true);
    setStep("result");

    try {
      const selectedFiles = sonarFiles.filter(f => selectedFileKeys.has(f.key));
      setProgress({ current: 0, total: selectedFiles.length });

      const coverages: FileCoverage[] = [];
      const noCoverageFiles: string[] = [];
      console.log("Selected files count:", selectedFiles.length, "Keys:", [...selectedFileKeys]);
      for (let i = 0; i < selectedFiles.length; i++) {
        setProgress({ current: i + 1, total: selectedFiles.length });
        console.log(`Processing file ${i + 1}/${selectedFiles.length}:`, selectedFiles[i].key, selectedFiles[i].path);
        try {
          const cov = await sonarApi.getFileCoverage(
            config.walkin_url, auth,
            selectedReport.projectKey || "", selectedReport.branch || branch,
            selectedFiles[i].key, selectedFiles[i].path, author,
            pageType,
          );
          console.log(`File ${selectedFiles[i].path} ranges:`, cov.ranges.length);
          if (cov.ranges.length > 0) {
            coverages.push(cov);
          } else {
            noCoverageFiles.push(selectedFiles[i].path);
          }
        } catch (e) {
          console.warn(`Failed: ${selectedFiles[i].path}`, e);
          noCoverageFiles.push(selectedFiles[i].path + " (加载失败)");
        }
      }
      console.log("Final coverages count:", coverages.length, "No coverage files:", noCoverageFiles);

      setFileCoverages(coverages);
      setSelectedCoverageIndices(new Set(coverages.map((_, i) => i)));

      if (coverages.length > 0) {
        const generated = await sonarApi.generatePrompt(coverages, activeTemplate?.content || "");
        setPrompt(generated);
        const record = saveRecord({
          projectKey,
          branch,
          createTimeEnd,
          author,
          reportId: selectedReport.id,
          reportCreateTime: selectedReport.createTime,
          fileCount: coverages.length,
          prompt: generated,
        });
        setHistory((prev) => [record, ...prev]);
      } else {
        setPrompt("没有找到需要补充单测的代码区域。");
      }

      // 提示被过滤的文件
      if (noCoverageFiles.length > 0) {
        toast.warning(`${noCoverageFiles.length} 个文件无未覆盖区域:\n${noCoverageFiles.join('\n')}`, { duration: 5000 });
      }
    } catch (e) {
      toast.error(`生成失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleBack = () => {
    if (step === "selectFiles") {
      setStep("select");
      setSonarFiles([]);
      setSelectedFileKeys(new Set());
      setSelectedReport(null);
    } else if (step === "result") {
      setStep("selectFiles");
      setPrompt("");
      setFileCoverages([]);
      setSelectedCoverageIndices(new Set());
      setProcessing(false);
    } else if (step === "select") {
      if (cameFromCoverage) {
        setActiveTab("coverage");
        setCameFromCoverage(false);
      } else {
        setStep("config");
      }
      setReports([]);
      setHighlightCommitId(null);
    } else {
      setStep("config");
    }
  };

  const toggleFileSelection = (key: string) => {
    setSelectedFileKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // 选择文件页面的全选（基于 sonarFiles）
  const toggleSelectAllFiles = () => {
    setSelectedFileKeys(prev => {
      if (prev.size === sonarFiles.length) return new Set();
      return new Set(sonarFiles.map(f => f.key));
    });
  };

  // 结果页面的全选（基于 fileCoverages）
  const toggleSelectAllCoverages = () => {
    setSelectedCoverageIndices(prev => {
      if (prev.size === fileCoverages.length) return new Set();
      return new Set(fileCoverages.map((_, i) => i));
    });
  };

  const toggleCoverageSelection = (index: number) => {
    setSelectedCoverageIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const regeneratePrompt = useCallback(async () => {
    const selected = fileCoverages.filter((_, i) => selectedCoverageIndices.has(i));
    if (selected.length === 0) {
      setPrompt("没有选中任何文件。");
      return;
    }
    const generated = await sonarApi.generatePrompt(selected, activeTemplate?.content || "");
    setPrompt(generated);
  }, [fileCoverages, selectedCoverageIndices, activeTemplate]);

  // --- 历史操作 ---
  const handleLoadFromHistory = (record: SonarScanRecord) => {
    setProjectKey(record.projectKey);
    setBranch(record.branch);
    setCreateTimeEnd(record.createTimeEnd);
    setAuthor(record.author);
    // Find and set selectedProjectId
    const match = gitlabProjects?.find((p) => {
      const last = p.path_with_namespace.split("/").pop() || p.path_with_namespace;
      return last === record.projectKey || last.includes(record.projectKey) || record.projectKey.includes(last);
    });
    if (match) setSelectedProjectId(match.id);
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

  // --- 从覆盖率列表跳转 ---
  const handlePromptFromCoverage = useCallback(async (pk: string, br: string, _au: string, commitId: string) => {
    // Pre-fill form
    setProjectKey(pk);
    setBranch(br);
    const match = gitlabProjects?.find((p) => {
      const last = p.path_with_namespace.split("/").pop() || p.path_with_namespace;
      return last === pk || last.includes(pk) || pk.includes(last);
    });
    if (match) setSelectedProjectId(match.id);
    const now = getDefaultTime();
    setCreateTimeEnd(now);
    setCameFromCoverage(true);
    setActiveTab("generator");
    setStep("config");
    setReports([]);
    setSelectedReport(null);
    setFileCoverages([]);
    setPrompt("");
    setHighlightCommitId(commitId || null);

    // Auto-fetch reports directly with the params
    const auth = getAuth();
    if (!auth || !config?.walkin_url) {
      toast.error("请先配置 Walkin 登录信息");
      return;
    }
    setLoading(true);
    try {
      const formattedTime = now.replace("T", " ") + ":00";
      const data = await sonarApi.getReports(
        config.walkin_url, auth, config.walkin_dept_id,
        formattedTime, pk, br, 1, 7,
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
  }, [gitlabProjects, getAuth, config]);

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
      return;
    }
    if (isCreating) {
      const created = saveTemplate({ name: tplName, content: tplContent, isDefault: false });
      setTemplates((prev) => [...prev, created]);
    } else if (editingTemplate) {
      updateTemplate(editingTemplate.id, { name: tplName, content: tplContent });
      setTemplates((prev) =>
        prev.map((t) => (t.id === editingTemplate.id ? { ...t, name: tplName, content: tplContent } : t))
      );
    }
    setEditingTemplate(null);
    setIsCreating(false);
  };

  const handleDeleteTemplate = (id: string) => {
    const updated = deleteTemplate(id);
    setTemplates(updated);
    setDeleteTemplateId(null);
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-12 items-center justify-between gap-3 border-b border-border px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <FlaskConical className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-medium">单测</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Sonar 覆盖率 → Prompt 生成</p>
          </div>
        </div>
        <div className="inline-flex h-8 items-center rounded-lg border border-border p-0.5 text-xs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {/* ===== Tab: Prompt 生成 ===== */}
        {activeTab === "generator" && (
          <div className="mx-auto max-w-[960px] space-y-6 px-6 py-6 animate-in fade-in duration-200">
            {/* Overview stats - 单行紧凑 */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {[
                { icon: History, label: "扫描记录", value: history.length },
                { icon: FileText, label: "模板", value: templates.length },
                { icon: BarChart3, label: "项目", value: gitlabProjects?.length ?? 0 },
              ].map((stat) => (
                <span key={stat.label} className="flex items-center gap-1.5">
                  <stat.icon className="h-3.5 w-3.5" />
                  <span className="font-mono tabular-nums">{stat.value}</span>
                  <span>{stat.label}</span>
                </span>
              ))}
              {history.length > 0 && (
                <span className="flex items-center gap-1.5 text-muted-foreground/80">
                  上次: <span className="font-mono tabular-nums">{formatTime(history[0].createdAt)}</span>
                </span>
              )}
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 text-xs">
              {[
                { key: "config", label: "配置参数" },
                { key: "select", label: "选择报告" },
                { key: "selectFiles", label: "选择文件" },
                { key: "result", label: "生成结果" },
              ].map((s, i) => {
                const stepIndex = ["config", "select", "selectFiles", "result"].indexOf(step);
                const isActive = step === s.key;
                const isCompleted = stepIndex > i;
                return (
                  <div key={s.key} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : isCompleted
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      {isCompleted ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        "transition-colors",
                        isActive && "text-foreground font-medium",
                        !isActive && !isCompleted && "text-muted-foreground"
                      )}
                    >
                      {s.label}
                    </span>
                    {i < 3 && <ChevronRight className="h-3 w-3 text-muted-foreground/60" />}
                  </div>
                );
              })}
            </div>

            {/* Step 1: 配置 */}
            {step === "config" && (
              <section className="space-y-4 rounded-xl border border-border bg-card p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">扫描项目 *</Label>
                    <SearchableSelect
                      value={selectedProjectId?.toString() || ""}
                      onChange={handleProjectChange}
                      options={projectOptions}
                      placeholder="搜索或选择"
                      emptyMessage="无匹配"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">分支</Label>
                    <SearchableSelect
                      value={branch}
                      onChange={setBranch}
                      options={branchOptions}
                      placeholder="选择分支"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">截止时间 *</Label>
                    <input
                      type="datetime-local"
                      className="flex h-8 w-full rounded-lg border border-input bg-background px-3 text-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={createTimeEnd}
                      onChange={(e) => setCreateTimeEnd(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">数量限制</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={limit}
                      onChange={(e) => setLimit(parseInt(e.target.value) || 7)}
                    />
                  </div>
                </div>

                {/* 高级选项 */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors",
                      showAdvanced
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    高级
                  </button>
                </div>

                {showAdvanced && (
                  <div className="grid grid-cols-4 gap-4 animate-in fade-in duration-150">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">邮箱过滤</Label>
                      <Input
                        className="h-8 text-xs"
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        placeholder="留空则不过滤"
                      />
                    </div>
                  </div>
                )}

                {/* 配置摘要 */}
                {selectedProjectId && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                    <FolderGit2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{projectKey}</span>
                    <span className="text-muted-foreground/60">/</span>
                    <span>{branch}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-muted-foreground">最近 {limit} 条</span>
                    {author && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-muted-foreground truncate">{author}</span>
                      </>
                    )}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleFetchReports}
                    disabled={loading || !selectedProjectId}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Search className="h-3 w-3" />
                    )}
                    获取增量报告
                  </button>
                </div>
              </section>
            )}

            {/* Step 2: 选择报告 */}
            {step === "select" && (
              <section className="overflow-hidden rounded-xl border border-border bg-card animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-semibold">选择增量报告</span>
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                      {reports.length}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    {projectKey} / {branch}
                  </span>
                </div>

                {reports.length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mb-3 opacity-50" />
                    <p className="text-sm font-medium">没有符合条件的报告</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-[420px] overflow-auto">
                    {reports.map((r) => (
                      <button
                        key={r.id}
                        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted"
                        onClick={() => handleSelectReport(r)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <FileCode className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">#{r.id}</span>
                              {r.commitId && (
                                <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                                  {r.commitId}
                                </code>
                              )}
                              {highlightCommitId && r.commitId && r.commitId === highlightCommitId && (
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">当前</span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {formatDateTime(r.createTime)}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Step 3: 选择文件 */}
            {step === "selectFiles" && (
              <section className="overflow-hidden rounded-xl border border-border bg-card animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-semibold">选择类文件</span>
                    {selectedReport && (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        #{selectedReport.id}
                      </span>
                    )}
                  </div>
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    {selectedFileKeys.size}/{sonarFiles.length}
                  </span>
                </div>

                {loadingFiles ? (
                  <div className="flex flex-col items-center py-16">
                    <Loader2 className="h-5 w-5 animate-spin text-primary mb-2" />
                    <p className="text-xs text-muted-foreground">正在获取文件列表...</p>
                  </div>
                ) : sonarFiles.length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mb-3 opacity-50" />
                    <p className="text-sm font-medium">没有符合条件的文件</p>
                  </div>
                ) : (
                  <>
                    {/* 扫描类型和排序 */}
                    <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">类型</span>
                      <button
                        type="button"
                        onClick={() => handlePageTypeChange("代码行")}
                        className={cn(
                          "inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium transition-colors",
                          pageType === "代码行" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        代码行
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePageTypeChange("条件")}
                        className={cn(
                          "inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium transition-colors",
                          pageType === "条件" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        条件
                      </button>
                      <div className="w-px h-4 bg-border mx-1" />
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">排序</span>
                      {[
                        { key: "uncovered", label: "未覆盖" },
                        { key: "coverage", label: "覆盖率" },
                        ...(pageType === "代码行" ? [{ key: "newCovered", label: "新增" }] : []),
                        { key: "path", label: "路径" },
                      ].map((sort) => (
                        <button
                          key={sort.key}
                          type="button"
                          onClick={() => handleSort(sort.key as typeof sortField)}
                          className={cn(
                            "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] transition-colors",
                            sortField === sort.key
                              ? "bg-muted font-medium text-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          {sort.label}
                          {sortField === sort.key && (
                            sortOrder === "desc" ? <ArrowDown className="h-2.5 w-2.5" /> : <ArrowUp className="h-2.5 w-2.5" />
                          )}
                        </button>
                      ))}
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          type="button"
                          onClick={toggleSelectAllFiles}
                          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {selectedFileKeys.size === sonarFiles.length ? (
                            <CheckSquare className="h-3.5 w-3.5 text-primary" />
                          ) : selectedFileKeys.size > 0 ? (
                            <CheckSquare className="h-3.5 w-3.5 text-primary/50" />
                          ) : (
                            <Square className="h-3.5 w-3.5" />
                          )}
                          全选
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-border max-h-[400px] overflow-auto">
                      {sortedFiles.map((f) => (
                        <div
                          key={f.key}
                          className={cn(
                            "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-muted",
                            !selectedFileKeys.has(f.key) && "opacity-50"
                          )}
                          onClick={() => toggleFileSelection(f.key)}
                        >
                          {selectedFileKeys.has(f.key) ? (
                            <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : (
                            <Square className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-mono text-xs">{f.path}</p>
                            <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                              {f.language && (
                                <span className="rounded bg-muted px-1 py-0.5 text-[10px]">{f.language}</span>
                              )}
                              {pageType === "代码行" && (
                                <>
                                  {f.coverage !== undefined && f.coverage !== null && (
                                    <span className={cn(
                                      "font-mono tabular-nums font-medium",
                                      f.coverage >= 80 ? "text-primary" :
                                      f.coverage >= 50 ? "text-amber-600" : "text-rose-500"
                                    )}>
                                      {f.coverage.toFixed(1)}%
                                    </span>
                                  )}
                                  {f.coveredLines !== undefined && f.totalLines !== undefined && f.totalLines > 0 && (
                                    <span className="font-mono tabular-nums">{f.coveredLines}/{f.totalLines}</span>
                                  )}
                                  {f.uncoveredLines !== undefined && f.uncoveredLines > 0 && (
                                    <span className="font-mono tabular-nums text-rose-500">-{f.uncoveredLines}</span>
                                  )}
                                  {f.newCoveredLines !== undefined && f.newCoveredLines > 0 && (
                                    <span className="font-mono tabular-nums text-primary">+{f.newCoveredLines}</span>
                                  )}
                                </>
                              )}
                              {pageType === "条件" && (
                                <>
                                  {f.coverageConditions !== undefined && f.coverageConditions !== null && (
                                    <span className={cn(
                                      "font-mono tabular-nums font-medium",
                                      f.coverageConditions >= 80 ? "text-primary" :
                                      f.coverageConditions >= 50 ? "text-amber-600" : "text-rose-500"
                                    )}>
                                      {f.coverageConditions.toFixed(1)}%
                                    </span>
                                  )}
                                  {f.totalConditions !== undefined && f.totalConditions > 0 && (
                                    <span className="font-mono tabular-nums">{f.totalConditions} 条件</span>
                                  )}
                                  {f.uncoveredConditions !== undefined && f.uncoveredConditions > 0 && (
                                    <span className="font-mono tabular-nums text-rose-500">-{f.uncoveredConditions}</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2 border-t border-border/60 px-4 py-3 bg-muted/30">
                      <button
                        type="button"
                        onClick={handleBack}
                        className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        返回
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateResult}
                        disabled={selectedFileKeys.size === 0}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Sparkles className="h-3 w-3" />
                        生成 Prompt ({selectedFileKeys.size})
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}

            {/* Step 4: 结果 */}
            {step === "result" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                {/* 顶部操作栏 */}
                <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 ring-1 ring-border/40">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    {selectedReport && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-medium text-primary">#{selectedReport.id}</span>
                        <span className="text-muted-foreground/60">·</span>
                        <span className="text-muted-foreground">{formatDateTime(selectedReport.createTime)}</span>
                        <span className="text-muted-foreground/60">·</span>
                        <span className="text-muted-foreground">{pageType}</span>
                      </div>
                    )}
                  </div>
                  {!processing && prompt && (
                    <CopyButton text={prompt} size="sm" className="h-7 text-xs" showText />
                  )}
                </div>

                {/* 生成中状态 */}
                {processing && (
                  <div className="rounded-xl border border-border bg-card p-4 ring-1 ring-border/40">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-medium">正在分析文件覆盖...</span>
                          <span className="font-mono tabular-nums text-muted-foreground">{progress.current}/{progress.total}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : "0%" }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 覆盖文件列表 */}
                {fileCoverages.length > 0 && (
                  <div className="rounded-xl border border-border bg-card ring-1 ring-border/40 overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
                      <button
                        type="button"
                        onClick={toggleSelectAllCoverages}
                        className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {selectedCoverageIndices.size === fileCoverages.length
                          ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                          : selectedCoverageIndices.size > 0
                            ? <CheckSquare className="h-3.5 w-3.5 text-primary/50" />
                            : <Square className="h-3.5 w-3.5" />}
                      </button>
                      <span className="text-sm font-semibold">单测未覆盖区域</span>
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                        {selectedCoverageIndices.size}/{fileCoverages.length}
                      </span>
                      {selectedCoverageIndices.size > 0 && (
                        <button
                          type="button"
                          onClick={regeneratePrompt}
                          className="ml-auto inline-flex h-6 items-center rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          重新生成
                        </button>
                      )}
                    </div>
                    <div className="divide-y divide-border/60 max-h-[280px] overflow-auto">
                      {fileCoverages.map((fc, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex items-start gap-3 px-4 py-2 cursor-pointer transition-colors duration-150 hover:bg-primary/5",
                            !selectedCoverageIndices.has(i) && "opacity-50"
                          )}
                          onClick={() => toggleCoverageSelection(i)}
                        >
                          {selectedCoverageIndices.has(i)
                            ? <CheckSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                            : <Square className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono truncate text-foreground">{fc.path}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                              {fc.ranges.map((r) =>
                                r.start === r.end ? `L${r.start}` : `L${r.start}-${r.end}`
                              ).join(" ")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 生成的 Prompt */}
                {!processing && prompt && (
                  <div className="rounded-xl border border-border bg-card ring-1 ring-border/40 overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-semibold">生成的 Prompt</span>
                        <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
                          {prompt.length}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        模板: {activeTemplate?.name || "默认"}
                      </span>
                    </div>
                    <textarea
                      className="w-full h-[320px] bg-muted/20 p-4 text-xs font-mono leading-relaxed resize-y border-0 focus:outline-none focus:ring-0"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== Tab: 模板管理 ===== */}
        {activeTab === "template" && (
          <div className="mx-auto max-w-[960px] space-y-3 px-6 py-6">
            {/* 编辑/创建表单 */}
            {(editingTemplate || isCreating) && (
              <Card>
                <CardContent className="p-4 space-y-3">
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

        {/* ===== Tab 3: 生成历史 ===== */}
        {activeTab === "history" && !detailRecord && (
          <div className="mx-auto max-w-[960px] space-y-3 px-6 py-6">
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
                <CardContent className="flex flex-col items-center py-12">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted mb-3">
                    <History className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">暂无生成历史</p>
                  <p className="text-xs text-muted-foreground mt-1">生成 Prompt 后将自动保存</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {history.map((record) => (
                  <Card key={record.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setDetailRecord(record)}>
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
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleLoadFromHistory(record); }}>
                            <RotateCcw className="h-3 w-3 mr-1" /> 加载
                          </Button>
                          <CopyButton text={record.prompt} variant="ghost" size="sm" className="h-7 text-xs" showText />
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setDeleteId(record.id); }}>
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

        {activeTab === "history" && detailRecord && (
          <div className="mx-auto max-w-[960px] space-y-3 px-6 py-6">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setDetailRecord(null)}>
                <RotateCcw className="h-3 w-3" /> 返回列表
              </Button>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleLoadFromHistory(detailRecord)}>
                  <RotateCcw className="h-3 w-3" /> 加载配置
                </Button>
                <CopyButton text={detailRecord.prompt} variant="ghost" size="sm" className="h-7 text-xs" showText />
              </div>
            </div>

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <div><span className="text-muted-foreground">项目：</span><span className="font-medium">{detailRecord.projectKey}</span></div>
                  <div><span className="text-muted-foreground">分支：</span><span className="font-medium">{detailRecord.branch}</span></div>
                  <div><span className="text-muted-foreground">截止时间：</span><span className="font-medium">{formatDateTime(detailRecord.createTimeEnd)}</span></div>
                  <div><span className="text-muted-foreground">作者过滤：</span><span className="font-medium">{detailRecord.author || "—"}</span></div>
                  <div><span className="text-muted-foreground">文件数：</span><span className="font-medium">{detailRecord.fileCount}</span></div>
                  <div><span className="text-muted-foreground">生成时间：</span><span className="font-medium">{formatTime(detailRecord.createdAt)}</span></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                  <span className="text-xs font-medium">Prompt 内容</span>
                  <CopyButton text={detailRecord.prompt} variant="ghost" size="sm" className="h-6 text-xs" showText />
                </div>
                <pre className="p-4 text-xs leading-relaxed whitespace-pre-wrap break-all max-h-[60vh] overflow-auto select-all">
                  {detailRecord.prompt}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ===== Tab 1: 覆盖率 ===== */}
        {activeTab === "coverage" && currentWeek && (
          <div className="space-y-4 px-5 py-4">
            <UnitBoardCard
              config={config}
              startDate={fmtDate(currentWeek.monday)}
              endDate={fmtDate(currentWeek.sunday)}
              weekOptions={weekOptions}
              weekIndex={weekIndex}
              onWeekIndexChange={setWeekIndex}
            />
            <UnitCoverageList startDate={fmtDate(currentWeek.monday)} endDate={fmtDate(currentWeek.sunday)} onPromptGenerate={handlePromptFromCoverage} />
          </div>
        )}

        {/* ===== Tab 5: 配置 ===== */}
        {activeTab === "settings" && (
          <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4" />
                  <span className="text-sm font-medium">Walkin 代码质量集成</span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium">扫描类型</label>
                  <div className="flex gap-2">
                    <Button
                      variant={(walkinForm.select_page_type || "代码行") === "代码行" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setWalkinForm({ ...walkinForm, select_page_type: "代码行" })}
                    >
                      代码行
                    </Button>
                    <Button
                      variant={walkinForm.select_page_type === "条件" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setWalkinForm({ ...walkinForm, select_page_type: "条件" })}
                    >
                      条件
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium">启用</label>
                  <div className="flex gap-2">
                    <Button variant={walkinForm.walkin_enabled ? "default" : "outline"} size="sm" onClick={() => setWalkinForm({ ...walkinForm, walkin_enabled: true })}>启用</Button>
                    <Button variant={!walkinForm.walkin_enabled ? "default" : "outline"} size="sm" onClick={() => setWalkinForm({ ...walkinForm, walkin_enabled: false })}>禁用</Button>
                  </div>
                </div>

                {walkinForm.walkin_enabled && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Walkin 地址</Label>
                        <Input placeholder="http://walkin.jms.com" value={walkinForm.walkin_url} onChange={(e) => setWalkinForm({ ...walkinForm, walkin_url: e.target.value })} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">部门名称</Label>
                        <Input placeholder="产品架构" value={walkinForm.walkin_dept_name} onChange={(e) => setWalkinForm({ ...walkinForm, walkin_dept_name: e.target.value })} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">部门 ID</Label>
                        <Input placeholder="a0a768d7-..." value={walkinForm.walkin_dept_id} onChange={(e) => setWalkinForm({ ...walkinForm, walkin_dept_id: e.target.value })} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">工作空间名称</Label>
                        <Input placeholder="产品架构&PMO" value={walkinForm.walkin_workspace_name} onChange={(e) => setWalkinForm({ ...walkinForm, walkin_workspace_name: e.target.value })} className="h-8 text-xs" />
                      </div>
                    </div>

                    {/* LDAP */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">LDAP 配置</Label>
                        <Button variant="outline" size="sm" className="h-6 text-xs" onClick={addLdapProfile}><Plus className="h-3 w-3 mr-1" />新增</Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {walkinForm.ldap_profiles.map((p) => (
                          <Button key={p.id} variant={walkinForm.selected_ldap_id === p.id ? "default" : "outline"} size="sm" className="h-6 text-xs" onClick={() => setWalkinForm({ ...walkinForm, selected_ldap_id: p.id })}>
                            {p.label || `LDAP ${p.id.slice(0, 6)}`}
                          </Button>
                        ))}
                      </div>
                      {walkinForm.selected_ldap_id && walkinForm.ldap_profiles.filter(p => p.id === walkinForm.selected_ldap_id).map((p) => (
                        <div key={p.id} className="border rounded p-2 bg-muted/30 space-y-2">
                          <div className="flex gap-2">
                            <Input placeholder="备注" value={p.label} onChange={(e) => updateLdapProfiles(walkinForm.ldap_profiles.map(lp => lp.id === p.id ? { ...lp, label: e.target.value } : lp))} className="h-7 text-xs" />
                            <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => deleteLdapProfile(p.id)} disabled={walkinForm.ldap_profiles.length <= 1}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Input placeholder="LDAP 用户名" value={p.username} onChange={(e) => updateLdapProfiles(walkinForm.ldap_profiles.map(lp => lp.id === p.id ? { ...lp, username: e.target.value } : lp))} className="h-7 text-xs" />
                            <Input type="password" placeholder="LDAP 密码" value={p.password} onChange={(e) => updateLdapProfiles(walkinForm.ldap_profiles.map(lp => lp.id === p.id ? { ...lp, password: e.target.value } : lp))} className="h-7 text-xs" />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 登录状态 */}
                    <div className="border rounded p-3 bg-muted/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isLoggedIn ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                          <span className="text-xs font-medium">{isLoggedIn ? `已登录: ${userName || "未知"}` : "未登录"}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={async () => { setIsCheckingLogin(true); try { await checkLogin(); } finally { setIsCheckingLogin(false); } }} disabled={isCheckingLogin}>
                            <RefreshCw className={`mr-1 h-3 w-3 ${isCheckingLogin ? "animate-spin" : ""}`} />检测
                          </Button>
                          {!isLoggedIn && (
                            <Button size="sm" className="h-7 text-xs" onClick={async () => {
                              const ldap = getSelectedLdap();
                              if (!ldap?.username || !ldap?.password) { toast.error("请先填写 LDAP 用户名和密码"); return; }
                              if (!walkinForm.walkin_url) { toast.error("请先填写 Walkin 地址"); return; }
                              try {
                                await saveConfig.mutateAsync(walkinForm);
                                await startAutoLogin(ldap, { walkin_url: walkinForm.walkin_url, walkin_project_header: walkinForm.walkin_project_header, walkin_workspace_name: walkinForm.walkin_workspace_name, ldap_profiles: walkinForm.ldap_profiles, selected_ldap_id: walkinForm.selected_ldap_id });
                              } catch (e) { toast.error("操作失败: " + (e instanceof Error ? e.message : String(e))); }
                            }}>登录</Button>
                          )}
                          <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={async () => {
                            const cleared = { ...walkinForm, walkin_csrf_token: "", walkin_project_header: "", walkin_x_auth_token: "" };
                            setWalkinForm(cleared);
                            try { await saveConfig.mutateAsync(cleared); toast.success("Token 已清除"); } catch (e) { toast.error("清除失败"); }
                          }}>清除Token</Button>
                        </div>
                      </div>
                      {walkinForm.walkin_x_auth_token && (
                        <p className="text-[10px] text-muted-foreground">Token: {walkinForm.walkin_x_auth_token.slice(0, 8)}...{walkinForm.walkin_x_auth_token.slice(-8)}</p>
                      )}
                    </div>

                    {/* 定时检测 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-muted-foreground" /><Label className="text-xs">登录状态定时检测</Label></div>
                      <div className="flex flex-wrap gap-1.5">
                        {[{ v: 0, l: "关闭" }, { v: 0.5, l: "30秒" }, { v: 10, l: "10分钟" }, { v: 30, l: "30分钟" }, { v: 60, l: "1小时" }, { v: 120, l: "2小时" }, { v: 360, l: "6小时" }].map((o) => (
                          <Button key={o.v} variant={loginCheckInterval === o.v ? "default" : "outline"} size="sm" className="h-6 text-xs" onClick={() => handleWalkinIntervalChange(o.v)}>{o.l}</Button>
                        ))}
                      </div>
                    </div>

                    {/* 项目映射 */}
                    <div className="space-y-2">
                      <Label className="text-xs">项目名称映射</Label>
                      {walkinForm.walkin_project_mappings.map((m, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input placeholder="GitLab 项目路径" value={m.gitlab_project} onChange={(e) => { const u = [...walkinForm.walkin_project_mappings]; u[idx] = { ...u[idx], gitlab_project: e.target.value }; setWalkinForm({ ...walkinForm, walkin_project_mappings: u }); }} className="h-7 text-xs flex-1" />
                          <span className="text-muted-foreground text-xs">→</span>
                          <Input placeholder="Walkin 项目名" value={m.walkin_project} onChange={(e) => { const u = [...walkinForm.walkin_project_mappings]; u[idx] = { ...u[idx], walkin_project: e.target.value }; setWalkinForm({ ...walkinForm, walkin_project_mappings: u }); }} className="h-7 text-xs flex-1" />
                          <X className="h-3.5 w-3.5 cursor-pointer hover:text-destructive shrink-0" onClick={() => setWalkinForm({ ...walkinForm, walkin_project_mappings: walkinForm.walkin_project_mappings.filter((_, i) => i !== idx) })} />
                        </div>
                      ))}
                      <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setWalkinForm({ ...walkinForm, walkin_project_mappings: [...walkinForm.walkin_project_mappings, { gitlab_project: "", walkin_project: "" }] })}>
                        <Plus className="h-3 w-3 mr-1" />添加映射
                      </Button>
                    </div>
                  </>
                )}

                <div className="flex justify-end pt-2">
                  <Button size="sm" onClick={handleSaveWalkin} disabled={saveStatus === "saving"}>
                    {saveStatus === "saving" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {saveStatus === "success" && <Check className="mr-1.5 h-3.5 w-3.5" />}
                    {saveStatus === "error" && <X className="mr-1.5 h-3.5 w-3.5" />}
                    {saveStatus === "success" ? "已保存" : saveStatus === "error" ? "保存失败" : "保存配置"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Inline confirmations */}
      {deleteId && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-card border rounded-lg px-3 py-2 shadow-lg">
          <span className="text-xs">确定删除这条记录？</span>
          <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => deleteId && handleDeleteRecord(deleteId)}>删除</Button>
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setDeleteId(null)}>取消</Button>
        </div>
      )}
      {showClearConfirm && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-card border rounded-lg px-3 py-2 shadow-lg">
          <span className="text-xs">确定清空所有历史？</span>
          <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={handleClearHistory}>清空</Button>
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setShowClearConfirm(false)}>取消</Button>
        </div>
      )}
      {deleteTemplateId && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-card border rounded-lg px-3 py-2 shadow-lg">
          <span className="text-xs">确定删除这个模板？</span>
          <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => deleteTemplateId && handleDeleteTemplate(deleteTemplateId)}>删除</Button>
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setDeleteTemplateId(null)}>取消</Button>
        </div>
      )}
    </div>
  );
}
