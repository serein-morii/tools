import { useState, useEffect, useRef, lazy } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSettings, useUpdateSetting, getSettingValue } from "@/lib/query/settingsQueries";
import { useQueryClient } from "@tanstack/react-query";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, Moon, Sun, Power, EyeOff, MonitorUp, Download, Upload, Info, Palette, Database, LayoutGrid, GripVertical, ChevronUp, ChevronDown, RotateCcw, Home, AlertTriangle, Bell, GitBranch, FileCode, Brain, Rocket, Pencil, Check, X, Settings, Sparkles, ArrowRight } from "lucide-react";
import { ToggleRow } from "@/components/ui/toggle-row";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { toast } from "sonner";
import { allModules } from "@/config/modules";
import { resetSetup } from "@/components/SetupWizard";
import { useNavigate } from "react-router-dom";

const LanguageSettings = lazy(() => import("@/components/settings/LanguageSettings").then((m) => ({ default: m.LanguageSettings })));

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: settings, isLoading, error } = useSettings();
  const updateSetting = useUpdateSetting();
  const queryClient = useQueryClient();
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [autoLaunchSystemStatus, setAutoLaunchSystemStatus] = useState<boolean>(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [dangerAction, setDangerAction] = useState<"resetConfig" | "clearCache" | null>(null);
  const { theme, setTheme } = useTheme();

  const autoLaunch = getSettingValue(settings, "auto_launch", "false") === "true";
  const silentStartup = getSettingValue(settings, "silent_startup", "false") === "true";
  const minimizeToTray = getSettingValue(settings, "minimize_to_tray", "true") === "true";

  useEffect(() => {
    invoke<boolean>("get_auto_launch_status")
      .then((status) => setAutoLaunchSystemStatus(status))
      .catch(() => setAutoLaunchSystemStatus(false));
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-full">
        <div className="page-header">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Settings className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">{t("nav.settings")}</h1>
          </div>
        </div>
        <div className="section-spacing">
          <div className="flex items-center justify-center p-12">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {t("common.loading")}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-full">
        <div className="page-header">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Settings className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">{t("nav.settings")}</h1>
          </div>
        </div>
        <div className="section-spacing">
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {t("common.error")}
          </div>
        </div>
      </div>
    );
  }

  const saveBoolean = (key: string, value: boolean) => {
    updateSetting.mutate({ key, value: value ? "true" : "false" });
  };

  const handleLanguageChange = (lang: "zh" | "en" | "ja" | "ko") => {
    i18n.changeLanguage(lang);
    window.localStorage.setItem("language", lang);
  };

  const handleAutoLaunchChange = async (value: boolean) => {
    saveBoolean("auto_launch", value);
    try {
      await invoke("set_auto_launch", { enabled: value });
      setAutoLaunchSystemStatus(value);
    } catch {
      // Ignore error
    }
  };

  const handleExport = async () => {
    setBackupMessage(null);
    setBackupError(null);
    try {
      const defaultName = `tools-backup-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}.json`;
      const path = await save({
        defaultPath: defaultName,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) {
        const result = await invoke<{ path: string; counts: { tasks: number; channels: number; templates: number; settings: number } }>(
          "export_backup",
          { request: { path } }
        );
        setBackupMessage(
          `${t("settings.exportData")}: ${result.path} (${t("nav.tasks")}: ${result.counts.tasks}, ${t("nav.channels")}: ${result.counts.channels}, ${t("nav.templates")}: ${result.counts.templates})`
        );
      }
    } catch (err) {
      setBackupError(String(err));
    }
  };

  const handleImport = async () => {
    setBackupMessage(null);
    setBackupError(null);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) {
        const result = await invoke<{ counts: { tasks: number; channels: number; templates: number; settings: number } }>(
          "import_backup",
          { request: { path } }
        );
        setBackupMessage(
          `${t("settings.importData")}: ${t("nav.tasks")}: ${result.counts.tasks}, ${t("nav.channels")}: ${result.counts.channels}, ${t("nav.templates")}: ${result.counts.templates}`
        );
        queryClient.invalidateQueries();
      }
    } catch (err) {
      setBackupError(String(err));
    }
  };

  return (
    <div className="min-h-full">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Settings className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-base font-semibold tracking-tight">{t("nav.settings")}</h1>
        </div>
      </div>
      <div className="section-spacing">
        <div className="max-w-2xl space-y-4">

        {/* 功能介绍入口 - 精美卡片 */}
        <button
          className="w-full text-left group relative overflow-hidden rounded-xl border-2 border-dashed border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 p-5 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
          onClick={() => navigate("/features")}
        >
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md group-hover:scale-105 transition-transform">
              <Sparkles className="h-7 w-7" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-semibold">功能介绍</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">v0.2.3</span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-1">
                GitLab扫描 · Sonar覆盖率 · AI统计 · DTS管理 · 智能提醒
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
          </div>
        </button>

        {/* Appearance Settings */}
        <Card className="card-modern overflow-hidden">
          <CardHeader className="bg-muted/30 border-b py-3 px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500/10">
                <Palette className="h-3.5 w-3.5 text-violet-500" />
              </div>
              <CardTitle className="text-sm font-semibold">{t("settings.appearance")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <LanguageSettings
              value={i18n.language as "zh" | "en" | "ja" | "ko"}
              onChange={handleLanguageChange}
            />

            <section className="space-y-2">
              <header>
                <h3 className="text-sm font-medium">{t("settings.theme")}</h3>
              </header>
              <div className="inline-flex gap-1 rounded-lg border bg-card p-1">
                <ThemeButton
                  active={theme === "light"}
                  onClick={() => setTheme("light")}
                  icon={Sun}
                >
                  {t("settings.themeLight")}
                </ThemeButton>
                <ThemeButton
                  active={theme === "dark"}
                  onClick={() => setTheme("dark")}
                  icon={Moon}
                >
                  {t("settings.themeDark")}
                </ThemeButton>
                <ThemeButton
                  active={theme === "system"}
                  onClick={() => setTheme("system")}
                  icon={Monitor}
                >
                  {t("settings.themeSystem")}
                </ThemeButton>
              </div>
            </section>
          </CardContent>
        </Card>

        {/* Launch Settings */}
        <Card className="card-modern overflow-hidden">
          <CardHeader className="bg-muted/30 border-b py-3 px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-500/10">
                <Power className="h-3.5 w-3.5 text-orange-500" />
              </div>
              <CardTitle className="text-sm font-semibold">{t("settings.launch")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <ToggleRow
              icon={<Power className="h-3.5 w-3.5 text-orange-500" />}
              title={t("settings.launchOnStartup")}
              description={autoLaunchSystemStatus ? "✓ " + t("common.enabled") : "— " + t("common.disabled")}
              checked={autoLaunch}
              onCheckedChange={handleAutoLaunchChange}
            />

            {autoLaunch && (
              <ToggleRow
                icon={<EyeOff className="h-3.5 w-3.5 text-emerald-500" />}
                title={t("settings.silentStartup")}
                description={t("settings.silentStartupDescription")}
                checked={silentStartup}
                onCheckedChange={(value) => saveBoolean("silent_startup", value)}
              />
            )}

            <ToggleRow
              icon={<MonitorUp className="h-3.5 w-3.5 text-purple-500" />}
              title={t("settings.minimizeToTray")}
              description={t("settings.minimizeToTrayDescription")}
              checked={minimizeToTray}
              onCheckedChange={(value) => saveBoolean("minimize_to_tray", value)}
            />
          </CardContent>
        </Card>

        {/* Default Startup Page */}
        <Card>
          <CardHeader className="bg-muted/30 border-b py-2 px-3">
            <div className="flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5 text-indigo-500" />
              <CardTitle className="text-sm">启动页</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-2">选择打开应用时默认显示的页面</p>
            <SearchableSelect
              value={getSettingValue(settings, "startup_page", "/home")}
              onChange={(v) => updateSetting.mutate({ key: "startup_page", value: v })}
              options={[
                { value: "/home", label: "概览", icon: Home },
                { value: "/reminder/tasks", label: "智能提醒", icon: Bell },
                { value: "/gitlab/overview", label: "Git 扫描", icon: GitBranch },
                { value: "/sonar", label: "单测覆盖率", icon: FileCode },
                { value: "/ai-coverage", label: "AI 生成率", icon: Brain },
                { value: "/dts", label: "DTS 任务", icon: Database },
              ]}
              placeholder="选择启动页"
              size="md"
            />
          </CardContent>
        </Card>

        {/* Page Visibility + Ordering */}
        <Card className="card-modern overflow-hidden">
          <CardHeader className="bg-muted/30 border-b py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/10">
                  <LayoutGrid className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <CardTitle className="text-sm font-semibold">菜单与页面</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <ReorderableMenuList
              settings={settings}
              updateSetting={updateSetting}
              dragIdx={dragIdx}
              setDragIdx={setDragIdx}
            />
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card className="card-modern overflow-hidden">
          <CardHeader className="bg-muted/30 border-b py-3 px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10">
                <Database className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <CardTitle className="text-sm font-semibold">{t("settings.dataManagement")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
                <Download className="h-4 w-4" />
                {t("settings.exportData")}
              </Button>
              <Button variant="outline" size="sm" onClick={handleImport} className="gap-1.5">
                <Upload className="h-4 w-4" />
                {t("settings.importData")}
              </Button>
            </div>
            {backupMessage && <p className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-lg">{backupMessage}</p>}
            {backupError && <p className="text-xs text-destructive bg-destructive/10 p-3 rounded-lg">{backupError}</p>}
          </CardContent>
        </Card>

        {/* Setup Wizard */}
        <Card className="card-modern overflow-hidden">
          <CardHeader className="bg-muted/30 border-b py-3 px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                <Rocket className="h-3.5 w-3.5 text-primary" />
              </div>
              <CardTitle className="text-sm font-semibold">配置引导</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div>
                <p className="text-sm font-medium">重新打开引导页</p>
                <p className="text-xs text-muted-foreground mt-0.5">重新配置 GitLab 和 Walkin 连接</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => {
                if (window.confirm("确定要重新打开引导页吗？应用将重新加载。")) {
                  resetSetup();
                  window.location.reload();
                }
              }}>
                <Rocket className="h-4 w-4 mr-1.5" />打开引导
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Reset & Clear - Collapsible */}
        <Card className="card-modern overflow-hidden border-destructive/30">
          <button
            type="button"
            className="w-full bg-destructive/5 border-b border-destructive/20 py-3 px-4 flex items-center justify-between hover:bg-destructive/10 transition-colors"
            onClick={() => setShowDangerZone(!showDangerZone)}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <CardTitle className="text-sm font-semibold text-destructive">危险操作</CardTitle>
              <span className="text-xs text-muted-foreground ml-1">（点击展开）</span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-destructive transition-transform", showDangerZone && "rotate-180")} />
          </button>
          {showDangerZone && (
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl border bg-card p-4">
                <div>
                  <p className="text-sm font-medium">重置所有配置</p>
                  <p className="text-xs text-muted-foreground mt-0.5">恢复所有设置项到默认值，保留数据</p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => {
                  setDangerAction("resetConfig");
                }}>
                  <RotateCcw className="h-4 w-4 mr-1.5" />重置配置
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-xl border bg-card p-4">
                <div>
                  <p className="text-sm font-medium">清除本地缓存</p>
                  <p className="text-xs text-muted-foreground mt-0.5">清除所有本地缓存数据，建议重启应用</p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => {
                  setDangerAction("clearCache");
                }}>
                  <RotateCcw className="h-4 w-4 mr-1.5" />清除缓存
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Danger Action Confirmation Dialog */}
        {dangerAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <Card className="w-[400px] mx-4 shadow-2xl">
              <CardHeader className="bg-destructive/10 border-b py-4 px-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <CardTitle className="text-lg font-semibold text-destructive">确认操作</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground mb-5">
                  {dangerAction === "resetConfig"
                    ? "确定要重置所有设置吗？此操作不可撤销，将恢复全部配置到默认值。"
                    : "确定要清除所有本地缓存吗？建议重启应用。"}
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDangerAction(null)}>
                    取消
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (dangerAction === "resetConfig") {
                        (settings || []).forEach(s => updateSetting.mutate({ key: s.key, value: "" }));
                        queryClient.invalidateQueries();
                        toast.success("所有设置已重置");
                      } else if (dangerAction === "clearCache") {
                        localStorage.clear();
                        sessionStorage.clear();
                        queryClient.clear();
                        toast.success("缓存已清除，建议重启应用");
                      }
                      setDangerAction(null);
                    }}
                  >
                    确认
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* About */}
        <Card className="card-modern overflow-hidden">
          <CardHeader className="bg-muted/30 border-b py-3 px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <CardTitle className="text-sm font-semibold">{t("settings.about")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("settings.version")}</span>
              <span className="font-mono font-medium">{__APP_VERSION__}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("settings.framework")}</span>
              <span className="font-medium">Tauri v2 + React 19</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("settings.author")}</span>
              <span className="font-medium">Pedro</span>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}

