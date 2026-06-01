import { useState, useEffect, lazy } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSettings, useUpdateSetting, getSettingValue } from "@/lib/query/settingsQueries";
import { useQueryClient } from "@tanstack/react-query";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, Moon, Sun, Power, EyeOff, MonitorUp, Download, Upload, Info, Palette, Database } from "lucide-react";
import { ToggleRow } from "@/components/ui/toggle-row";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

const LanguageSettings = lazy(() => import("@/components/settings/LanguageSettings").then((m) => ({ default: m.LanguageSettings })));

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { data: settings, isLoading, error } = useSettings();
  const updateSetting = useUpdateSetting();
  const queryClient = useQueryClient();
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [autoLaunchSystemStatus, setAutoLaunchSystemStatus] = useState<boolean>(false);
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
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {t("common.error")}
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
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md">
          <Info className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{t("settings.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("settings.description")}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Appearance Settings */}
        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/30 border-b">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-violet-500" />
              <CardTitle className="text-base">{t("settings.appearance")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <LanguageSettings
              value={i18n.language as "zh" | "en" | "ja" | "ko"}
              onChange={handleLanguageChange}
            />

            <section className="space-y-2">
              <header className="space-y-1">
                <h3 className="text-sm font-medium">{t("settings.theme")}</h3>
                <p className="text-xs text-muted-foreground">{t("settings.themeHint")}</p>
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
        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/30 border-b">
            <div className="flex items-center gap-2">
              <Power className="h-4 w-4 text-orange-500" />
              <CardTitle className="text-base">{t("settings.launch")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <ToggleRow
              icon={<Power className="h-4 w-4 text-orange-500" />}
              title={t("settings.launchOnStartup")}
              description={autoLaunchSystemStatus ? "✓ " + t("common.enabled") : "— " + t("common.disabled")}
              checked={autoLaunch}
              onCheckedChange={handleAutoLaunchChange}
            />

            {autoLaunch && (
              <ToggleRow
                icon={<EyeOff className="h-4 w-4 text-emerald-500" />}
                title={t("settings.silentStartup")}
                description={t("settings.silentStartupDescription")}
                checked={silentStartup}
                onCheckedChange={(value) => saveBoolean("silent_startup", value)}
              />
            )}

            <ToggleRow
              icon={<MonitorUp className="h-4 w-4 text-purple-500" />}
              title={t("settings.minimizeToTray")}
              description={t("settings.minimizeToTrayDescription")}
              checked={minimizeToTray}
              onCheckedChange={(value) => saveBoolean("minimize_to_tray", value)}
            />
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/30 border-b">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-base">{t("settings.dataManagement")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={handleExport} className="gap-2">
                <Download className="h-4 w-4" />
                {t("settings.exportData")}
              </Button>
              <Button variant="outline" onClick={handleImport} className="gap-2">
                <Upload className="h-4 w-4" />
                {t("settings.importData")}
              </Button>
            </div>
            {backupMessage && <p className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded">{backupMessage}</p>}
            {backupError && <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">{backupError}</p>}
          </CardContent>
        </Card>

        {/* About */}
        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/30 border-b">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">{t("settings.about")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("settings.version")}</span>
              <span className="font-mono">0.1.0</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("settings.framework")}</span>
              <span>Tauri v2 + React 19</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("settings.author")}</span>
              <span>pengchenghui</span>
            </div>
          </CardContent>
        </Card>
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
      <Icon className="h-3.5 w-3.5" />
      {children}
    </Button>
  );
}