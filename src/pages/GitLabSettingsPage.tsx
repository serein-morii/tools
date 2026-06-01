import { useState, useEffect } from "react";
import { Link2, CheckCircle, XCircle, Loader2, Plus, X, AlertCircle, Clock, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useGitLabConfig, useSaveGitLabConfig, useTestGitLabConnection } from "@/lib/query/gitlabQueries";
import { useChannels } from "@/lib/query/channelQueries";
import { defaultGitLabConfig } from "@/lib/gitlab/defaults";
import type { GitLabConfig, TokenProfile } from "@/types";

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
        <label className="text-xs font-medium">Token 配置（可多选）</label>
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
                  className="flex-1 h-8 text-xs"
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
                className="h-8 text-xs"
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

export function GitLabSettingsPage() {
  const { data: config, isLoading } = useGitLabConfig();
  const { data: channels } = useChannels();
  const saveConfig = useSaveGitLabConfig();
  const testConnection = useTestGitLabConnection();

  const [formData, setFormData] = useState<GitLabConfig>(defaultConfig);
  const [showToken, setShowToken] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "failed">("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [newProject, setNewProject] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [validationErrors, setValidationErrors] = useState<{ url?: string }>({});
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
        migratedConfig.selected_ldap_id = defaultConfig.selected_ldap_id;
      }
      // Ensure selected_ldap_id is set
      if (!migratedConfig.selected_ldap_id && migratedConfig.ldap_profiles.length > 0) {
        migratedConfig.selected_ldap_id = migratedConfig.ldap_profiles[0].id;
      }
      setFormData(migratedConfig);
    }
  }, [config]);

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
  const handleTest = async () => {
    if (!validateForm()) {
      return;
    }
    setConnectionStatus("testing");

    const selectedIds = formData.selected_token_ids || [];
    const profilesToTest = formData.token_profiles.filter(p => selectedIds.includes(p.id));

    if (profilesToTest.length === 0) {
      setConnectionStatus("failed");
      return;
    }

    let allSuccess = true;
    for (const profile of profilesToTest) {
      try {
        const testData = { ...formData, token: profile.token };
        const result = await testConnection.mutateAsync(testData);
        if (!result) {
          allSuccess = false;
        }
      } catch {
        allSuccess = false;
      }
    }

    setConnectionStatus(allSuccess ? "success" : "failed");
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }
    setSaveStatus("saving");
    try {
      await saveConfig.mutateAsync(formData);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
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

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl">
      {/* GitLab连接配置 */}
      <Card className="mb-3">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Link2 className="h-4 w-4" />
            <span className="text-sm font-medium">GitLab 连接配置</span>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">服务器地址</label>
            <Input
              placeholder="http://code.jms.com"
              value={formData.url}
              onChange={(e) => {
                setFormData({ ...formData, url: e.target.value });
                setValidationErrors({ ...validationErrors, url: undefined });
              }}
              className="h-8 text-xs"
            />
            {validationErrors.url && (
              <p className="text-sm text-destructive flex items-center gap-1">
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
            <Button variant="outline" size="sm" onClick={handleTest} disabled={connectionStatus === "testing" || !formData.url}>
              {connectionStatus === "testing" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              测试连接
            </Button>
            {connectionStatus === "success" && (
              <span className="flex items-center gap-1 text-sm text-emerald-600">
                <CheckCircle className="h-4 w-4" /> 连接成功
              </span>
            )}
            {connectionStatus === "failed" && (
              <span className="flex items-center gap-1 text-sm text-destructive">
                <XCircle className="h-4 w-4" /> 连接失败
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 项目过滤配置 */}
      <Card className="mb-3">
        <CardContent className="p-3 space-y-2">
          <span className="text-sm font-medium">项目过滤配置</span>
          <div className="space-y-2">
            <label className="text-xs font-medium">过滤模式</label>
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
            <label className="text-xs font-medium">项目列表</label>
            <div className="flex flex-wrap gap-2">
              {formData.filter_projects.map((project) => (
                <span
                  key={project}
                  className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {project}
                  <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => removeProject(project)} />
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="添加项目名称"
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                className="max-w-[200px] h-8 text-xs"
              />
              <Button variant="outline" size="sm" onClick={addProject}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 单测检测配置 */}
      <Card className="mb-3">
        <CardContent className="p-3 space-y-2">
          <span className="text-sm font-medium">单测检测配置</span>
          <div className="space-y-2">
            <label className="text-xs font-medium">检测关键词</label>
            <div className="flex flex-wrap gap-2">
              {formData.test_keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {keyword}
                  <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => removeKeyword(keyword)} />
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="添加关键词"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                className="max-w-[200px] h-8 text-xs"
              />
              <Button variant="outline" size="sm" onClick={addKeyword}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 定时扫描配置 */}
      <Card className="mb-3">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">定时扫描配置</span>
            </div>
            <Switch
              checked={formData.scan_enabled !== false}
              onCheckedChange={(checked) => setFormData({ ...formData, scan_enabled: checked })}
            />
          </div>
          {formData.scan_enabled !== false && (<>
          {/* 快捷选择 */}
          <div className="space-y-2">
            <label className="text-xs font-medium">快捷选择</label>
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
              <label className="text-xs font-medium">Cron 表达式</label>
              <Input
                placeholder="0 9 * * 1"
                value={formData.scan_schedule}
                onChange={(e) => setFormData({ ...formData, scan_schedule: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">扫描范围</label>
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
              <label className="text-xs font-medium">天数</label>
              <Input
                type="number"
                min={1}
                max={30}
                value={formData.scan_range_days || 7}
                onChange={(e) => setFormData({ ...formData, scan_range_days: parseInt(e.target.value) })}
                className="max-w-[100px] h-8 text-xs"
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
          </>)}
        </CardContent>
      </Card>

      {/* 推送配置 */}
      <Card className="mb-3">
        <CardContent className="p-3 space-y-2">
          <span className="text-sm font-medium">通知推送配置</span>
          <div className="space-y-2">
            <label className="text-xs font-medium">推送渠道</label>
            <p className="text-xs text-muted-foreground">
              请到 <span className="font-medium">提醒 - 渠道</span> 中配置通知渠道
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

      {/* Save Button */}
      <div className="flex justify-end gap-4 items-center">
        <Button variant="outline" size="sm" onClick={() => setFormData(defaultConfig)}>
          还原默认
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saveStatus === "saving"}>
          {saveStatus === "saving" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saveStatus === "success" && <Check className="mr-2 h-4 w-4" />}
          {saveStatus === "error" && <X className="mr-2 h-4 w-4" />}
          {saveStatus === "success" ? "已保存" : saveStatus === "error" ? "保存失败" : "保存配置"}
        </Button>
      </div>

    </div>
  );
}