interface ThemeButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}

function ThemeButton({ active, onClick, icon: Icon, children }: ThemeButtonProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      size="sm"
      variant={active ? "default" : "ghost"}
      className={cn(
        "min-w-[80px] gap-1.5",
        active
          ? "shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Button>
  );
}

const PAGES = allModules
  .filter(m => m.settingKey)
  .map(m => ({ key: m.settingKey!, id: m.id, label: m.label, labelKey: m.labelKey, icon: m.icon }));

function ReorderableMenuList({ settings, updateSetting, dragIdx, setDragIdx }: {
  settings: any; updateSetting: any; dragIdx: number | null; setDragIdx: (v: number | null) => void;
}) {
  const raw = getSettingValue(settings, "menu_order", "");
  const order: string[] = raw ? JSON.parse(raw) : PAGES.map(p => p.id);
  const sorted = [...PAGES].sort((a, b) => {
    const ai = order.indexOf(a.id); const bi = order.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  const orderRef = useRef(order);
  const sortedRef = useRef(sorted);
  const updateRef = useRef(updateSetting);
  useEffect(() => {
    orderRef.current = order;
    sortedRef.current = sorted;
    updateRef.current = updateSetting;
  }, [order, sorted, updateSetting]);
  const dragRef = useRef<number | null>(null);

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    const newOrder = [...orderRef.current];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    updateSetting.mutate({ key: "menu_order", value: JSON.stringify(newOrder) });
  };
  const moveDown = (idx: number) => {
    if (idx >= sortedRef.current.length - 1) return;
    const newOrder = [...orderRef.current];
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    updateSetting.mutate({ key: "menu_order", value: JSON.stringify(newOrder) });
  };

  const onPointerDown = (e: React.PointerEvent, idx: number) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = idx;
    setDragIdx(idx);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current === null) return;
    document.querySelectorAll("[data-menu-item]").forEach(el => el.classList.remove("ring-2", "ring-primary"));
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-menu-item]");
    if (target) target.classList.add("ring-2", "ring-primary");
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current === null) return;
    const fromIdx = dragRef.current;
    dragRef.current = null;
    document.querySelectorAll("[data-menu-item]").forEach(el => el.classList.remove("ring-2", "ring-primary"));
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-menu-item]");
    const targetIdx = target ? parseInt(target.getAttribute("data-menu-item") || "-1") : -1;
    if (targetIdx >= 0 && fromIdx !== targetIdx) {
      const ord = orderRef.current;
      const srt = sortedRef.current;
      const newOrder = [...ord];
      const movedId = srt[fromIdx].id;
      const oldPos = newOrder.indexOf(movedId);
      if (oldPos >= 0) {
        newOrder.splice(oldPos, 1);
        const targetId = srt[targetIdx].id;
        const targetPos = newOrder.indexOf(targetId);
        newOrder.splice(targetPos, 0, movedId);
        updateRef.current.mutate({ key: "menu_order", value: JSON.stringify(newOrder) });
      }
    }
    setDragIdx(null);
  };

  const itemClass = (idx: number, visible: boolean) => cn(
    "flex items-center gap-1.5 rounded-lg border p-2 transition-colors select-none",
    dragIdx === idx ? "opacity-50 bg-muted/30" : "bg-card/50 hover:bg-muted/30",
    !visible && "opacity-60"
  );

  return (
    <div className="space-y-1.5">
      <div className={itemClass(-1, true)}>
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30" />
        <div className="flex flex-col gap-0.5 shrink-0">
          <button disabled className="h-3 w-4 flex items-center justify-center opacity-20"><ChevronUp className="h-2.5 w-2.5" /></button>
          <button disabled className="h-3 w-4 flex items-center justify-center opacity-20"><ChevronDown className="h-2.5 w-2.5" /></button>
        </div>
        <div className="flex items-center gap-1.5 flex-1 text-xs">
          <Home className="h-3.5 w-3.5 text-muted-foreground" />概览
        </div>
        <div className="flex gap-1"><Switch checked disabled /></div>
      </div>
      {sorted.map((page, idx) => {
        const visible = getSettingValue(settings, page.key, "true") === "true";
        return (
          <MenuItemRow
            key={page.id}
            idx={idx}
            page={page}
            visible={visible}
            settings={settings}
            updateSetting={updateSetting}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            itemClass={itemClass}
            moveUp={moveUp}
            moveDown={moveDown}
            sortedLength={sorted.length}
          />
        );
      })}
    </div>
  );
}

