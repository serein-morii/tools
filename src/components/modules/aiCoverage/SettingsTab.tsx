import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const DEFAULT_API_BASE_URL = "http://10.24.12.40";
const STORAGE_KEY = "ai_coverage_config";

export interface AiCoverageConfig {
  apiBaseUrl: string;
}

export function getConfig(): AiCoverageConfig {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return { apiBaseUrl: DEFAULT_API_BASE_URL };
    }
  }
  return { apiBaseUrl: DEFAULT_API_BASE_URL };
}

export function saveConfig(config: AiCoverageConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

interface SettingsTabProps {
  config: AiCoverageConfig;
  onConfigChange: (config: AiCoverageConfig) => void;
}

export function SettingsTab({ config, onConfigChange }: SettingsTabProps) {
  const [apiBaseUrl, setApiBaseUrl] = useState(config.apiBaseUrl);
  const hasChanges = useMemo(() => apiBaseUrl !== config.apiBaseUrl, [apiBaseUrl, config.apiBaseUrl]);

  const handleSave = () => {
    const newConfig = { apiBaseUrl };
    saveConfig(newConfig);
    onConfigChange(newConfig);
    toast.success("配置已保存");
  };

  const handleReset = () => {
    setApiBaseUrl(DEFAULT_API_BASE_URL);
  };

  return (
    <div className="p-5">
      <div className="max-w-xl space-y-6">
        <div className="space-y-2">
          <h2 className="text-sm font-medium">API 配置</h2>
          <p className="text-xs text-muted-foreground">
            配置 AI 覆盖率统计 API 的基础地址
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="apiBaseUrl" className="text-xs">API 基础地址</Label>
            <Input
              id="apiBaseUrl"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder={DEFAULT_API_BASE_URL}
              className="h-7 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              默认值: {DEFAULT_API_BASE_URL}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleSave}
            disabled={!hasChanges}
          >
            保存配置
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleReset}
          >
            恢复默认
          </Button>
        </div>
      </div>
    </div>
  );
}
