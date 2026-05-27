import { useState } from "react";
import { Loader2, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { gitlabApi } from "@/lib/api/gitlab";
import { toast } from "sonner";
import type { GitLabConfig } from "@/types";

interface WalkinLoginDialogProps {
  config: GitLabConfig;
  onLoginSuccess: (tokens: { csrf_token: string; project: string; workspace: string; x_auth_token: string }) => void;
  onClose: () => void;
}

export function WalkinLoginDialog({ config, onLoginSuccess, onClose }: WalkinLoginDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  // Manual captcha fallback state
  const [manualCaptcha, setManualCaptcha] = useState(false);
  const [captchaImg, setCaptchaImg] = useState<string | null>(null);
  const [captchaUuid, setCaptchaUuid] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [statusText, setStatusText] = useState("");

  const handleAutoLogin = async () => {
    if (!username || !password) {
      toast.error("请输入用户名和密码");
      return;
    }
    if (!config.walkin_url) {
      toast.error("请先配置 Walkin 地址");
      return;
    }

    setIsLoggingIn(true);
    setStatusText("正在获取验证码并自动识别...");
    setManualCaptcha(false);

    try {
      const result = await gitlabApi.walkinAutoLogin(
        config.walkin_url, username, password
      );

      if (result.success && result.csrf_token && result.x_auth_token) {
        onLoginSuccess({
          csrf_token: result.csrf_token,
          project: result.project || "",
          workspace: result.workspace || "",
          x_auth_token: result.x_auth_token,
        });
        toast.success("自动登录成功！");
        onClose();
      } else if (result.needs_manual_captcha) {
        // Auto-recognition failed, switch to manual captcha input
        setManualCaptcha(true);
        setCaptchaImg(result.captcha_image || null);
        setCaptchaUuid(result.captcha_uuid || "");
        setCaptcha("");
        setStatusText("");
        toast.warning("自动识别失败，请手动输入验证码");
      } else {
        toast.error(result.message || "登录失败");
      }
    } catch (error) {
      toast.error("登录失败: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRefreshCaptcha = async () => {
    if (!config.walkin_url) return;
    try {
      const data = await gitlabApi.walkinGetCaptcha(config.walkin_url);
      setCaptchaImg(data.image_base64);
      setCaptchaUuid(data.uuid);
      setCaptcha("");
    } catch {
      toast.error("刷新验证码失败");
    }
  };

  const handleManualLogin = async () => {
    if (!captcha) {
      toast.error("请输入验证码");
      return;
    }
    setIsLoggingIn(true);
    try {
      const resp = await gitlabApi.walkinLdapLogin(
        config.walkin_url, username, password, captcha, captchaUuid
      );
      if (resp.success && resp.data?.csrfToken) {
        onLoginSuccess({
          csrf_token: resp.data.csrfToken,
          project: config.walkin_project_header || "",
          workspace: resp.data.lastWorkspaceId || config.walkin_workspace_name || "",
          x_auth_token: resp.data.sessionId || "",
        });
        toast.success("登录成功！");
        onClose();
      } else {
        toast.error(resp.message || "登录失败，请检查验证码");
        handleRefreshCaptcha();
      }
    } catch (error) {
      toast.error("登录失败: " + (error instanceof Error ? error.message : String(error)));
      handleRefreshCaptcha();
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[400px] rounded-lg border bg-card p-6 shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium">Walkin LDAP 登录</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">用户名</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="LDAP 用户名"
              disabled={isLoggingIn}
            />
          </div>
          <div>
            <label className="text-sm font-medium">密码</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="LDAP 密码"
              disabled={isLoggingIn}
            />
          </div>

          {/* Status during auto-login */}
          {statusText && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {statusText}
            </div>
          )}

          {/* Manual captcha fallback */}
          {manualCaptcha && captchaImg && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">验证码 (自动识别失败，请手动输入)</span>
                <Button variant="ghost" size="sm" onClick={handleRefreshCaptcha} className="h-6 px-2">
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex justify-center bg-muted/30 rounded p-2">
                <img
                  src={`data:image/png;base64,${captchaImg}`}
                  alt="验证码"
                  className="h-12 cursor-pointer"
                  onClick={handleRefreshCaptcha}
                  title="点击刷新验证码"
                />
              </div>
              <div>
                <Input
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value)}
                  placeholder="输入验证码"
                  autoFocus
                  disabled={isLoggingIn}
                  onKeyDown={(e) => e.key === "Enter" && handleManualLogin()}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isLoggingIn}>
              取消
            </Button>
            {manualCaptcha ? (
              <Button size="sm" onClick={handleManualLogin} disabled={isLoggingIn || !captcha}>
                {isLoggingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                验证登录
              </Button>
            ) : (
              <Button size="sm" onClick={handleAutoLogin} disabled={isLoggingIn || !username || !password}>
                {isLoggingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                自动登录
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
