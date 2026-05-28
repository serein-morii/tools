import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
      <Card className="w-full max-w-md mx-4">
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
          {/* Step 1: Server */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("gitlab.setup.step1Label")}</label>
            <Input
              placeholder="http://code.jms.com"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            />
          </div>

          {/* Step 2: Auth */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("gitlab.setup.step2Label")}</label>
            <div className="flex gap-2">
              <Button
                variant={formData.auth_type === "token" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, auth_type: "token" })}
              >
                {t("gitlab.setup.tokenRecommended")}
              </Button>
              <Button
                variant={formData.auth_type === "password" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, auth_type: "password" })}
              >
                {t("gitlab.setup.usernamePassword")}
              </Button>
            </div>

            {formData.auth_type === "token" ? (
              <div className="flex gap-2 mt-2">
                <Input
                  type={showToken ? "text" : "password"}
                  placeholder={t("gitlab.setup.inputTokenPlaceholder")}
                  value={formData.token || ""}
                  onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                />
                <Button variant="outline" size="sm" onClick={() => setShowToken(!showToken)}>
                  {showToken ? t("common.hide") : t("common.show")}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Input
                  placeholder={t("gitlab.setup.username")}
                  value={formData.username || ""}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
                <Input
                  type="password"
                  placeholder={t("gitlab.setup.password")}
                  value={formData.password || ""}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              💡 {t("gitlab.setup.tokenHint")}
            </p>
          </div>

          {/* Test Connection */}
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

          {/* Actions */}
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