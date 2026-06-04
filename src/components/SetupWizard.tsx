import { useState, useEffect } from "react";
import { ChevronRight, ChevronLeft, GitBranch, FlaskConical, Check, SkipForward, Loader2, KeyRound, Building2, FolderGit2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useGitLabConfig, useSaveGitLabConfig, useTestGitLabConnection } from "@/lib/query/gitlabQueries";
import { gitlabApi } from "@/lib/api/gitlab";
import { defaultGitLabConfig } from "@/lib/gitlab/defaults";
import type { GitLabConfig, WorkspaceItem } from "@/types";
import { toast } from "sonner";

const SETUP_COMPLETED_KEY = "app_setup_completed";

interface SetupWizardProps {
  onComplete: () => void;
}

type Step = "welcome" | "gitlab" | "walkin" | "done";

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [gitlabForm, setGitlabForm] = useState<GitLabConfig>(defaultGitLabConfig);
  const [walkinForm, setWalkinForm] = useState({
    url: "",
    username: "",
    password: "",
  });
  const [walkinData, setWalkinData] = useState({
    deptId: "",
    deptName: "",
    workspaceId: "",
    workspaceName: "",
  });
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "failed">("idle");
  const [walkinLoginStatus, setWalkinLoginStatus] = useState<"idle" | "logging" | "success" | "failed">("idle");
  const [showToken, setShowToken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Captcha dialog state
  const [showCaptchaDialog, setShowCaptchaDialog] = useState(false);
  const [captchaImg, setCaptchaImg] = useState<string | null>(null);
  const [captchaUuid, setCaptchaUuid] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [isCaptchaLoggingIn, setIsCaptchaLoggingIn] = useState(false);

  const { data: existingConfig } = useGitLabConfig();
  const saveConfig = useSaveGitLabConfig();
  const testConnection = useTestGitLabConnection();

  // Load existing config if available
  useEffect(() => {
    if (existingConfig) {
      setGitlabForm(existingConfig);
      if (existingConfig.walkin_url) {
        setWalkinForm({
          url: existingConfig.walkin_url,
          username: existingConfig.ldap_profiles?.[0]?.username || "",
          password: existingConfig.ldap_profiles?.[0]?.password || "",
        });
        setWalkinData({
          deptId: existingConfig.walkin_dept_id || "",
          deptName: existingConfig.walkin_dept_name || "",
          workspaceId: "",
          workspaceName: existingConfig.walkin_workspace_name || "",
        });
      }
    }
  }, [existingConfig]);

  const steps: { key: Step; title: string; icon: React.ReactNode }[] = [
    { key: "welcome", title: "欢迎", icon: <span className="h-4 w-4 flex items-center justify-center text-sm">👋</span> },
    { key: "gitlab", title: "GitLab 代码", icon: <GitBranch className="h-4 w-4" /> },
    { key: "walkin", title: "单测覆盖率", icon: <FlaskConical className="h-4 w-4" /> },
    { key: "done", title: "完成", icon: <Check className="h-4 w-4" /> },
  ];

  const currentStepIndex = steps.findIndex(s => s.key === currentStep);

  const handleTestGitLab = async () => {
    if (!gitlabForm.url) {
      toast.error("请输入 GitLab 服务器地址");
      return;
    }
    setConnectionStatus("testing");
    try {
      const selectedProfile = gitlabForm.token_profiles?.[0];
      const testData = { ...gitlabForm, token: selectedProfile?.token || "" };
      const result = await testConnection.mutateAsync(testData);
      setConnectionStatus(result ? "success" : "failed");
      if (result) {
        toast.success("GitLab 连接成功");
      } else {
        toast.error("GitLab 连接失败");
      }
    } catch (error) {
      setConnectionStatus("failed");
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`连接失败: ${msg}`);
    }
  };

  // Fetch workspaces after successful login
  const fetchWorkspaces = async (auth: { csrf_token: string; project: string; workspace: string; x_auth_token: string }) => {
    const workspaceList = await gitlabApi.walkinFetchWorkspaces(walkinForm.url, auth);
    setWorkspaces(workspaceList);

    if (workspaceList.length > 0) {
      const firstWs = workspaceList[0];
      await fetchDeptForWorkspace(firstWs.id, firstWs.name, auth);
    }
  };

  // Fetch dept info for a workspace
  const fetchDeptForWorkspace = async (workspaceId: string, workspaceName: string, auth: { csrf_token: string; project: string; workspace: string; x_auth_token: string }) => {
    try {
      const projects = await gitlabApi.walkinFetchRelatedProjects(walkinForm.url, auth, walkinForm.username, workspaceId);
      if (projects.length > 0) {
        const deptId = projects[0].id;
        const deptName = projects[0].name;
        setWalkinData(prev => ({
          ...prev,
          workspaceId: workspaceId,
          workspaceName: workspaceName,
          deptId: deptId,
          deptName: deptName,
        }));
        toast.success(`已切换到部门: ${deptName}`);
      } else {
        setWalkinData(prev => ({
          ...prev,
          workspaceId: workspaceId,
          workspaceName: workspaceName,
        }));
        toast.warning("该工作空间下没有关联部门");
      }
    } catch (e) {
      setWalkinData(prev => ({
        ...prev,
        workspaceId: workspaceId,
        workspaceName: workspaceName,
      }));
      toast.error("获取部门失败: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  // Handle successful login
  const handleLoginSuccess = async (result: { csrf_token: string; x_auth_token: string; project?: string; workspace?: string }) => {
    const auth = {
      csrf_token: result.csrf_token,
      project: result.project || "",
      workspace: result.workspace || "",
      x_auth_token: result.x_auth_token,
    };

    await fetchWorkspaces(auth);

    setGitlabForm(prev => ({
      ...prev,
      walkin_csrf_token: result.csrf_token || "",
      walkin_project_header: result.project || "",
      walkin_workspace_name: result.workspace || "",
      walkin_x_auth_token: result.x_auth_token || "",
      ldap_profiles: [{
        id: "default",
        username: walkinForm.username,
        password: walkinForm.password,
        label: "默认",
      }],
      selected_ldap_id: "default",
    }));

    setWalkinLoginStatus("success");
    toast.success("Walkin 登录成功，已获取工作空间列表");
  };

  // Refresh captcha
  const handleRefreshCaptcha = async () => {
    if (!walkinForm.url) return;
    try {
      const data = await gitlabApi.walkinGetCaptcha(walkinForm.url);
      setCaptchaImg(data.image_base64);
      setCaptchaUuid(data.uuid);
      setCaptcha("");
    } catch {
      toast.error("刷新验证码失败");
    }
  };

  // Login with captcha
  const handleCaptchaLogin = async () => {
    if (!captcha) {
      toast.error("请输入验证码");
      return;
    }
    setIsCaptchaLoggingIn(true);
    try {
      const resp = await gitlabApi.walkinLdapLogin(walkinForm.url, walkinForm.username, walkinForm.password, captcha, captchaUuid);
      if (resp.success && resp.data?.csrfToken) {
        await handleLoginSuccess({
          csrf_token: resp.data.csrfToken,
          x_auth_token: resp.data.sessionId || "",
          project: resp.data.lastProjectId,
          workspace: resp.data.lastWorkspaceId,
        });
        setShowCaptchaDialog(false);
        setCaptcha("");
        setCaptchaImg(null);
      } else {
        toast.error(resp.message || "登录失败");
        handleRefreshCaptcha();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`登录失败: ${msg}`);
      handleRefreshCaptcha();
    } finally {
      setIsCaptchaLoggingIn(false);
    }
  };

  // Walkin login and fetch workspaces
  const handleWalkinLogin = async () => {
    if (!walkinForm.url || !walkinForm.username || !walkinForm.password) {
      toast.error("请填写 Walkin 地址、用户名和密码");
      return;
    }
    setWalkinLoginStatus("logging");
    try {
      const result = await gitlabApi.walkinAutoLogin(walkinForm.url, walkinForm.username, walkinForm.password);

      if (result.success && result.csrf_token && result.x_auth_token) {
        await handleLoginSuccess({
          csrf_token: result.csrf_token,
          x_auth_token: result.x_auth_token,
          project: result.project,
          workspace: result.workspace,
        });
      } else if (result.needs_manual_captcha) {
        if (result.captcha_image && result.captcha_uuid) {
          setCaptchaImg(result.captcha_image);
          setCaptchaUuid(result.captcha_uuid);
          setCaptcha("");
          setShowCaptchaDialog(true);
          setWalkinLoginStatus("idle");
        } else {
          await handleRefreshCaptcha();
          setShowCaptchaDialog(true);
          setWalkinLoginStatus("idle");
        }
        toast.warning("需要手动输入验证码");
      } else {
        setWalkinLoginStatus("failed");
        toast.error(result.message || "登录失败");
      }
    } catch (error) {
      setWalkinLoginStatus("failed");
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`登录失败: ${msg}`);
    }
  };

  const handleNext = () => {
    const idx = steps.findIndex(s => s.key === currentStep);
    if (idx < steps.length - 1) {
      setCurrentStep(steps[idx + 1].key);
    }
  };

  const handlePrev = () => {
    const idx = steps.findIndex(s => s.key === currentStep);
    if (idx > 0) {
      setCurrentStep(steps[idx - 1].key);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(SETUP_COMPLETED_KEY, "true");
    onComplete();
  };

  const handleComplete = async () => {
    const finalConfig: GitLabConfig = {
      ...gitlabForm,
      walkin_url: walkinForm.url,
      walkin_dept_id: walkinData.deptId,
      walkin_dept_name: walkinData.deptName,
      walkin_workspace_name: walkinData.workspaceName,
      walkin_enabled: !!walkinForm.url && walkinLoginStatus === "success",
    };

    try {
      await saveConfig.mutateAsync(finalConfig);
      localStorage.setItem(SETUP_COMPLETED_KEY, "true");
      setCurrentStep("done");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`保存配置失败: ${msg}`);
    }
  };

  const handleFinish = () => {
    onComplete();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-background to-muted/50">
        <Card className="w-full max-w-xl mx-4 shadow-2xl">
          {/* Progress header */}
          <div className="border-b px-6 py-3">
            <div className="flex items-center justify-between">
              {steps.map((step, idx) => (
                <div key={step.key} className="flex items-center">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    idx === currentStepIndex
                      ? "bg-primary text-primary-foreground"
                      : idx < currentStepIndex
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {step.icon}
                    <span className="hidden sm:inline">{step.title}</span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`w-6 h-0.5 mx-1 ${idx < currentStepIndex ? "bg-primary" : "bg-muted"}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <CardContent className="p-5">
            {/* Welcome step */}
            {currentStep === "welcome" && (
              <div className="text-center py-3">
                <div className="text-3xl mb-3">🚀</div>
                <h2 className="text-lg font-bold mb-2">欢迎使用 Dev Tools</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  这是一个开发者工具箱，帮助您管理代码扫描、单测覆盖率等任务。
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div className="p-2 rounded border bg-muted/30">
                    <GitBranch className="h-4 w-4 mx-auto mb-1 text-primary" />
                    <span>GitLab 扫描</span>
                  </div>
                  <div className="p-2 rounded border bg-muted/30">
                    <FlaskConical className="h-4 w-4 mx-auto mb-1 text-primary" />
                    <span>覆盖率分析</span>
                  </div>
                  <div className="p-2 rounded border bg-muted/30">
                    <Check className="h-4 w-4 mx-auto mb-1 text-primary" />
                    <span>Prompt 生成</span>
                  </div>
                </div>
              </div>
            )}

            {/* GitLab step */}
            {currentStep === "gitlab" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">GitLab 连接配置</h2>
                </div>
                <p className="text-xs text-muted-foreground">配置 GitLab 服务器连接，用于扫描代码提交、检测单测覆盖情况。</p>

                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-medium">服务器地址</label>
                    <Input
                      placeholder="http://code.jms.com"
                      value={gitlabForm.url}
                      onChange={(e) => setGitlabForm({ ...gitlabForm, url: e.target.value })}
                      className="h-8 text-xs mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium">Private Token</label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        type={showToken ? "text" : "password"}
                        placeholder="输入 GitLab Private Token"
                        value={gitlabForm.token_profiles?.[0]?.token || ""}
                        onChange={(e) => {
                          const profiles = gitlabForm.token_profiles?.length
                            ? [{ ...gitlabForm.token_profiles[0], token: e.target.value }]
                            : [{ id: "default", token: e.target.value, label: "默认" }];
                          setGitlabForm({ ...gitlabForm, token_profiles: profiles, selected_token_ids: ["default"] });
                        }}
                        className="flex-1 h-8 text-xs"
                      />
                      <Button variant="outline" size="sm" className="h-8 text-xs px-2" onClick={() => setShowToken(!showToken)}>
                        {showToken ? "隐藏" : "显示"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">💡 在 GitLab 设置 → Access Tokens 中生成</p>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleTestGitLab} disabled={connectionStatus === "testing" || !gitlabForm.url}>
                      {connectionStatus === "testing" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      测试连接
                    </Button>
                    {connectionStatus === "success" && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check className="h-3 w-3" /> 连接成功</span>}
                    {connectionStatus === "failed" && <span className="text-xs text-destructive">连接失败</span>}
                  </div>
                </div>
              </div>
            )}

            {/* Walkin step */}
            {currentStep === "walkin" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Walkin 代码质量集成</h2>
                </div>
                <p className="text-xs text-muted-foreground">配置 Walkin 平台账号，登录后自动获取部门和工作空间信息。此步骤可选，您可以稍后在设置中配置。</p>

                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-medium flex items-center gap-1"><KeyRound className="h-3 w-3" /> Walkin 地址</label>
                    <Input
                      placeholder="http://walkin.jms.com"
                      value={walkinForm.url}
                      onChange={(e) => setWalkinForm({ ...walkinForm, url: e.target.value })}
                      className="h-8 text-xs mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium">用户名</label>
                      <Input
                        placeholder="LDAP 用户名"
                        value={walkinForm.username}
                        onChange={(e) => setWalkinForm({ ...walkinForm, username: e.target.value })}
                        className="h-8 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">密码</label>
                      <div className="flex gap-1 mt-1">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="LDAP 密码"
                          value={walkinForm.password}
                          onChange={(e) => setWalkinForm({ ...walkinForm, password: e.target.value })}
                          className="flex-1 h-8 text-xs"
                        />
                        <Button variant="outline" size="sm" className="h-8 text-xs px-2" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? "隐藏" : "显示"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleWalkinLogin}
                      disabled={walkinLoginStatus === "logging" || !walkinForm.url || !walkinForm.username || !walkinForm.password}
                    >
                      {walkinLoginStatus === "logging" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      登录获取信息
                    </Button>
                    {walkinLoginStatus === "success" && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check className="h-3 w-3" /> 登录成功</span>}
                    {walkinLoginStatus === "failed" && <span className="text-xs text-destructive">登录失败</span>}
                  </div>

                  {/* Workspace selection */}
                  {walkinLoginStatus === "success" && workspaces.length > 0 && (
                    <div className="p-2 border rounded-lg bg-muted/30 space-y-2">
                      <div>
                        <label className="text-xs font-medium flex items-center gap-1"><FolderGit2 className="h-3 w-3" /> 工作空间</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {workspaces.map((ws) => (
                            <Button
                              key={ws.id}
                              variant={walkinData.workspaceId === ws.id ? "default" : "outline"}
                              size="sm"
                              className="h-6 text-xs"
                              onClick={async () => {
                                const auth = {
                                  csrf_token: gitlabForm.walkin_csrf_token || "",
                                  project: gitlabForm.walkin_project_header || "",
                                  workspace: ws.id,
                                  x_auth_token: gitlabForm.walkin_x_auth_token || "",
                                };
                                await fetchDeptForWorkspace(ws.id, ws.name, auth);
                              }}
                            >
                              {ws.name}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-medium flex items-center gap-1"><Building2 className="h-3 w-3" /> 部门 ID</label>
                          <Input value={walkinData.deptId} disabled className="h-7 text-xs mt-1 bg-muted/50" />
                        </div>
                        <div>
                          <label className="text-xs font-medium">部门名称</label>
                          <Input value={walkinData.deptName} disabled className="h-7 text-xs mt-1 bg-muted/50" />
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground">💡 选择工作空间后自动获取对应的部门信息</p>
                    </div>
                  )}

                  {walkinLoginStatus !== "success" && (
                    <p className="text-xs text-muted-foreground">💡 登录后自动获取工作空间和部门信息。如果验证码识别失败，可稍后在设置页面完成。</p>
                  )}
                </div>
              </div>
            )}

            {/* Done step */}
            {currentStep === "done" && (
              <div className="text-center py-3">
                <div className="text-3xl mb-3">🎉</div>
                <h2 className="text-lg font-bold mb-2">配置完成！</h2>
                <p className="text-sm text-muted-foreground mb-3">
                  您已成功完成初始配置。现在可以开始使用 Dev Tools 了！
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• 在 <strong>GitLab 代码</strong> 中查看代码扫描结果</p>
                  <p>• 在 <strong>单测覆盖率</strong> 中生成单测 Prompt</p>
                  <p>• 随时可在 <strong>各模块配置</strong> 中修改配置</p>
                </div>
              </div>
            )}
          </CardContent>

          {/* Footer */}
          <div className="border-t px-5 py-3 flex justify-between">
            <div>
              {currentStep !== "welcome" && currentStep !== "done" && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleSkip}>
                  <SkipForward className="h-3 w-3 mr-1" />
                  跳过，稍后设置
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {currentStep !== "welcome" && currentStep !== "done" && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handlePrev}>
                  <ChevronLeft className="h-3 w-3 mr-1" />
                  上一步
                </Button>
              )}
              {currentStep === "welcome" && (
                <Button size="sm" className="h-7 text-xs" onClick={handleNext}>
                  开始配置
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              )}
              {currentStep === "gitlab" && (
                <Button size="sm" className="h-7 text-xs" onClick={handleNext}>
                  下一步
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              )}
              {currentStep === "walkin" && (
                <Button size="sm" className="h-7 text-xs" onClick={handleComplete} disabled={saveConfig.isPending}>
                  {saveConfig.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  完成配置
                </Button>
              )}
              {currentStep === "done" && (
                <Button size="sm" className="h-7 text-xs" onClick={handleFinish}>
                  开始使用
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Captcha Dialog */}
      {showCaptchaDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <Card className="w-[360px] mx-4 shadow-2xl">
            <div className="p-3 border-b">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <h3 className="font-medium text-sm">Walkin 验证码</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1">自动识别失败，请手动输入验证码</p>
            </div>
            <div className="p-3 space-y-3">
              {captchaImg && (
                <div className="flex justify-center bg-muted/30 rounded p-2">
                  <img
                    src={`data:image/png;base64,${captchaImg}`}
                    alt="验证码"
                    className="h-10 cursor-pointer"
                    onClick={handleRefreshCaptcha}
                    title="点击刷新验证码"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value)}
                  placeholder="输入验证码"
                  autoFocus
                  disabled={isCaptchaLoggingIn}
                  onKeyDown={(e) => e.key === "Enter" && handleCaptchaLogin()}
                  className="h-8 text-xs"
                />
                <Button variant="outline" size="sm" onClick={handleRefreshCaptcha} className="shrink-0 h-8 px-2">
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowCaptchaDialog(false)} disabled={isCaptchaLoggingIn}>取消</Button>
                <Button size="sm" className="h-7 text-xs" onClick={handleCaptchaLogin} disabled={isCaptchaLoggingIn || !captcha}>
                  {isCaptchaLoggingIn && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  确认登录
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

// Hook to check if setup is needed
export function useNeedsSetup(): boolean {
  const completed = localStorage.getItem(SETUP_COMPLETED_KEY);
  return completed !== "true";
}

// Function to reset setup (for testing or re-configuration)
export function resetSetup(): void {
  localStorage.removeItem(SETUP_COMPLETED_KEY);
}