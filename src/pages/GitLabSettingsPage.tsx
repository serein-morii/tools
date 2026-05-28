import { useState, useEffect } from "react";
import { Link2, CheckCircle, XCircle, Loader2, Plus, X, AlertCircle, Shield, Clock, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useGitLabConfig, useSaveGitLabConfig, useTestGitLabConnection } from "@/lib/query/gitlabQueries";
import { useChannels } from "@/lib/query/channelQueries";
import { toast } from "sonner";
import { useWalkinAuth } from "@/components/modules/gitlab/WalkinAuthManager";
import { defaultGitLabConfig } from "@/lib/gitlab/defaults";
import type { GitLabConfig, TokenProfile, LdapProfile } from "@/types";

const defaultConfig = defaultGitLabConfig;

function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

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

// Token Profile Editor Component (Multi-select)
function TokenProfileEditor({
  profiles,
  selectedIds,
  onToggleSelect,
  onUpdate,
  onAdd,
  onDelete,
  showToken,
  setShowToken,
}: {
  profiles: TokenProfile[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onUpdate: (profiles: TokenProfile[]) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  showToken: boolean;
  setShowToken: (show: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Token 配置（可多选）</label>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" /> 新增
        </Button>
      </div>

      {/* Profile Selection (Multi-select) */}
      <div className="flex flex-wrap gap-2">
        {profiles.map((profile) => {
          const isSelected = selectedIds.includes(profile.id);
          return (
            <Button
              key={profile.id}
              variant={isSelected ? "default" : "outline"}
              size="sm"
              onClick={() => onToggleSelect(profile.id)}
            >
              {isSelected && <CheckCircle className="h-3 w-3 mr-1" />}
              {profile.label || `Token ${profile.id.slice(0, 8)}`}
            </Button>
          );
        })}
      </div>

      {/* Selected Profiles Details */}
      {selectedIds.length > 0 && (
        <div className="space-y-2">
          {profiles.filter(p => selectedIds.includes(p.id)).map((profile) => (
            <div key={profile.id} className="border rounded-lg p-3 bg-muted/30 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="备注/标签"
                  value={profile.label}
                  onChange={(e) => {
                    onUpdate(profiles.map(p => p.id === profile.id ? { ...p, label: e.target.value } : p));
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? "隐藏" : "显示"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(profile.id)}
                  disabled={profiles.length <= 1}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                type={showToken ? "text" : "password"}
                placeholder="输入 GitLab Private Token"
                value={profile.token}
                onChange={(e) => {
                  onUpdate(profiles.map(p => p.id === profile.id ? { ...p, token: e.target.value } : p));
                }}
              />
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        💡 已选择 {selectedIds.length} 个账号，扫描时会合并所有账号的项目（重复项目只取一个）
      </p>
    </div>
  );
}

// LDAP Profile Editor Component
function LdapProfileEditor({
  profiles,
  selectedId,
  onSelect,
  onUpdate,
  onAdd,
  onDelete,
}: {
  profiles: LdapProfile[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onUpdate: (profiles: LdapProfile[]) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">LDAP 配置（可选择、可新增、可修改）</label>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" /> 新增
        </Button>
      </div>

      {/* Profile Selection */}
      <div className="flex flex-wrap gap-2">
        {profiles.map((profile) => (
          <Button
            key={profile.id}
            variant={selectedId === profile.id ? "default" : "outline"}
            size="sm"
            onClick={() => onSelect(profile.id)}
          >
            {profile.label || `LDAP ${profile.id.slice(0, 8)}`}
          </Button>
        ))}
      </div>

      {/* Selected Profile Details */}
      {selectedId && (
        <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
          {profiles.filter(p => p.id === selectedId).map((profile) => (
            <div key={profile.id} className="space-y-2">
              <Input
                placeholder="备注/标签"
                value={profile.label}
                onChange={(e) => {
                  onUpdate(profiles.map(p => p.id === profile.id ? { ...p, label: e.target.value } : p));
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="LDAP 用户名（加密）"
                  value={profile.username}
                  onChange={(e) => {
                    onUpdate(profiles.map(p => p.id === profile.id ? { ...p, username: e.target.value } : p));
                  }}
                />
                <Input
                  type="password"
                  placeholder="LDAP 密码（加密）"
                  value={profile.password}
                  onChange={(e) => {
                    onUpdate(profiles.map(p => p.id === profile.id ? { ...p, password: e.target.value } : p));
                  }}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(profile.id)}
                  disabled={profiles.length <= 1}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> 删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  const [validationErrors, setValidationErrors] = useState<{ url?: string }>({});
  const { isLoggedIn, userName, checkLogin, startAutoLogin } = useWalkinAuth();
  const [isCheckingLogin, setIsCheckingLogin] = useState(false);

  // 定时检测间隔
  const [loginCheckInterval, setLoginCheckInterval] = useState<number>(() => {
    const saved = localStorage.getItem("walkin_login_check_interval");
    return saved ? parseInt(saved) : 0;
  });

  useEffect(() => {
    if (config) {
      // Ensure backward compatibility - if old config has single token/ldap but no profiles, migrate
      const migratedConfig = { ...config };
      if (!config.token_profiles || config.token_profiles.length === 0) {
        if (config.token) {
          migratedConfig.token_profiles = [{ id: "token-legacy", token: config.token, label: "默认" }];
          migratedConfig.selected_token_ids = ["token-legacy"];
        } else {
          migratedConfig.token_profiles = defaultConfig.token_profiles;
          migratedConfig.selected_token_ids = defaultConfig.selected_token_ids;
        }
      }
      // Migrate from old selected_token_id to new selected_token_ids
      if (!config.selected_token_ids || config.selected_token_ids.length === 0) {
        if (config.selected_token_id) {
          migratedConfig.selected_token_ids = [config.selected_token_id];
        } else if (migratedConfig.token_profiles && migratedConfig.token_profiles.length > 0) {
          migratedConfig.selected_token_ids = migratedConfig.token_profiles.map(p => p.id);
        }
      }
      if (!config.ldap_profiles || config.ldap_profiles.length === 0) {
        // No ldap profiles in old config - use default
        migratedConfig.ldap_profiles = defaultConfig.ldap_profiles;
      }
      setFormData(migratedConfig);
    }
  }, [config]);

  // 保存检测间隔到 localStorage
  const handleIntervalChange = (interval: number) => {
    setLoginCheckInterval(interval);
    localStorage.setItem("walkin_login_check_interval", interval.toString());
  };

  const validateForm = (): boolean => {
    const errors: { url?: string } = {};

    if (!formData.url) {
      errors.url = "服务器地址不能为空";
    } else if (!isValidUrl(formData.url)) {
      errors.url = "请输入有效的URL地址（如 http://code.jms.com）";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Get selected token from profiles
  const getSelectedToken = (): string | undefined => {
    const profile = formData.token_profiles.find(p => p.id === formData.selected_token_id);
    return profile?.token;
  };

  const handleTest = async () => {
    if (!validateForm()) {
      return;
    }
    setConnectionStatus("testing");
    try {
      // Use selected token for testing
      const testData = {
        ...formData,
        token: getSelectedToken(),
      };
      const result = await testConnection.mutateAsync(testData);
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

  // Token profile handlers (multi-select)
  const addTokenProfile = () => {
    const newProfile: TokenProfile = { id: generateId(), token: "", label: "" };
    setFormData({
      ...formData,
      token_profiles: [...formData.token_profiles, newProfile],
      selected_token_ids: [...(formData.selected_token_ids || []), newProfile.id],
    });
  };

  const deleteTokenProfile = (id: string) => {
    const updated = formData.token_profiles.filter(p => p.id !== id);
    const newSelectedIds = (formData.selected_token_ids || []).filter(i => i !== id);
    setFormData({
      ...formData,
      token_profiles: updated,
      selected_token_ids: newSelectedIds.length > 0 ? newSelectedIds : updated[0] ? [updated[0].id] : [],
    });
  };

  const updateTokenProfiles = (profiles: TokenProfile[]) => {
    setFormData({ ...formData, token_profiles: profiles });
  };

  const toggleTokenSelection = (id: string) => {
    const currentSelected = formData.selected_token_ids || [];
    if (currentSelected.includes(id)) {
      // Remove from selection (but keep at least one)
      const newSelected = currentSelected.filter(i => i !== id);
      setFormData({
        ...formData,
        selected_token_ids: newSelected.length > 0 ? newSelected : currentSelected,
      });
    } else {
      // Add to selection
      setFormData({
        ...formData,
        selected_token_ids: [...currentSelected, id],
      });
    }
  };

  // LDAP profile handlers (for Walkin)
  const addLdapProfile = () => {
    const newProfile: LdapProfile = { id: generateId(), username: "", password: "", label: "" };
    setFormData({
      ...formData,
      ldap_profiles: [...formData.ldap_profiles, newProfile],
      selected_ldap_id: newProfile.id,
    });
  };

  const deleteLdapProfile = (id: string) => {
    const updated = formData.ldap_profiles.filter(p => p.id !== id);
    const newSelectedId = formData.selected_ldap_id === id ? updated[0]?.id : formData.selected_ldap_id;
    setFormData({
      ...formData,
      ldap_profiles: updated,
      selected_ldap_id: newSelectedId,
    });
  };

  const updateLdapProfiles = (profiles: LdapProfile[]) => {
    setFormData({ ...formData, ldap_profiles: profiles });
  };

  // Get selected LDAP credentials
  const getSelectedLdap = (): { username: string; password: string } | undefined => {
    const profile = formData.ldap_profiles.find(p => p.id === formData.selected_ldap_id);
    return profile ? { username: profile.username, password: profile.password } : undefined;
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
          <CardDescription>配置 GitLab 服务器连接信息，支持多套 Token 凭据</CardDescription>
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

          {/* Token Profiles */}
          <TokenProfileEditor
            profiles={formData.token_profiles}
            selectedIds={formData.selected_token_ids || []}
            onToggleSelect={toggleTokenSelection}
            onUpdate={updateTokenProfiles}
            onAdd={addTokenProfile}
            onDelete={deleteTokenProfile}
            showToken={showToken}
            setShowToken={setShowToken}
          />

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
          <CardDescription>扫描完成后推送通知到指定渠道</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">推送渠道</label>
            <p className="text-xs text-muted-foreground">
              请到 <span className="font-medium">任务提醒 - 渠道</span> 中配置通知渠道
            </p>
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
                    placeholder="http://walkin.jms.com"
                    value={formData.walkin_url}
                    onChange={(e) => setFormData({ ...formData, walkin_url: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">部门名称</label>
                  <Input
                    placeholder="产品架构"
                    value={formData.walkin_dept_name}
                    onChange={(e) => setFormData({ ...formData, walkin_dept_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">部门 ID</label>
                  <Input
                    placeholder="a0a768d7-9e8d-448c-9b79-926d84f51ea1"
                    value={formData.walkin_dept_id}
                    onChange={(e) => setFormData({ ...formData, walkin_dept_id: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">在 Walkin 平台的团队覆盖率看板 URL 中获取</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">工作空间名称</label>
                  <Input
                    placeholder="产品架构&PMO"
                    value={formData.walkin_workspace_name}
                    onChange={(e) => setFormData({ ...formData, walkin_workspace_name: e.target.value })}
                  />
                </div>
              </div>

              {/* LDAP Profiles for Walkin */}
              <LdapProfileEditor
                profiles={formData.ldap_profiles}
                selectedId={formData.selected_ldap_id}
                onSelect={(id) => setFormData({ ...formData, selected_ldap_id: id })}
                onUpdate={updateLdapProfiles}
                onAdd={addLdapProfile}
                onDelete={deleteLdapProfile}
              />

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
                          const ldap = getSelectedLdap();
                          if (!ldap?.username || !ldap?.password) {
                            toast.error("请先选择 LDAP 配置并填写用户名和密码");
                            return;
                          }
                          if (!formData.walkin_url) {
                            toast.error("请先填写 Walkin 地址");
                            return;
                          }
                          try {
                            toast.info("正在保存配置...");
                            await saveConfig.mutateAsync(formData);
                            // 传入最新配置覆盖，不依赖 config ref
                            await startAutoLogin(ldap, {
                              walkin_url: formData.walkin_url,
                              walkin_project_header: formData.walkin_project_header,
                              walkin_workspace_name: formData.walkin_workspace_name,
                              ldap_profiles: formData.ldap_profiles,
                              selected_ldap_id: formData.selected_ldap_id,
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
                {formData.walkin_x_auth_token && (
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
          还原默认
        </Button>
        <Button onClick={handleSave} disabled={saveConfig.isPending}>
          {saveConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          保存配置
        </Button>
      </div>

    </div>
  );
}