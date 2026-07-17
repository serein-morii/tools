import { useState, useEffect, useCallback } from "react";
import {
  FolderOpen, ArrowRightLeft, Search, Play, Undo2, Undo,
  Image, FileText, Archive, Download, Code, Video, Music, Folder,
  Plus, Trash2, CheckCircle2, Loader2, X, Edit3, Save,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getDesktopPath, organizeDesktop, getBuiltinRules,
  getCustomRules, saveCustomRules,
  undoOrganize, hasUndoData, restoreAllFromFolders, quickScan, formatFileSize,
  type OrganizeRule, type OrganizeResult, type FileMove,
} from "@/lib/api/organizer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ==================== 常量 ====================

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "图片": Image,
  "文档": FileText,
  "压缩包": Archive,
  "安装包": Download,
  "代码": Code,
  "视频": Video,
  "音频": Music,
  "文件夹": Folder,
  "其他": Folder,
};

const CATEGORY_COLORS: Record<string, string> = {
  "图片": "text-rose-500 bg-rose-500/10",
  "文档": "text-blue-500 bg-blue-500/10",
  "压缩包": "text-amber-500 bg-amber-500/10",
  "安装包": "text-emerald-500 bg-emerald-500/10",
  "代码": "text-violet-500 bg-violet-500/10",
  "视频": "text-orange-500 bg-orange-500/10",
  "音频": "text-cyan-500 bg-cyan-500/10",
  "文件夹": "text-yellow-600 bg-yellow-500/10",
  "其他": "text-slate-500 bg-slate-500/10",
};

// ==================== 页面组件 ====================

