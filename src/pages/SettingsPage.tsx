import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettings, useUpdateSetting, getSettingValue } from "@/lib/query/settingsQueries";
import { useQueryClient } from "@tanstack/react-query";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, Moon, Sun, Power, EyeOff, MonitorUp } from "lucide-react";
import { ToggleRow } from "@/components/ui/toggle-row";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

const DEFAULT_SNOOZE_MINUTES = "5";
const DEFAULT_HISTORY_RETENTION_DAYS = "30";

export function SettingsPage() {
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
  const snoozeMinutes = getSettingValue(settings, "snooze_minutes", DEFAULT_SNOOZE_MINUTES);
  const historyRetentionDays = getSettingValue(settings, "history_retention_days", DEFAULT_HISTORY_RETENTION_DAYS);

  // Get actual system auto-launch status
  useEffect(() => {
    invoke<boolean>("get_auto_launch_status")
      .then((status) => setAutoLaunchSystemStatus(status))
      .catch(() => setAutoLaunchSystemStatus(false));
  }, []);

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">加载设置中...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-sm text-destructive">设置加载失败</CardContent>
        </Card>
      </div>
    );
  }

  const saveBoolean = (key: string, value: boolean) => {
    updateSetting.mutate({ key, value: value ? "true" : "false" });
  };

  const saveNumber = (key: string, value: string, min: number, max: number) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      return;
    }
    updateSetting.mutate({ key, value });
  };

  const handleAutoLaunchChange = async (value: boolean) => {
    // Update setting in database
    saveBoolean("auto_launch", value);
    // Update system auto-launch
    try {
      await invoke("set_auto_launch", { enabled: value });
      setAutoLaunchSystemStatus(value);
    } catch {
      // Ignore error, UI will show database value
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
          `已导出到 ${result.path}（任务 ${result.counts.tasks}，渠道 ${result.counts.channels}，模板 ${result.counts.templates}，设置 ${result.counts.settings}）`
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
          `已导入：任务 ${result.counts.tasks}，渠道 ${result.counts.channels}，模板 ${result.counts.templates}，设置 ${result.counts.settings}`
        );
        // Refresh all data after import
        queryClient.invalidateQueries();
      }
    } catch (err) {
      setBackupError(String(err));
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-semibold">设置</h2>
        <p className="mt-1 text-sm text-muted-foreground">保存应用行为和提醒偏好</p>
      </div>

      {/* Appearance Settings */}
      <Card>
        <CardHeader>
          <CardTitle>外观</CardTitle>
          <CardDescription>主题与显示设置</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="space-y-2">
            <header className="space-y-1">
              <h3 className="text-sm font-medium">主题</h3>
              <p className="text-xs text-muted-foreground">选择应用的外观主题</p>
            </header>
            <div className="inline-flex gap-1 rounded-md border border-border bg-background p-1">
              <ThemeButton
                active={theme === "light"}
                onClick={() => setTheme("light")}
                icon={Sun}
              >
                浅色
              </ThemeButton>
              <ThemeButton
                active={theme === "dark"}
                onClick={() => setTheme("dark")}
                icon={Moon}
              >
                深色
              </ThemeButton>
              <ThemeButton
                active={theme === "system"}
                onClick={() => setTheme("system")}
                icon={Monitor}
              >
                系统
              </ThemeButton>
            </div>
          </section>
        </CardContent>
      </Card>

      {/* Launch Settings */}
      <Card>
        <CardHeader>
          <CardTitle>启动设置</CardTitle>
          <CardDescription>应用程序启动行为</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow
            icon={<Power className="h-4 w-4 text-orange-500" />}
            title="开机自启动"
            description={autoLaunchSystemStatus ? "已注册系统自启动" : "尚未注册系统自启动"}
            checked={autoLaunch}
            onCheckedChange={handleAutoLaunchChange}
          />

          {autoLaunch && (
            <ToggleRow
              icon={<EyeOff className="h-4 w-4 text-green-500" />}
              title="静默启动"
              description="开机自启时不显示主窗口，仅在后台运行"
              checked={silentStartup}
              onCheckedChange={(value) => saveBoolean("silent_startup", value)}
            />
          )}

          <ToggleRow
            icon={<MonitorUp className="h-4 w-4 text-purple-500" />}
            title="最小化到托盘"
            description="关闭窗口时隐藏到系统托盘而非退出"
            checked={minimizeToTray}
            onCheckedChange={(value) => saveBoolean("minimize_to_tray", value)}
          />
        </CardContent>
      </Card>

      {/* Reminder Settings */}
      <Card>
        <CardHeader>
          <CardTitle>提醒设置</CardTitle>
          <CardDescription>任务提醒相关配置</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="snoozeMinutes">稍后提醒间隔 (分钟)</Label>
            <Input
              id="snoozeMinutes"
              type="number"
              min={1}
              max={1440}
              value={snoozeMinutes}
              onChange={(event) => saveNumber("snooze_minutes", event.target.value, 1, 1440)}
              className="w-32"
              disabled={updateSetting.isPending}
            />
            <p className="text-xs text-muted-foreground">用于历史页中的"稍后提醒"按钮，范围 1-1440 分钟</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="historyRetentionDays">历史保留天数</Label>
            <Input
              id="historyRetentionDays"
              type="number"
              min={1}
              max={3650}
              value={historyRetentionDays}
              onChange={(event) => saveNumber("history_retention_days", event.target.value, 1, 3650)}
              className="w-32"
              disabled={updateSetting.isPending}
            />
            <p className="text-xs text-muted-foreground">保存历史保留偏好，范围 1-3650 天</p>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle>数据管理</CardTitle>
          <CardDescription>数据存储与备份</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={handleExport}>
              导出数据
            </Button>
            <Button variant="outline" onClick={handleImport}>
              导入数据
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            导出任务、渠道、模板和设置；导入会替换这些配置数据，不包含提醒执行历史。
          </p>
          {backupMessage && <p className="text-xs text-green-600">{backupMessage}</p>}
          {backupError && <p className="text-xs text-destructive">{backupError}</p>}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>关于</CardTitle>
          <CardDescription>应用程序信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">版本</span>
            <span>0.1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">框架</span>
            <span>Tauri v2 + React 19</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">作者</span>
            <span>pengchenghui</span>
          </div>
        </CardContent>
      </Card>
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