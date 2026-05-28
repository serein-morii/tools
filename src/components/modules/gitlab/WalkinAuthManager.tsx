import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext, type ReactNode } from "react";
import { Loader2, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { gitlabApi } from "@/lib/api/gitlab";
import { toast } from "sonner";
import type { GitLabConfig } from "@/types";

interface WalkinAuthContextType {
  isLoggedIn: boolean;
  userName: string | null;
  checkLogin: () => Promise<boolean>;
  startAutoLogin: (credentials?: { username: string; password: string }) => Promise<void>;
}

const WalkinAuthContext = createContext<WalkinAuthContextType>({
  isLoggedIn: false,
  userName: null,
  checkLogin: async () => false,
  startAutoLogin: async () => {},
});

export const useWalkinAuth = () => useContext(WalkinAuthContext);

interface WalkinAuthProviderProps {
  config: GitLabConfig | null;
  onAuthUpdate: (tokens: { csrf_token: string; project: string; workspace: string; x_auth_token: string }) => void;
  children: ReactNode;
}

export function WalkinAuthProvider({ config, onAuthUpdate, children }: WalkinAuthProviderProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [showCaptchaDialog, setShowCaptchaDialog] = useState(false);
  const [captchaImg, setCaptchaImg] = useState<string | null>(null);
  const [captchaUuid, setCaptchaUuid] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const configRef = useRef<GitLabConfig | null>(null);
  const loginCredentialsRef = useRef<{ username: string; password: string } | null>(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const checkLogin = useCallback(async (): Promise<boolean> => {
    if (!config?.walkin_url || !config?.walkin_x_auth_token) {
      return false;
    }
    try {
      const result = await gitlabApi.walkinCheckLogin(config.walkin_url, {
        csrf_token: config.walkin_csrf_token,
        project: config.walkin_project_header,
        workspace: config.walkin_workspace_name,
        x_auth_token: config.walkin_x_auth_token,
      });
      setIsLoggedIn(result.logged_in);
      setUserName(result.user_name || null);
      return result.logged_in;
    } catch {
      setIsLoggedIn(false);
      return false;
    }
  }, [config]);

  const startAutoLogin = useCallback(async (credentials?: { username: string; password: string }) => {
    const currentConfig = configRef.current;
    if (!currentConfig) {
      toast.error("配置未加载，请稍后再试");
      return;
    }
    // Get LDAP credentials from profiles or provided credentials
    const ldapProfile = currentConfig.ldap_profiles.find(p => p.id === currentConfig.selected_ldap_id);
    const username = credentials?.username || ldapProfile?.username || "";
    const password = credentials?.password || ldapProfile?.password || "";
    if (!currentConfig.walkin_url) {
      toast.error("请先配置 Walkin 地址");
      return;
    }
    if (!username || !password) {
      toast.error("请先配置 LDAP 用户名和密码");
      return;
    }

    setIsAutoLoggingIn(true);
    loginCredentialsRef.current = { username, password };
    try {
      const result = await gitlabApi.walkinAutoLogin(currentConfig.walkin_url, username, password);

      if (result.success && result.csrf_token && result.x_auth_token) {
        onAuthUpdate({
          csrf_token: result.csrf_token,
          project: result.project || currentConfig.walkin_project_header,
          workspace: result.workspace || currentConfig.walkin_workspace_name,
          x_auth_token: result.x_auth_token,
        });
        setIsLoggedIn(true);
        toast.success("Walkin 自动登录成功");
      } else if (result.needs_manual_captcha) {
        setCaptchaImg(result.captcha_image || null);
        setCaptchaUuid(result.captcha_uuid || "");
        setCaptcha("");
        setShowCaptchaDialog(true);
        const reason = result.message || "验证码自动识别失败";
        toast.warning(`需要手动输入验证码: ${reason}`, { duration: 6000 });
      } else {
        const errMsg = result.message || "自动登录失败，未知原因";
        toast.error(`自动登录失败: ${errMsg}`, { duration: 6000 });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      toast.error(`自动登录异常: ${errMsg}`, { duration: 6000 });
    } finally {
      setIsAutoLoggingIn(false);
    }
  }, [onAuthUpdate]);

  const handleCaptchaLogin = async () => {
    const currentConfig = configRef.current;
    const credentials = loginCredentialsRef.current;
    // Get LDAP credentials from profiles
    const ldapProfile = currentConfig?.ldap_profiles.find(p => p.id === currentConfig?.selected_ldap_id);
    const username = credentials?.username || ldapProfile?.username || "";
    const password = credentials?.password || ldapProfile?.password || "";
    if (!captcha || !currentConfig?.walkin_url || !username || !password) {
      toast.error("请输入验证码");
      return;
    }

    setIsLoggingIn(true);
    try {
      const resp = await gitlabApi.walkinLdapLogin(currentConfig.walkin_url, username, password, captcha, captchaUuid);
      if (resp.success && resp.data?.csrfToken) {
        onAuthUpdate({
          csrf_token: resp.data.csrfToken,
          project: currentConfig.walkin_project_header || "",
          workspace: resp.data.lastWorkspaceId || currentConfig.walkin_workspace_name || "",
          x_auth_token: resp.data.sessionId || "",
        });
        setIsLoggedIn(true);
        setShowCaptchaDialog(false);
        toast.success("登录成功");
      } else {
        const errMsg = resp.message || "登录失败，服务器未返回原因";
        toast.error(`登录失败: ${errMsg}`, { duration: 6000 });
        handleRefreshCaptcha();
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      toast.error(`登录请求异常: ${errMsg}`, { duration: 6000 });
      handleRefreshCaptcha();
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRefreshCaptcha = async () => {
    const currentConfig = configRef.current;
    if (!currentConfig?.walkin_url) return;
    try {
      const data = await gitlabApi.walkinGetCaptcha(currentConfig.walkin_url);
      setCaptchaImg(data.image_base64);
      setCaptchaUuid(data.uuid);
      setCaptcha("");
    } catch {
      toast.error("刷新验证码失败");
    }
  };

  // 定时检测登录状态
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const intervalStr = localStorage.getItem("walkin_login_check_interval");
    const interval = intervalStr ? parseInt(intervalStr) : 0;
    if (interval > 0 && config?.walkin_enabled && config?.walkin_x_auth_token) {
      checkLogin();
      intervalRef.current = setInterval(async () => {
        const loggedIn = await checkLogin();
        if (!loggedIn) {
          toast.warning("Walkin 登录已过期，正在尝试重新登录...");
          await startAutoLogin();
        }
      }, interval * 60 * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [config?.walkin_enabled, config?.walkin_x_auth_token, checkLogin, startAutoLogin]);

  const contextValue: WalkinAuthContextType = useMemo(
    () => ({ isLoggedIn, userName, checkLogin, startAutoLogin }),
    [isLoggedIn, userName, checkLogin, startAutoLogin],
  );

  return (
    <WalkinAuthContext.Provider value={contextValue}>
      {children}

      {/* 验证码弹窗 */}
      {showCaptchaDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[400px] rounded-lg border bg-card p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-medium">Walkin 验证码</h3>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">自动识别失败，请手动输入验证码</p>
              {captchaImg && (
                <div className="flex justify-center bg-muted/30 rounded p-2">
                  <img
                    src={`data:image/png;base64,${captchaImg}`}
                    alt="验证码"
                    className="h-12 cursor-pointer"
                    onClick={handleRefreshCaptcha}
                    title="点击刷新验证码"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input value={captcha} onChange={(e) => setCaptcha(e.target.value)} placeholder="输入验证码" autoFocus disabled={isLoggingIn} onKeyDown={(e) => e.key === "Enter" && handleCaptchaLogin()} />
                <Button variant="ghost" size="sm" onClick={handleRefreshCaptcha} className="shrink-0"><RefreshCw className="h-4 w-4" /></Button>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowCaptchaDialog(false)} disabled={isLoggingIn}>取消</Button>
                <Button size="sm" onClick={handleCaptchaLogin} disabled={isLoggingIn || !captcha}>{isLoggingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}登录</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 自动登录中的提示 */}
      {isAutoLoggingIn && (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg border bg-card p-3 shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">正在自动登录 Walkin...</span>
        </div>
      )}
    </WalkinAuthContext.Provider>
  );
}
