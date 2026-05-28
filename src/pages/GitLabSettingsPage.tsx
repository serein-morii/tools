import { useState, useEffect } from "react";
import { Link2, CheckCircle, XCircle, Loader2, Plus, X, AlertCircle, Shield, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useGitLabConfig, useSaveGitLabConfig, useTestGitLabConnection } from "@/lib/query/gitlabQueries";
import { useChannels } from "@/lib/query/channelQueries";
import { toast } from "sonner";
import { useWalkinAuth } from "@/components/modules/gitlab/WalkinAuthManager";
import { defaultGitLabConfig } from "@/lib/gitlab/defaults";
import type { GitLabConfig } from "@/types";

const defaultConfig = defaultGitLabConfig;

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Parse cron expression to human readable format
function parseCronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "无效表达式";

  const [min, hour, day, month, weekday] = parts;

  // Every N minutes
  if (min.startsWith("*/") && hour === "*" && day === "*" && month === "*" && weekday === "*") {
    const interval = min.replace("*/", "");
    return `每 ${interval} 分钟`;
  }

  // Every N hours
  if (min === "0" && hour.startsWith("*/") && day === "*" && month === "*" && weekday === "*") {
    const interval = hour.replace("*/", "");
    return `每 ${interval} 小时`;
  }

  // Specific time
  const timeStr = `${hour === "*" ? "每小时" : `${hour}时`}${min === "*" ? "" : `${min}分`}`;

  // Weekday
  const weekdayMap: Record<string, string> = {
    "0": "周日",
    "1": "周一",
    "2": "周二",
    "3": "周三",
    "4": "周四",
    "5": "周五",
    "6": "周六",
    "*": "每天",
    "1-5": "工作日",
    "0,6": "周末",
  };

  // Multiple weekdays
  if (weekday.includes(",") && !weekdayMap[weekday]) {
    const days = weekday.split(",").map(d => weekdayMap[d] || d).join(", ");
    return `${timeStr} (${days})`;
  }

  // Multiple hours
  if (hour.includes(",") && day === "*" && month === "*") {
    const hours = hour.split(",").map(h => `${h}:00`).join(", ");
    return `${weekdayMap[weekday] || "每天"} ${hours}`;
  }

  const weekdayStr = weekdayMap[weekday] || weekday;

  // Daily
  if (day === "*" && month === "*") {
    if (weekday === "*") {
      return `每天 ${hour}:${min.padStart(2, "0")}`;
    }
    return `${weekdayStr} ${hour}:${min.padStart(2, "0")}`;
  }

  return `${timeStr} ${weekdayStr}`;
}

