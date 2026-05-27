import { useState } from "react";
import { Link2, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSaveGitLabConfig, useTestGitLabConnection } from "@/lib/query/gitlabQueries";
import { toast } from "sonner";
import type { GitLabConfig } from "@/types";

interface FirstTimeSetupModalProps {
  onComplete: () => void;
  onSkip: () => void;
}

const defaultConfig: GitLabConfig = {
  url: "",
  auth_type: "token",
  token: "",
  filter_mode: "include",
  filter_projects: ["basicdata", "lmdm", "network", "notice", "message", "scm"],
  test_keywords: ["单测", "测试", "用例", "test", "spec"],
  scan_schedule: "0 9 * * 1",
  scan_channels: [],
  scan_range_type: "week",
  scan_range_days: 7,
};

export function FirstTimeSetupModal({ onComplete, onSkip }: FirstTimeSetupModalProps) {
  const [formData, setFormData] = useState<GitLabConfig>(defaultConfig);
  const [showToken, setShowToken] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "failed">("idle");

  const saveConfig = useSaveGitLabConfig();
  const testConnection = useTestGitLabConnection();

  const handleTest = async () => {
    setConnectionStatus("testing");
    try {
      console.log("Testing connection with config:", formData);
      const result = await testConnection.mutateAsync(formData);
      console.log("Test connection result:", result);
      setConnectionStatus(result ? "success" : "failed");
      if (result) {
        toast.success("连接成功");
      } else {
        toast.error("连接失败：服务器返回失败状态");
      }
    } catch (error: unknown) {
      console.error("Test connection error:", error);
      setConnectionStatus("failed");
      const errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : String(error);
      toast.error("连接失败: " + errorMessage);
    }
  };

  const handleSave = async () => {
    try {
      console.log("Saving config:", formData);
      await saveConfig.mutateAsync(formData);
      toast.success("配置已保存");
      onComplete();
    } catch (error: unknown) {
      console.error("Save config error:", error);
      const errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : String(error);
      toast.error("保存失败: " + errorMessage);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            GitLab 扫描功能设置
          </CardTitle>
          <CardDescription>
            首次使用需要配置 GitLab 连接
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: Server */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Step 1: GitLab 服务器</label>
            <Input
              placeholder="http://code.jms.com"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            />
          </div>

          {/* Step 2: Auth */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Step 2: 认证方式</label>
            <div className="flex gap-2">
              <Button
                variant={formData.auth_type === "token" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, auth_type: "token" })}
              >
                Private Token (推荐)
              </Button>
              <Button
                variant={formData.auth_type === "password" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, auth_type: "password" })}
              >
                账号密码
              </Button>
            </div>

            {formData.auth_type === "token" ? (
              <div className="flex gap-2 mt-2">
                <Input
                  type={showToken ? "text" : "password"}
                  placeholder="输入GitLab Private Token"
                  value={formData.token || ""}
                  onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                />
                <Button variant="outline" size="sm" onClick={() => setShowToken(!showToken)}>
                  {showToken ? "隐藏" : "显示"}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Input
                  placeholder="用户名"
                  value={formData.username || ""}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
                <Input
                  type="password"
                  placeholder="密码"
                  value={formData.password || ""}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              💡 在 GitLab 设置 → Access Tokens 中生成
            </p>
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={handleTest} disabled={connectionStatus === "testing" || !formData.url}>
              {connectionStatus === "testing" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              测试连接
            </Button>
            {connectionStatus === "success" && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" /> 连接成功
              </span>
            )}
            {connectionStatus === "failed" && (
              <span className="flex items-center gap-1 text-sm text-red-600">
                <XCircle className="h-4 w-4" /> 连接失败
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="ghost" onClick={onSkip}>
              跳过
            </Button>
            <Button onClick={handleSave} disabled={saveConfig.isPending || connectionStatus !== "success"}>
              {saveConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              完成配置
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}