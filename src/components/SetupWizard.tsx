import { useState, useEffect } from "react";
import { ChevronRight, ChevronLeft, GitBranch, FlaskConical, Check, SkipForward, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useGitLabConfig, useSaveGitLabConfig, useTestGitLabConnection } from "@/lib/query/gitlabQueries";
import { defaultGitLabConfig } from "@/lib/gitlab/defaults";
import type { GitLabConfig } from "@/types";
import { toast } from "sonner";

const SETUP_COMPLETED_KEY = "app_setup_completed";

interface SetupWizardProps {
  onComplete: () => void;
}

type Step = "welcome" | "gitlab" | "walkin" | "done";

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [gitlabForm, setGitlabForm] = useState<GitLabConfig>(defaultGitLabConfig);
  const [walkinForm, setWalkinForm] = useState({ url: "", deptId: "", deptName: "", workspaceName: "" });
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "failed">("idle");
  const [showToken, setShowToken] = useState(false);

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
          deptId: existingConfig.walkin_dept_id || "",
          deptName: existingConfig.walkin_dept_name || "",
          workspaceName: existingConfig.walkin_workspace_name || "",
        });
      }
    }
  }, [existingConfig]);

  const steps: { key: Step; title: string; icon: React.ReactNode }[] = [
    { key: "welcome", title: "欢迎", icon: <span className="text-lg">👋</span> },
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
    // Mark setup as completed even if skipped
    localStorage.setItem(SETUP_COMPLETED_KEY, "true");
    onComplete();
  };

  const handleComplete = async () => {
    // Save all config
    const finalConfig: GitLabConfig = {
      ...gitlabForm,
      walkin_url: walkinForm.url,
      walkin_dept_id: walkinForm.deptId,
      walkin_dept_name: walkinForm.deptName,
      walkin_workspace_name: walkinForm.workspaceName,
      walkin_enabled: !!walkinForm.url,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-background to-muted/50">
      <Card className="w-full max-w-xl mx-4 shadow-2xl">
        {/* Progress header */}
        <div className="border-b px-6 py-4">
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => (
              <div key={step.key} className="flex items-center">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
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
                  <div className={`w-8 h-0.5 mx-1 ${idx < currentStepIndex ? "bg-primary" : "bg-muted"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <CardContent className="p-6">
          {/* Welcome step */}
          {currentStep === "welcome" && (
            <div className="text-center space-y-4 py-6">
              <div className="text-5xl mb-4">🚀</div>
              <h2 className="text-2xl font-bold">欢迎使用 Dev Tools</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                这是一个开发者工具箱，帮助您管理代码扫描、单测覆盖率等任务。
                <br />
                让我们开始配置吧！
              </p>
            </div>
          )}

          {/* GitLab step */}
          {currentStep === "gitlab" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <GitBranch className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">GitLab 连接配置</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                配置 GitLab 服务器连接，用于扫描代码提交、检测单测覆盖情况。
              </p>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">服务器地址</label>
                  <Input
                    placeholder="http://code.jms.com"
                    value={gitlabForm.url}
                    onChange={(e) => setGitlabForm({ ...gitlabForm, url: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Private Token</label>
                  <div className="flex gap-2">
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
                      className="flex-1"
                    />
                    <Button variant="outline" size="sm" onClick={() => setShowToken(!showToken)}>
                      {showToken ? "隐藏" : "显示"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    💡 在 GitLab 设置 → Access Tokens 中生成
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <Button variant="outline" onClick={handleTestGitLab} disabled={connectionStatus === "testing" || !gitlabForm.url}>
                    {connectionStatus === "testing" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    测试连接
                  </Button>
                  {connectionStatus === "success" && (
                    <span className="text-sm text-emerald-600 flex items-center gap-1">
                      <Check className="h-4 w-4" /> 连接成功
                    </span>
                  )}
                  {connectionStatus === "failed" && (
                    <span className="text-sm text-destructive">连接失败</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Walkin step */}
          {currentStep === "walkin" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <FlaskConical className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Walkin 代码质量集成</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                配置 Walkin 代码质量平台连接，获取单测覆盖率等数据。此步骤可选，您可以稍后在设置中配置。
              </p>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Walkin 地址</label>
                  <Input
                    placeholder="http://walkin.jms.com"
                    value={walkinForm.url}
                    onChange={(e) => setWalkinForm({ ...walkinForm, url: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">部门 ID</label>
                    <Input
                      placeholder="部门 ID"
                      value={walkinForm.deptId}
                      onChange={(e) => setWalkinForm({ ...walkinForm, deptId: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">部门名称</label>
                    <Input
                      placeholder="部门名称"
                      value={walkinForm.deptName}
                      onChange={(e) => setWalkinForm({ ...walkinForm, deptName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">工作空间名称</label>
                  <Input
                    placeholder="默认工作空间"
                    value={walkinForm.workspaceName}
                    onChange={(e) => setWalkinForm({ ...walkinForm, workspaceName: e.target.value })}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                💡 登录认证将在首次使用时自动进行，请在配置后前往"单测覆盖率"页面登录。
              </p>
            </div>
          )}

          {/* Done step */}
          {currentStep === "done" && (
            <div className="text-center space-y-4 py-6">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold">配置完成！</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                您已成功完成初始配置。现在可以开始使用 Dev Tools 了！
              </p>
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                <p>• 在 <strong>GitLab 代码</strong> 中查看代码扫描结果</p>
                <p>• 在 <strong>单测覆盖率</strong> 中生成单测 Prompt</p>
                <p>• 随时可在 <strong>设置</strong> 中修改配置</p>
              </div>
            </div>
          )}
        </CardContent>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-between">
          <div>
            {currentStep !== "welcome" && currentStep !== "done" && (
              <Button variant="ghost" onClick={handleSkip}>
                <SkipForward className="h-4 w-4 mr-2" />
                跳过，稍后设置
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {currentStep !== "welcome" && currentStep !== "done" && (
              <Button variant="outline" onClick={handlePrev}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                上一步
              </Button>
            )}
            {currentStep === "welcome" && (
              <Button onClick={handleNext}>
                开始配置
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {currentStep === "gitlab" && (
              <Button onClick={handleNext}>
                下一步
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {currentStep === "walkin" && (
              <Button onClick={handleComplete} disabled={saveConfig.isPending}>
                {saveConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                完成配置
              </Button>
            )}
            {currentStep === "done" && (
              <Button onClick={handleFinish}>
                开始使用
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
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