export function GitLabSettingsPage() {
  const { data: config, isLoading } = useGitLabConfig();
  const { data: channels } = useChannels();
  const saveConfig = useSaveGitLabConfig();
  const testConnection = useTestGitLabConnection();

  const [formData, setFormData] = useState<GitLabConfig>(defaultConfig);
  const [showToken, setShowToken] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "failed">("idle");
  const [newProject, setNewProject] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [validationErrors, setValidationErrors] = useState<{ url?: string; token?: string }>({});
  const { isLoggedIn, userName, checkLogin, startAutoLogin } = useWalkinAuth();
  const [isCheckingLogin, setIsCheckingLogin] = useState(false);

  // 定时检测间隔
  const [loginCheckInterval, setLoginCheckInterval] = useState<number>(() => {
    const saved = localStorage.getItem("walkin_login_check_interval");
    return saved ? parseInt(saved) : 0;
  });

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  // 保存检测间隔到 localStorage
  const handleIntervalChange = (interval: number) => {
    setLoginCheckInterval(interval);
    localStorage.setItem("walkin_login_check_interval", interval.toString());
  };

  const validateForm = (): boolean => {
    const errors: { url?: string; token?: string } = {};

    if (!formData.url) {
      errors.url = "服务器地址不能为空";
    } else if (!isValidUrl(formData.url)) {
      errors.url = "请输入有效的URL地址（如 http://code.jms.com）";
    }

    if (formData.auth_type === "token" && !formData.token) {
      errors.token = "Token不能为空";
    }

    if (formData.auth_type === "password" && (!formData.username || !formData.password)) {
      errors.token = "用户名和密码不能为空";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleTest = async () => {
    if (!validateForm()) {
      return;
    }
    setConnectionStatus("testing");
    try {
      const result = await testConnection.mutateAsync(formData);
      setConnectionStatus(result ? "success" : "failed");
      if (result) {
        toast.success("连接成功");
      } else {
        toast.error("连接失败：请检查URL和认证信息");
      }
    } catch (error: unknown) {
      setConnectionStatus("failed");
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error("连接失败: " + errorMessage);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.error("请检查配置信息");
      return;
    }
    try {
      await saveConfig.mutateAsync(formData);
      toast.success("配置已保存");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error("保存失败: " + errorMessage);
    }
  };

  const addProject = () => {
    if (newProject && !formData.filter_projects.includes(newProject)) {
      setFormData({ ...formData, filter_projects: [...formData.filter_projects, newProject] });
      setNewProject("");
    }
  };

  const removeProject = (project: string) => {
    setFormData({ ...formData, filter_projects: formData.filter_projects.filter((p) => p !== project) });
  };

  const addKeyword = () => {
    if (newKeyword && !formData.test_keywords.includes(newKeyword)) {
      setFormData({ ...formData, test_keywords: [...formData.test_keywords, newKeyword] });
      setNewKeyword("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setFormData({ ...formData, test_keywords: formData.test_keywords.filter((k) => k !== keyword) });
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      {/* GitLab连接配置 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            GitLab 连接配置
          </CardTitle>
          <CardDescription>配置 GitLab 服务器连接信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">服务器地址</label>
            <Input
              placeholder="http://code.jms.com"
              value={formData.url}
              onChange={(e) => {
                setFormData({ ...formData, url: e.target.value });
                setValidationErrors({ ...validationErrors, url: undefined });
              }}
            />
            {validationErrors.url && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {validationErrors.url}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">认证方式</label>
            <div className="flex gap-4">
              <Button
                variant={formData.auth_type === "token" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, auth_type: "token" })}
              >
                Token
              </Button>
              <Button
                variant={formData.auth_type === "password" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, auth_type: "password" })}
              >
                账号密码
              </Button>
            </div>
          </div>

          {formData.auth_type === "token" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Private Token</label>
              <div className="flex gap-2">
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
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">用户名</label>
                <Input
                  placeholder="输入用户名"
                  value={formData.username || ""}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">密码</label>
                <Input
                  type="password"
                  placeholder="输入密码"
                  value={formData.password || ""}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            </div>
          )}

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
        </CardContent>
      </Card>

      {/* 项目过滤配置 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>项目过滤配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">过滤模式</label>
            <div className="flex gap-4">
              <Button
                variant={formData.filter_mode === "include" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, filter_mode: "include" })}
              >
                包含模式
              </Button>
              <Button
                variant={formData.filter_mode === "exclude" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, filter_mode: "exclude" })}
              >
                排除模式
              </Button>
              <Button
                variant={formData.filter_mode === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, filter_mode: "all" })}
              >
                全部项目
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">项目列表</label>
            <div className="flex flex-wrap gap-2">
              {formData.filter_projects.map((project) => (
                <span
                  key={project}
                  className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
                >
                  {project}
                  <X className="h-3 w-3 cursor-pointer hover:text-red-500" onClick={() => removeProject(project)} />
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="添加项目名称"
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                className="max-w-[200px]"
              />
              <Button variant="outline" size="sm" onClick={addProject}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 单测检测配置 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>单测检测配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">检测关键词</label>
            <div className="flex flex-wrap gap-2">
              {formData.test_keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
                >
                  {keyword}
                  <X className="h-3 w-3 cursor-pointer hover:text-red-500" onClick={() => removeKeyword(keyword)} />
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="添加关键词"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                className="max-w-[200px]"
              />
              <Button variant="outline" size="sm" onClick={addKeyword}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 定时扫描配置 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            定时扫描配置
          </CardTitle>
          <CardDescription>配置自动扫描和 Walkin 数据刷新的时间</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 快捷选择 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">快捷选择</label>
            <div className="flex flex-wrap gap-2">
              {[
                { cron: "0 9 * * 1", label: "每周一 09:00" },
                { cron: "0 9 * * 1-5", label: "工作日 09:00" },
                { cron: "0 9,18 * * 1-5", label: "工作日 09:00, 18:00" },
                { cron: "0 9 * * *", label: "每天 09:00" },
                { cron: "0 9,12,18 * * *", label: "每天 09:00, 12:00, 18:00" },
                { cron: "0 */2 * * *", label: "每 2 小时" },
                { cron: "0 */4 * * *", label: "每 4 小时" },
                { cron: "0 */6 * * *", label: "每 6 小时" },
                { cron: "*/30 * * * *", label: "每 30 分钟" },
              ].map((option) => (
                <Button
                  key={option.cron}
                  variant={formData.scan_schedule === option.cron ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData({ ...formData, scan_schedule: option.cron })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* 自定义时间 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cron 表达式</label>
              <Input
                placeholder="0 9 * * 1"
                value={formData.scan_schedule}
                onChange={(e) => setFormData({ ...formData, scan_schedule: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">扫描范围</label>
              <div className="flex gap-2">
                <Button
                  variant={formData.scan_range_type === "week" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData({ ...formData, scan_range_type: "week" })}
                >
                  本周
                </Button>
                <Button
                  variant={formData.scan_range_type === "days" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData({ ...formData, scan_range_type: "days" })}
                >
                  最近N天
                </Button>
              </div>
            </div>
          </div>

          {/* 自定义时间选择器 */}
          <div className="border rounded-lg p-3 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">自定义时间</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">分钟</label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  placeholder="0"
                  value={(() => {
                    const parts = formData.scan_schedule.split(" ");
                    return parts[0] === "*" ? "" : parts[0]?.replace("*/", "") || "0";
                  })()}
                  onChange={(e) => {
                    const parts = formData.scan_schedule.split(" ");
                    parts[0] = e.target.value || "0";
                    setFormData({ ...formData, scan_schedule: parts.join(" ") });
                  }}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">小时</label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  placeholder="9"
                  value={(() => {
                    const parts = formData.scan_schedule.split(" ");
                    return parts[1] === "*" ? "" : parts[1] || "9";
                  })()}
                  onChange={(e) => {
                    const parts = formData.scan_schedule.split(" ");
                    parts[1] = e.target.value || "9";
                    setFormData({ ...formData, scan_schedule: parts.join(" ") });
                  }}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">日</label>
                <Input
                  type="text"
                  placeholder="*"
                  value={(() => {
                    const parts = formData.scan_schedule.split(" ");
                    return parts[2] || "*";
                  })()}
                  onChange={(e) => {
                    const parts = formData.scan_schedule.split(" ");
                    parts[2] = e.target.value || "*";
                    setFormData({ ...formData, scan_schedule: parts.join(" ") });
                  }}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">星期</label>
                <Input
                  type="text"
                  placeholder="*"
                  value={(() => {
                    const parts = formData.scan_schedule.split(" ");
                    return parts[4] || "*";
                  })()}
                  onChange={(e) => {
                    const parts = formData.scan_schedule.split(" ");
                    parts[4] = e.target.value || "*";
                    setFormData({ ...formData, scan_schedule: parts.join(" ") });
                  }}
                  className="h-8"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              格式: 分钟 小时 日 月 星期 (例: 0 9 * * 1 = 每周一 09:00)
            </p>
          </div>

          {formData.scan_range_type === "days" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">天数</label>
              <Input
                type="number"
                min={1}
                max={30}
                value={formData.scan_range_days || 7}
                onChange={(e) => setFormData({ ...formData, scan_range_days: parseInt(e.target.value) })}
                className="max-w-[100px]"
              />
            </div>
          )}

          {/* 当前配置预览 */}
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="font-medium">当前配置:</span>
            <code className="bg-muted px-2 py-0.5 rounded">{formData.scan_schedule}</code>
            <span>=</span>
            <span>{parseCronToHuman(formData.scan_schedule)}</span>
          </div>
        </CardContent>
      </Card>

      {/* 推送配置 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>通知推送配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">推送渠道</label>
            <div className="flex flex-wrap gap-2">
              {channels?.map((channel) => (
                <Button
                  key={channel.id}
                  variant={formData.scan_channels.includes(channel.id) ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (formData.scan_channels.includes(channel.id)) {
                      setFormData({
                        ...formData,
                        scan_channels: formData.scan_channels.filter((id) => id !== channel.id),
                      });
                    } else {
                      setFormData({
                        ...formData,
                        scan_channels: [...formData.scan_channels, channel.id],
                      });
                    }
                  }}
                >
                  {channel.name}
                </Button>
              ))}
              {(!channels || channels.length === 0) && (
                <p className="text-sm text-muted-foreground">暂无可用的通知渠道</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Walkin 集成配置 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Walkin 代码质量集成
          </CardTitle>
          <CardDescription>集成 Walkin 平台的 SonarQube 代码质量数据</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">启用</label>
            <div className="flex gap-4">
              <Button
                variant={formData.walkin_enabled ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, walkin_enabled: true })}
              >
                启用
              </Button>
              <Button
                variant={!formData.walkin_enabled ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, walkin_enabled: false })}
              >
                禁用
              </Button>
            </div>
          </div>

          {formData.walkin_enabled && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Walkin 地址</label>
                  <Input
                    placeholder="https://walkin.example.com"
                    value={formData.walkin_url}
                    onChange={(e) => setFormData({ ...formData, walkin_url: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">部门名称</label>
                  <Input
                    placeholder="输入部门名称"
                    value={formData.walkin_dept_name}
                    onChange={(e) => setFormData({ ...formData, walkin_dept_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">部门 ID</label>
                  <Input
                    placeholder="输入部门 ID（用于团队覆盖率看板）"
                    value={formData.walkin_dept_id}
                    onChange={(e) => setFormData({ ...formData, walkin_dept_id: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">在 Walkin 平台的团队覆盖率看板 URL 中获取</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">工作空间名称</label>
                  <Input
                    placeholder="输入工作空间名称"
                    value={formData.walkin_workspace_name}
                    onChange={(e) => setFormData({ ...formData, walkin_workspace_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">LDAP 用户名</label>
                  <Input
                    placeholder="输入 LDAP 用户名"
                    value={formData.walkin_username}
                    onChange={(e) => setFormData({ ...formData, walkin_username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">LDAP 密码</label>
                  <Input
                    type="password"
                    placeholder="输入 LDAP 密码"
                    value={formData.walkin_password}
                    onChange={(e) => setFormData({ ...formData, walkin_password: e.target.value })}
                  />
                </div>
              </div>

              {/* 登录状态 */}
              <div className="border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isLoggedIn ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">
                      {isLoggedIn ? `已登录: ${userName || "未知用户"}` : "未登录"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setIsCheckingLogin(true);
                        try {
                          await checkLogin();
                        } finally {
                          setIsCheckingLogin(false);
                        }
                      }}
                      disabled={isCheckingLogin}
                    >
                      <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isCheckingLogin ? "animate-spin" : ""}`} />
                      检测
                    </Button>
                    {!isLoggedIn && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          // 先保存配置，再触发登录
                          try {
                            toast.info("正在保存配置...");
                            await saveConfig.mutateAsync(formData);
                            toast.info("配置已保存，正在登录...");
                            await startAutoLogin({
                              username: formData.walkin_username,
                              password: formData.walkin_password,
                            });
                          } catch (e) {
                            const msg = e instanceof Error ? e.message : String(e);
                            toast.error("操作失败: " + msg);
                          }
                        }}
                      >
                        登录
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        const cleared = {
                          ...formData,
                          walkin_csrf_token: "",
                          walkin_project_header: "",
                          walkin_x_auth_token: "",
                        };
                        setFormData(cleared);
                        try {
                          await saveConfig.mutateAsync(cleared);
                          toast.success("Token 已清除，请重新登录");
                        } catch (e) {
                          const msg = e instanceof Error ? e.message : String(e);
                          toast.error("清除失败: " + msg);
                        }
                      }}
                    >
                      清除Token
                    </Button>
                  </div>
                </div>
                {formData.walkin_csrf_token && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Token: {formData.walkin_x_auth_token.slice(0, 8)}...{formData.walkin_x_auth_token.slice(-8)}
                  </div>
                )}
              </div>

              {/* 定时检测设置 */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">登录状态定时检测</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  定时检测登录状态，如果 token 失效会自动尝试重新登录
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 0, label: "不定时检测" },
                    { value: 10, label: "10分钟" },
                    { value: 30, label: "30分钟" },
                    { value: 60, label: "1小时" },
                    { value: 120, label: "2小时" },
                    { value: 360, label: "6小时" },
                  ].map((option) => (
                    <Button
                      key={option.value}
                      variant={loginCheckInterval === option.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleIntervalChange(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {loginCheckInterval > 0
                    ? `每 ${loginCheckInterval >= 60 ? `${loginCheckInterval / 60} 小时` : `${loginCheckInterval} 分钟`} 自动检测一次登录状态`
                    : "不会自动检测登录状态"}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">项目名称映射</label>
                <p className="text-xs text-muted-foreground">
                  当 GitLab 项目名与 Walkin 项目名不一致时，手动指定映射关系
                </p>
                <div className="space-y-2">
                  {formData.walkin_project_mappings.map((mapping, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder="GitLab 项目路径"
                        value={mapping.gitlab_project}
                        onChange={(e) => {
                          const updated = [...formData.walkin_project_mappings];
                          updated[idx] = { ...updated[idx], gitlab_project: e.target.value };
                          setFormData({ ...formData, walkin_project_mappings: updated });
                        }}
                        className="flex-1"
                      />
                      <span className="text-muted-foreground">→</span>
                      <Input
                        placeholder="Walkin 项目名"
                        value={mapping.walkin_project}
                        onChange={(e) => {
                          const updated = [...formData.walkin_project_mappings];
                          updated[idx] = { ...updated[idx], walkin_project: e.target.value };
                          setFormData({ ...formData, walkin_project_mappings: updated });
                        }}
                        className="flex-1"
                      />
                      <X
                        className="h-4 w-4 cursor-pointer hover:text-red-500 shrink-0"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            walkin_project_mappings: formData.walkin_project_mappings.filter((_, i) => i !== idx),
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      walkin_project_mappings: [
                        ...formData.walkin_project_mappings,
                        { gitlab_project: "", walkin_project: "" },
                      ],
                    })
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  添加映射
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => setFormData(defaultConfig)}>
          重置默认
        </Button>
        <Button onClick={handleSave} disabled={saveConfig.isPending}>
          {saveConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          保存配置
        </Button>
      </div>

    </div>
  );
}