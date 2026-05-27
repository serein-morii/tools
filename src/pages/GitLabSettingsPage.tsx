import { useState, useEffect } from "react";
import { Link2, CheckCircle, XCircle, Loader2, Plus, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useGitLabConfig, useSaveGitLabConfig, useTestGitLabConnection } from "@/lib/query/gitlabQueries";
import { useChannels } from "@/lib/query/channelQueries";
import { toast } from "sonner";
import type { GitLabConfig } from "@/types";

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

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
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

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

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
          <CardTitle>定时扫描配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cron表达式</label>
              <Input
                placeholder="0 9 * * 1"
                value={formData.scan_schedule}
                onChange={(e) => setFormData({ ...formData, scan_schedule: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">每周一 09:00</p>
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