export function OrganizerPage() {
  // 核心状态
  const [sourceDir, setSourceDir] = useState("");
  const [desktopPath, setDesktopPath] = useState("");
  const [builtinRules, setBuiltinRules] = useState<OrganizeRule[]>([]);
  const [customRules, setCustomRules] = useState<OrganizeRule[]>([]);
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(new Set());
  const [otherFolder, setOtherFolder] = useState("其他");
  const [includeBuiltin, setIncludeBuiltin] = useState(true);
  const [excludeExtensions, setExcludeExtensions] = useState("lnk, url");
  const [excludePatterns, setExcludePatterns] = useState("");

  // UI 状态
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OrganizeResult | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  // 自定义规则编辑器状态
  const [editRule, setEditRule] = useState<OrganizeRule | null>(null);  // null=关闭, 有值=编辑态
  const [editCategory, setEditCategory] = useState("");
  const [editExtensions, setEditExtensions] = useState("");
  const [editPatterns, setEditPatterns] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // null=新增, number=编辑

  // 快速扫描计数
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  const [totalFilesCount, setTotalFilesCount] = useState(0);
  const [scanVersion, setScanVersion] = useState(0);

  // 暴力还原确认弹窗
  const [showRestoreAllConfirm, setShowRestoreAllConfirm] = useState(false);
  const [restoreAllInput, setRestoreAllInput] = useState("");

  // 初始化
  useEffect(() => {
    (async () => {
      try {
        const desktop = await getDesktopPath();
        setDesktopPath(desktop);
        setSourceDir(desktop);
      } catch { /* fallback */ }

      try {
        const builtin = await getBuiltinRules();
        setBuiltinRules(builtin);
        setEnabledCategories(new Set(builtin.map((r) => r.category)));
      } catch { /* fallback */ }

      try {
        const saved = await getCustomRules();
        setCustomRules(saved);
        // 自定义规则的分类也加入启用集合
        setEnabledCategories((prev) => {
          const next = new Set(prev);
          for (const r of saved) next.add(r.category);
          return next;
        });
      } catch { /* fallback */ }

      try {
        const undo = await hasUndoData();
        setCanUndo(undo);
      } catch { /* fallback */ }
    })();
  }, []);

  // 快速扫描：配置变化时自动刷新每个分类的真实文件数
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rules = activeRules();
        const r = await quickScan({
          source_dir: sourceDir || undefined,
          custom_rules: rules,
          include_builtin: false,
          exclude_extensions: excludeExtensions.split(/[,，\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean),
          exclude_patterns: excludePatterns.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean),
          other_folder: otherFolder || "其他",
          include_folders: includeFolders(),
        });
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const item of r) {
          map[item.category] = item.count;
        }
        setFileCounts(map);
        setTotalFilesCount(r.reduce((s, item) => s + item.count, 0));
      } catch { /* ignore scan errors on page load */ }
    })();
    return () => { cancelled = true; };
  }, [sourceDir, otherFolder, includeBuiltin, enabledCategories, excludeExtensions, excludePatterns, scanVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- activeRules depends on several deps

  // 获取所有启用的规则（用于匹配）
  const activeRules = useCallback((): OrganizeRule[] => {
    const all: OrganizeRule[] = [];

    // 自定义规则优先
    for (const r of customRules) {
      if (enabledCategories.has(r.category)) {
        all.push(r);
      }
    }

    // 内置规则
    if (includeBuiltin) {
      for (const r of builtinRules) {
        if (enabledCategories.has(r.category)) {
          all.push(r);
        }
      }
    }

    return all;
  }, [builtinRules, customRules, enabledCategories, includeBuiltin]);

  // 自动推导：是否有任何启用的规则标记了 for_folders（有则扫描文件夹）
  const includeFolders = useCallback((): boolean => {
    return activeRules().some((r) => r.for_folders === true);
  }, [activeRules]);

  // 切换分类
  const toggleCategory = useCallback((category: string) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  // ===== 自定义规则操作 =====

  const openAddRule = useCallback(() => {
    setEditingIndex(null);
    setEditCategory("");
    setEditExtensions("");
    setEditPatterns("");
    setEditRule({ category: "", extensions: [], filename_patterns: [] });
  }, []);

  const openEditRule = useCallback((index: number) => {
    const rule = customRules[index];
    setEditingIndex(index);
    setEditCategory(rule.category);
    setEditExtensions(rule.extensions.join(", "));
    setEditPatterns(rule.filename_patterns.join(", "));
    setEditRule(rule);
  }, [customRules]);

  const closeRuleEditor = useCallback(() => {
    setEditRule(null);
    setEditingIndex(null);
  }, []);

  const handleSaveRule = useCallback(async () => {
    const cat = editCategory.trim();
    if (!cat) {
      toast.warning("请输入分类名称");
      return;
    }
    const exts = editExtensions
      .split(/[,，\s]+/)
      .map((s) => s.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean);
    const patterns = editPatterns
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const rule: OrganizeRule = {
      category: cat,
      extensions: exts,
      filename_patterns: patterns,
    };

    let updated: OrganizeRule[];
    if (editingIndex !== null) {
      updated = [...customRules];
      updated[editingIndex] = rule;
    } else {
      updated = [...customRules, rule];
    }

    setCustomRules(updated);
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      next.add(cat);
      return next;
    });

    try {
      await saveCustomRules(updated);
      toast.success(editingIndex !== null ? "规则已更新" : "规则已添加");
    } catch (e) {
      toast.error(`保存规则失败: ${e instanceof Error ? e.message : String(e)}`);
    }

    closeRuleEditor();
  }, [editCategory, editExtensions, editPatterns, editingIndex, customRules, closeRuleEditor]);

  const handleDeleteRule = useCallback(async (index: number) => {
    const updated = customRules.filter((_, i) => i !== index);
    setCustomRules(updated);
    try {
      await saveCustomRules(updated);
      toast.success("规则已删除");
    } catch (e) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [customRules]);

  // ===== 整理操作 =====

  const handlePreview = useCallback(async () => {
    const rules = activeRules();
    if (rules.length === 0) {
      toast.warning("请至少启用一个分类规则");
      return;
    }
    setLoading(true);
    try {
      const r = await organizeDesktop({
        source_dir: sourceDir || undefined,
        custom_rules: rules,
        preview: true,
        other_folder: otherFolder || "其他",
        include_builtin: false,
        exclude_extensions: excludeExtensions.split(/[,，\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean),
        exclude_patterns: excludePatterns.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean),
        include_folders: includeFolders(),
      });
      setResult(r);
      if (r.organized === 0) {
        toast.info("没有需要整理的文件，目录很干净！");
      }
    } catch (e) {
      toast.error(`扫描失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [activeRules, sourceDir, otherFolder]);

  const handleExecute = useCallback(async () => {
    const rules = activeRules();
    if (rules.length === 0) return;
    setLoading(true);
    try {
      const r = await organizeDesktop({
        source_dir: sourceDir || undefined,
        custom_rules: rules,
        preview: false,
        other_folder: otherFolder || "其他",
        include_builtin: false,
        exclude_extensions: excludeExtensions.split(/[,，\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean),
        exclude_patterns: excludePatterns.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean),
        include_folders: includeFolders(),
      });
      setResult(r);
      setCanUndo(true);
      setScanVersion((v) => v + 1);
      toast.success(`整理完成！移动 ${r.organized} 个文件${r.skipped > 0 ? `，跳过 ${r.skipped} 个` : ""}`);
    } catch (e) {
      toast.error(`整理失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [activeRules, sourceDir, otherFolder]);

  const handleUndo = useCallback(async () => {
    setLoading(true);
    try {
      const r = await undoOrganize();
      setResult(null);
      setCanUndo(false);
      setScanVersion((v) => v + 1);
      if (r.failed === 0) {
        toast.success(`已还原 ${r.restored} 个文件`);
      } else {
        toast.warning(`还原 ${r.restored} 个，${r.failed} 个失败`);
      }
    } catch (e) {
      toast.error(`还原失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRestoreAll = useCallback(async () => {
    setShowRestoreAllConfirm(false);
    setLoading(true);
    try {
      const r = await restoreAllFromFolders(sourceDir || undefined);
      setResult(null);
      setCanUndo(false);
      setScanVersion((v) => v + 1);
      if (r.failed === 0 && r.restored > 0) {
        toast.success(`已全部还原 ${r.restored} 个文件到桌面`);
      } else if (r.restored > 0) {
        toast.warning(`还原 ${r.restored} 个，${r.failed} 个失败`);
      } else {
        toast.info("没有找到需要还原的文件");
      }
    } catch (e) {
      toast.error(`还原失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [sourceDir]);

  const handleReset = useCallback(() => {
    setResult(null);
  }, []);

  // ===== 结果统计 =====

  const categoryStats = useCallback(() => {
    if (!result) return new Map<string, FileMove[]>();
    const map = new Map<string, FileMove[]>();
    for (const d of result.details) {
      const list = map.get(d.category) || [];
      list.push(d);
      map.set(d.category, list);
    }
    return map;
  }, [result]);

  const stats = categoryStats();

  // ===== 渲染 =====

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <FolderOpen className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold ">桌面整理</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                按文件类型/文件名模式自动归类 + 一键还原
                {totalFilesCount > 0 && (
                  <span className="ml-2 text-primary font-medium">{totalFilesCount} 文件</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="section-spacing animate-in fade-in duration-200">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ===== 左侧：配置面板 ===== */}
          <div className="lg:col-span-1 space-y-3">
            {/* 来源目录 */}
            <div className="card-modern p-3">
              <Label className="text-xs font-medium mb-2 block">来源目录</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={sourceDir}
                  onChange={(e) => setSourceDir(e.target.value)}
                  placeholder="桌面路径..."
                  className="text-xs h-8 flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  onClick={() => setSourceDir(desktopPath)}
                  title="重置为桌面"
                >
                  <Undo2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* 包含内置规则开关 */}
            <div className="card-modern p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">使用内置分类规则</Label>
                <Switch
                  checked={includeBuiltin}
                  onCheckedChange={setIncludeBuiltin}
                />
              </div>
            </div>

            {/* 内置规则列表 */}
            {includeBuiltin && builtinRules.length > 0 && (
              <div className="card-modern p-3">
                <Label className="text-xs font-medium mb-2 block">
                  内置规则
                  <span className="text-muted-foreground font-normal ml-1">
                    ({[...enabledCategories].filter((c) => builtinRules.some((r) => r.category === c)).length}/{builtinRules.length})
                  </span>
                </Label>
                <div className="space-y-0.5 max-h-[240px] overflow-y-auto">
                  {builtinRules.map((rule) => {
                    const Icon = CATEGORY_ICONS[rule.category] || Folder;
                    const color = CATEGORY_COLORS[rule.category] || "text-muted-foreground bg-muted";
                    const enabled = enabledCategories.has(rule.category);
                    return (
                      <button
                        key={rule.category}
                        onClick={() => toggleCategory(rule.category)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-medium transition-all duration-150",
                          enabled ? "bg-muted/50 hover:bg-muted" : "opacity-40 hover:opacity-60"
                        )}
                      >
                        <div className={cn(
                          "flex h-4.5 w-4.5 items-center justify-center rounded transition-all shrink-0",
                          enabled ? "bg-background border shadow-sm" : "border border-dashed"
                        )}>
                          {enabled && <CheckCircle2 className="h-3 w-3 text-primary" />}
                        </div>
                        <div className={cn("flex h-5.5 w-5.5 items-center justify-center rounded", color)}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className="flex-1 text-left text-[11px]">{rule.category}</span>
                        <span className={cn(
                          "text-[10px] tabular-nums",
                          (fileCounts[rule.category] || 0) > 0
                            ? "text-primary font-semibold"
                            : "text-muted-foreground"
                        )}>
                          {fileCounts[rule.category] ?? "-"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 自定义规则 */}
            <div className="card-modern p-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-medium">
                  自定义规则
                  <span className="text-muted-foreground font-normal ml-1">({customRules.length})</span>
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={openAddRule}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  添加
                </Button>
              </div>

              {customRules.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-3">
                  暂无自定义规则，点击「添加」创建
                </p>
              ) : (
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {customRules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
                    >
                      <button
                        onClick={() => toggleCategory(rule.category)}
                        className="shrink-0"
                      >
                        <div className={cn(
                          "flex h-4 w-4 items-center justify-center rounded transition-all",
                          enabledCategories.has(rule.category)
                            ? "bg-background border shadow-sm"
                            : "border border-dashed"
                        )}>
                          {enabledCategories.has(rule.category) && (
                            <CheckCircle2 className="h-3 w-3 text-primary" />
                          )}
                        </div>
                      </button>
                      <span className="flex-1 text-[11px] font-medium truncate">{rule.category}</span>
                      <span className={cn(
                        "text-[10px] tabular-nums shrink-0",
                        (fileCounts[rule.category] || 0) > 0
                          ? "text-primary font-semibold"
                          : "text-muted-foreground"
                      )}>
                        {fileCounts[rule.category] ?? "-"}
                      </span>
                      <button
                        onClick={() => openEditRule(idx)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded"
                      >
                        <Edit3 className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(idx)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded"
                      >
                        <Trash2 className="h-3 w-3 text-rose-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 排除规则 */}
            <div className="card-modern p-3">
              <Label className="text-xs font-medium mb-2 block">排除规则 · 跳过不整理</Label>
              <div className="space-y-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">排除扩展名</Label>
                  <Input
                    value={excludeExtensions}
                    onChange={(e) => setExcludeExtensions(e.target.value)}
                    placeholder="逗号分隔，如: lnk, tmp, bak"
                    className="text-xs h-7"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">排除文件名模式</Label>
                  <Input
                    value={excludePatterns}
                    onChange={(e) => setExcludePatterns(e.target.value)}
                    placeholder='逗号分隔，如: *.tmp, ~*, desktop.ini'
                    className="text-xs h-7"
                  />
                </div>
              </div>
            </div>

            {/* 其他文件夹名 */}
            <div className="card-modern p-3">
              <Label className="text-xs font-medium mb-1.5 block">未匹配文件归入</Label>
              <Input
                value={otherFolder}
                onChange={(e) => setOtherFolder(e.target.value)}
                className="text-xs h-7"
                placeholder="其他"
              />
            </div>

            {/* 操作按钮 */}
            <div className="space-y-2">
              {(!result || result.preview_mode) ? (
                <>
                  <Button
                    className="w-full"
                    onClick={handlePreview}
                    disabled={loading || activeRules().length === 0}
                  >
                    {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                    预览扫描
                  </Button>
                  {result && result.preview_mode && result.organized > 0 && (
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleExecute}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                      确认执行整理
                    </Button>
                  )}
                </>
              ) : (
                <Button className="w-full" variant="outline" onClick={handleReset}>
                  <Play className="h-4 w-4 mr-2" />再次整理
                </Button>
              )}

              {/* 还原按钮 — 始终可见 */}
              <Button
                className="w-full"
                variant="outline"
                onClick={handleUndo}
                disabled={loading || !canUndo}
                title={canUndo ? "还原上次整理操作" : "暂无可还原的操作"}
              >
                {loading && canUndo ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Undo className="h-4 w-4 mr-2" />
                )}
                {canUndo ? "还原上次整理" : "没有可还原的操作"}
              </Button>

              {/* 暴力还原按钮 — 红色警告 */}
              <Button
                className="w-full"
                variant="destructive"
                onClick={() => { setRestoreAllInput(""); setShowRestoreAllConfirm(true); }}
                disabled={loading}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                全部移回桌面
              </Button>
            </div>

            {/* 说明 */}
            <div className="rounded-lg bg-muted/30 p-3 text-[11px] text-muted-foreground space-y-1.5">
              <p className="font-medium text-xs">💡 使用说明</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>点「预览扫描」查看归类结果</li>
                <li>确认后点「确认执行」完成移动</li>
                <li>自定义规则支持扩展名 + 文件名通配符</li>
                <li>通配符示例: <code className="bg-muted px-1 rounded">*.log</code>、<code className="bg-muted px-1 rounded">temp_*</code></li>
                <li>执行后可用「还原」撤回全部操作</li>
                <li>隐藏文件和已归类文件夹会被跳过</li>
              </ul>
            </div>
          </div>

          {/* ===== 右侧：结果面板 ===== */}
          <div className="lg:col-span-2 space-y-3">
            {!result ? (
              <div className="card-modern flex flex-col items-center py-16 text-muted-foreground">
                <FolderOpen className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">点击「预览扫描」查看归类结果</p>
                <p className="text-xs mt-1">可在左侧自定义分类规则</p>
              </div>
            ) : result.organized === 0 ? (
              <div className="card-modern flex flex-col items-center py-16">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
                <p className="text-sm font-medium">没有需要整理的文件</p>
                <p className="text-xs text-muted-foreground mt-1">目录已经很干净了！</p>
              </div>
            ) : (
              <>
                {/* 统计概览 */}
                <div className="card-modern p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {result.preview_mode ? (
                        <Search className="h-4 w-4 text-primary" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      )}
                      <span className="text-sm font-semibold">
                        {result.preview_mode ? "预览结果" : "整理完成"}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[60%]" title={result.source_dir}>
                      {result.source_dir}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <StatBlock label="扫描文件" value={result.total_files} color="text-muted-foreground" />
                    <StatBlock label={result.preview_mode ? "将移动" : "已移动"} value={result.organized} color="text-primary" />
                    <StatBlock label="跳过" value={result.skipped} color="text-muted-foreground" />
                    <StatBlock label="新建文件夹" value={result.folders_created.length} color="text-emerald-600" />
                  </div>
                </div>

                {/* 按分类统计 */}
                <div className="card-modern p-3">
                  <Label className="text-xs font-medium mb-2 block">按分类统计</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[...stats.entries()].map(([category, files]) => {
                      const Icon = CATEGORY_ICONS[category] || Folder;
                      const color = CATEGORY_COLORS[category] || "text-muted-foreground bg-muted";
                      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
                      return (
                        <div key={category} className="flex items-center gap-2 rounded-lg bg-muted/30 p-2">
                          <div className={cn("flex h-8 w-7 items-center justify-center rounded-lg shrink-0", color)}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate">{category}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {files.length} 文件 · {formatFileSize(totalSize)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 文件详情列表 */}
                <div className="card-modern overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 border-b flex items-center justify-between">
                    <span className="text-xs font-medium">文件详情</span>
                    <span className="text-[10px] text-muted-foreground">共 {result.details.length} 个</span>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-background z-10">
                        <tr className="border-b border-border/40">
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground w-8">#</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">文件名</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground w-20">分类</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground w-16">大小</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.details.map((f, i) => (
                          <tr key={i} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                            <td className="py-1.5 px-3 text-muted-foreground tabular-nums">{i + 1}</td>
                            <td className="py-1.5 px-3 truncate max-w-[300px]" title={f.file_name}>{f.file_name}</td>
                            <td className="py-1.5 px-3">
                              <span className={cn(
                                "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                                CATEGORY_COLORS[f.category]?.split(" ")[0] || "text-muted-foreground",
                                CATEGORY_COLORS[f.category]?.split(" ")[1] || "bg-muted",
                              )}>
                                {f.category}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 text-right text-muted-foreground tabular-nums">{formatFileSize(f.size)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== 暴力还原确认弹窗 ===== */}
      {showRestoreAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-background rounded-lg shadow-xl w-[460px] max-w-[calc(100vw-32px)] overflow-hidden">
            {/* 红色警告标题 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-rose-500/30 bg-rose-500/10">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
                <span className="text-sm font-semibold text-rose-700">⚠️ 危险操作 · 二次确认</span>
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowRestoreAllConfirm(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="px-4 py-4 space-y-3 text-sm">
              <p className="font-medium">确定要将<strong>所有</strong>分类文件夹中的文件全部移回桌面？</p>

              <div className="bg-rose-500/10 rounded-lg p-3 text-xs space-y-1.5 text-rose-700 border border-rose-500/20">
                <p>• 会扫描源目录下<strong>所有子文件夹</strong>中的文件</p>
                <p>• 全部移回源目录，删除空的子文件夹</p>
                <p>• <strong>此操作不可撤销</strong>（与"还原上次整理"不同）</p>
                <p>• 重名文件会自动加 <code className="bg-rose-100 px-1 rounded">_restored_N</code> 后缀</p>
              </div>

              {/* 输入确认 */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  请输入 <code className="bg-muted px-1.5 py-0.5 rounded text-rose-600 font-bold">确认</code> 以继续
                </Label>
                <Input
                  value={restoreAllInput}
                  onChange={(e) => setRestoreAllInput(e.target.value)}
                  placeholder='输入"确认"'
                  className="h-8 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && restoreAllInput === "确认") {
                      handleRestoreAll();
                    }
                  }}
                />
              </div>
            </div>

            <div className="px-4 py-3 border-t border-border/50 bg-muted/30 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowRestoreAllConfirm(false)}>取消</Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleRestoreAll}
                disabled={restoreAllInput !== "确认"}
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                确认全部移回
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 自定义规则编辑弹窗 ===== */}
      {editRule !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl w-[480px] max-w-[calc(100vw-32px)] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30 shrink-0">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">
                  {editingIndex !== null ? "编辑规则" : "添加规则"}
                </span>
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={closeRuleEditor}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">分类名称 *</Label>
                <Input
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder='如 "日志文件"、"临时文件"'
                  autoFocus
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">扩展名</Label>
                <Input
                  value={editExtensions}
                  onChange={(e) => setEditExtensions(e.target.value)}
                  placeholder="逗号分隔，如: log, tmp, bak"
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">不含点号，大小写不敏感</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">文件名通配符</Label>
                <Input
                  value={editPatterns}
                  onChange={(e) => setEditPatterns(e.target.value)}
                  placeholder="逗号分隔，如: *.log, temp_*, backup-*"
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground"><code className="bg-muted px-1 rounded">*</code> 匹配任意字符，优先级高于扩展名</p>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-border/50 bg-muted/30 shrink-0 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={closeRuleEditor}>取消</Button>
              <Button size="sm" onClick={handleSaveRule} disabled={!editCategory.trim()}>
                <Save className="h-3.5 w-3.5 mr-1" />
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 小组件 ====================

function StatBlock({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-muted/30 p-2.5">
      <div className={cn("text-xl font-bold tabular-nums", color)}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export default OrganizerPage;