function MenuItemRow({
  idx, page, visible, settings, updateSetting,
  onPointerDown, onPointerMove, onPointerUp, itemClass, moveUp, moveDown, sortedLength,
}: {
  idx: number;
  page: { id: string; key: string; label: string; labelKey: string; icon: React.ComponentType<{ className?: string }> };
  visible: boolean;
  settings: any;
  updateSetting: any;
  onPointerDown: (e: React.PointerEvent, idx: number) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  itemClass: (idx: number, visible: boolean) => string;
  moveUp: (idx: number) => void;
  moveDown: (idx: number) => void;
  sortedLength: number;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const customLabelKey = `menu_label_${page.id}`;
  const customLabel = getSettingValue(settings, customLabelKey, "");
  const defaultLabel = t(page.labelKey);
  const displayLabel = customLabel || defaultLabel;

  const startEdit = () => {
    setDraft(customLabel || defaultLabel);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    const next = draft.trim();
    if (next && next !== defaultLabel) {
      updateSetting.mutate({ key: customLabelKey, value: next });
    } else if (!next) {
      updateSetting.mutate({ key: customLabelKey, value: "" });
    }
    setEditing(false);
  };

  const cancel = () => {
    setEditing(false);
  };

  const reset = () => {
    updateSetting.mutate({ key: customLabelKey, value: "" });
    toast.success("已重置为默认名称");
  };

  return (
    <div
      data-menu-item={idx}
      onPointerDown={(e) => onPointerDown(e, idx)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={itemClass(idx, visible)}
      style={{ touchAction: "none" }}
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 cursor-grab active:cursor-grabbing" />
      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={(e) => { e.stopPropagation(); moveUp(idx); }} disabled={idx === 0} className="h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-2.5 w-2.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); moveDown(idx); }} disabled={idx === sortedLength - 1} className="h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-2.5 w-2.5" /></button>
      </div>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <page.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {editing ? (
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { e.preventDefault(); cancel(); }
            }}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-6 text-xs flex-1 min-w-0"
            maxLength={20}
          />
        ) : (
          <span className="text-xs truncate" title={displayLabel}>{displayLabel}</span>
        )}
      </div>
      {editing ? (
        <div className="flex gap-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); commit(); }} className="h-6 w-6 flex items-center justify-center text-emerald-600 hover:bg-muted rounded"><Check className="h-3 w-3" /></button>
          <button onClick={(e) => { e.stopPropagation(); cancel(); }} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:bg-muted rounded"><X className="h-3 w-3" /></button>
        </div>
      ) : (
        <div className="flex gap-1 shrink-0">
          {customLabel ? (
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              title="重置为默认"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          ) : null}
          <button
            onClick={(e) => { e.stopPropagation(); startEdit(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            title="重命名"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      )}
      <Switch
        checked={visible}
        onCheckedChange={(checked) => updateSetting.mutate({ key: page.key, value: checked ? "true" : "false" })}
      />
    </div>
  );
}