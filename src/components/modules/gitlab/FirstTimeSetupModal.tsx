import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Loader2, CheckCircle, XCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSaveGitLabConfig, useTestGitLabConnection } from "@/lib/query/gitlabQueries";
import { toast } from "sonner";
import { defaultGitLabConfig } from "@/lib/gitlab/defaults";
import type { GitLabConfig } from "@/types";

interface FirstTimeSetupModalProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function FirstTimeSetupModal({ onComplete, onSkip }: FirstTimeSetupModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<GitLabConfig>(defaultGitLabConfig);
  const [showToken, setShowToken] = useState(false);
  const [showWalkinPassword, setShowWalkinPassword] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "failed">("idle");

  const saveConfig = useSaveGitLabConfig();
  const testConnection = useTestGitLabConnection();

  const handleTest = async () => {
    setConnectionStatus("testing");
    try {
      const result = await testConnection.mutateAsync(formData);
      setConnectionStatus(result ? "success" : "failed");
      if (result) {
        toast.success(t("gitlab.setup.testSuccess"));
      } else {
        toast.error(t("gitlab.setup.testFailedServer"));
      }
    } catch (error: unknown) {
      console.error("Test connection error:", error);
      setConnectionStatus("failed");
      const errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : String(error);
      toast.error(t("gitlab.setup.testFailedPrefix") + errorMessage);
    }
  };

  const handleSave = async () => {
    try {
      await saveConfig.mutateAsync(formData);
      toast.success(t("gitlab.setup.saveSuccess"));
      onComplete();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : String(error);
      toast.error(t("gitlab.setup.saveFailed") + errorMessage);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-lg mx-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t("gitlab.setup.title")}
          </CardTitle>
          <CardDescription>
            {t("gitlab.setup.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* GitLab 连接配置 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-4 w-4" />
              GitLab 连接配置
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">服务器地址</Label>
              <Input
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">认证方式</Label>
              <div className="flex gap-2">
                <Button
                  variant={formData.auth_type === "token" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData({ ...formData, auth_type: "token" })}
                >
                  Private Token（推荐）
                </Button>
                <Button
                  variant={formData.auth_type === "password" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData({ ...formData, auth_type: "password" })}
                >
                  用户名/密码
                </Button>
              </div>
            </div>

            {formData.auth_type === "token" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Private Token</Label>
                <div className="flex gap-2">
                  <Input
                    type={showToken ? "text" : "password"}
                    placeholder="请输入 Private Token"
                    value={formData.token || ""}
                    onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={() => setShowToken(!showToken)}>
                    {showToken ? t("common.hide") : t("common.show")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">用户名</Label>
                  <Input
                    placeholder="请输入用户名"
                    value={formData.username || ""}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">密码</Label>
                  <Input
                    type="password"
                    placeholder="请输入密码"
                    value={formData.password || ""}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              💡 Private Token 可在 GitLab 用户设置 → Access Tokens 中创建
            </p>
          </div>

          {/* 测试连接 */}
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={handleTest} disabled={connectionStatus === "testing" || !formData.url}>
              {connectionStatus === "testing" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("gitlab.setup.testConnection")}
            </Button>
            {connectionStatus === "success" && (
              <span className="flex items-center gap-1 text-sm text-emerald-600">
                <CheckCircle className="h-4 w-4" /> {t("gitlab.setup.testSuccess")}
              </span>
            )}
            {connectionStatus === "failed" && (
              <span className="flex items-center gap-1 text-sm text-destructive">
                <XCircle className="h-4 w-4" /> {t("gitlab.setup.testFailed")}
              </span>
            )}
          </div>

          {/* Walkin 代码质量集成 */}
          <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Shield className="h-4 w-4" />
              Walkin 代码质量集成
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Walkin 地址</Label>
              <Input
                value={formData.walkin_url || ""}
                onChange={(e) => setFormData({ ...formData, walkin_url: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">用户名</Label>
                <Input
                  placeholder="请输入用户名"
                  value={formData.walkin_username || ""}
                  onChange={(e) => setFormData({ ...formData, walkin_username: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">密码</Label>
                <div className="flex gap-1">
                  <Input
                    type={showWalkinPassword ? "text" : "password"}
                    placeholder="请输入密码"
                    value={formData.walkin_password || ""}
                    onChange={(e) => setFormData({ ...formData, walkin_password: e.target.value })}
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={() => setShowWalkinPassword(!showWalkinPassword)}>
                    {showWalkinPassword ? t("common.hide") : t("common.show")}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">部门 ID</Label>
                <Input
                  placeholder="请输入部门 ID"
                  value={formData.walkin_dept_id || ""}
                  onChange={(e) => setFormData({ ...formData, walkin_dept_id: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">部门名称</Label>
                <Input
                  placeholder="请输入部门名称"
                  value={formData.walkin_dept_name || ""}
                  onChange={(e) => setFormData({ ...formData, walkin_dept_name: e.target.value })}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              💡 Walkin 用于获取代码质量数据和覆盖率统计
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="ghost" onClick={onSkip}>
              {t("common.skip")}
            </Button>
            <Button onClick={handleSave} disabled={saveConfig.isPending || connectionStatus !== "success"}>
              {saveConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("gitlab.setup.completeSetup")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}