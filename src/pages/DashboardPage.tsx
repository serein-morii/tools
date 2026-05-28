import { useTasks } from "@/lib/query/taskQueries";
import { useChannels } from "@/lib/query/channelQueries";
import { useTemplates } from "@/lib/query/templateQueries";
import { useReminderHistory } from "@/lib/query/reminderQueries";
import { useGitLabScanHistory, useGitLabConfigured, useGitLabConfig } from "@/lib/query/gitlabQueries";
import { gitlabApi } from "@/lib/api/gitlab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Radio, CheckCircle2, AlertCircle, Clock3, GitBranch, GitCommit, Users, BarChart3, TrendingUp, ChevronDown, GitMerge, Shield, Code2, Activity, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { UnitBoardData, DeveloperStat } from "@/types";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: tasks, isLoading: tasksLoading, error: tasksError } = useTasks();
  const { data: channels, isLoading: channelsLoading, error: channelsError } = useChannels();
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const { data: history, isLoading: historyLoading, error: historyError } = useReminderHistory();
  const { data: gitlabHistory, isLoading: gitlabLoading } = useGitLabScanHistory(5);
  const { data: gitlabConfigured } = useGitLabConfigured();
  const { data: gitlabConfig } = useGitLabConfig();
  const { t } = useTranslation();
  const [unitBoardData, setUnitBoardData] = useState<UnitBoardData | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setIsRefreshing(false);
  }, [queryClient]);

  // Fetch unit board data for coverage
  useEffect(() => {
    const fetchUnitBoard = async () => {
      if (!gitlabConfig?.walkin_enabled || !gitlabConfig?.walkin_url ||
          !gitlabConfig?.walkin_dept_id || !gitlabConfig?.walkin_dept_name ||
          !gitlabConfig?.walkin_csrf_token || !gitlabConfig?.walkin_x_auth_token) {
        return;
      }
      try {
        const result = await gitlabApi.walkinFetchUnitBoard(
          gitlabConfig.walkin_url,
          {
            csrf_token: gitlabConfig.walkin_csrf_token,
            project: gitlabConfig.walkin_project_header || "",
            workspace: gitlabConfig.walkin_workspace_name || "",
            x_auth_token: gitlabConfig.walkin_x_auth_token,
          },
          gitlabConfig.walkin_dept_id,
          gitlabConfig.walkin_dept_name,
        );
        setUnitBoardData(result);
      } catch (e) {
        console.error("Failed to fetch unit board:", e);
      }
    };
    fetchUnitBoard();
  }, [gitlabConfig]);

  const isLoading = tasksLoading || channelsLoading || templatesLoading || historyLoading || gitlabLoading;
  const error = tasksError || channelsError || historyError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {t("common.error", "加载失败")}
        </div>
      </div>
    );
  }

  const activeTasks = (tasks || []).filter((t) => t.enabled).length;
  const totalTasks = (tasks || []).length;
  const activeChannels = (channels || []).filter((c) => c.enabled).length;
  const totalChannels = (channels || []).length;
  const totalTemplates = (templates || []).length;

  const historyItems = history || [];
  const successCount = historyItems.filter((h) => h.status === "sent").length;
  const failedCount = historyItems.filter((h) => h.status === "failed").length;
  const pendingCount = historyItems.filter((h) => h.status === "pending").length;
  const successRate = historyItems.length > 0 ? Math.round((successCount / historyItems.length) * 100) : 0;

  // GitLab stats
  const latestScan = gitlabHistory?.[0];
  const gitlabProjects = latestScan?.total_projects || 0;
  const gitlabCommits = latestScan?.total_commits || 0;
  const gitlabContributors = latestScan ? JSON.parse(latestScan.contributors || "[]").length : 0;
  const noTestProjects = latestScan ? latestScan.total_projects - latestScan.test_projects : 0;

  // Coverage from unit board (latest value, not average)
  const newCoverage = unitBoardData?.ynewValue;
  const allCoverage = unitBoardData?.yallValue;

  // Upcoming tasks (next 7 days)
  const now = Date.now();
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
  const upcomingTasks = (tasks || [])
    .filter((t) => t.enabled && t.next_run_at && t.next_run_at <= weekAhead)
    .sort((a, b) => (a.next_run_at || 0) - (b.next_run_at || 0))
    .slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{t("dashboard.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("dashboard.description")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          {t("common.refresh", "刷新")}
        </button>
      </div>

      {/* Module: Reminder Tasks */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              {t("dashboard.reminderTasks")}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleSection("tasks")}
                className="flex items-center gap-1 h-7 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {t("common.viewDetails")}
                <ChevronDown className={cn("h-3 w-3 transition-transform", expandedSections["tasks"] && "rotate-180")} />
              </button>
              <Link to="/reminder/tasks" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {t("common.viewAll")}
              </Link>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <MiniStat label={t("dashboard.totalTasks")} value={totalTasks} />
            <MiniStat label={t("dashboard.enabled")} value={activeTasks} />
            <MiniStat label={t("dashboard.messageTemplates")} value={totalTemplates} />
          </div>

          {upcomingTasks.length > 0 && (
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground mb-2">{t("dashboard.upcoming7Days")}</div>
              <div className="space-y-2">
                {upcomingTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between text-sm">
                    <span className="truncate flex-1">{task.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {task.next_run_at ? new Date(task.next_run_at).toLocaleDateString("zh-CN") : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {upcomingTasks.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">{t("dashboard.noUpcomingTasks")}</p>
          )}

          {/* Expandable: Task Details */}
          {expandedSections["tasks"] && (
            <div className="border-t pt-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground mb-2">{t("dashboard.taskDetails")}</div>
              {(tasks || []).slice(0, 8).map((task) => (
                <div key={task.id} className="rounded-lg bg-muted/50 p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{task.name}</span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium",
                      task.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                    )}>
                      {task.enabled ? t("dashboard.enabled") : t("dashboard.disabled")}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-muted-foreground mb-1.5 line-clamp-2">{task.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock3 className="h-3 w-3" />
                      {task.cron_expr || "-"}
                    </span>
                    {task.last_run_at && (
                      <span>{t("dashboard.lastRun")}: {new Date(task.last_run_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                  </div>
                </div>
              ))}
              {(tasks || []).length > 8 && (
                <Link to="/reminder/tasks" className="block text-xs text-center text-muted-foreground hover:text-foreground py-1">
                  {t("common.viewAll")} ({(tasks || []).length})
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Module: Notification Channels */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-muted-foreground" />
              {t("dashboard.notificationChannels")}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleSection("channels")}
                className="flex items-center gap-1 h-7 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {t("common.viewDetails")}
                <ChevronDown className={cn("h-3 w-3 transition-transform", expandedSections["channels"] && "rotate-180")} />
              </button>
              <Link to="/reminder/channels" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {t("common.viewAll")}
              </Link>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <MiniStat label={t("dashboard.totalChannels")} value={totalChannels} />
              <MiniStat label={t("dashboard.enabled")} value={activeChannels} />
            </div>
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">{t("dashboard.pushStats")}</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="font-medium">{successCount}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  <span className="font-medium">{failedCount}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Clock3 className="h-3.5 w-3.5 text-amber-500" />
                  <span className="font-medium">{pendingCount}</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {t("dashboard.successRate")} <span className="font-medium text-foreground">{successRate}%</span>
              </div>
            </div>
          </div>

          {/* Expandable: Channel Details */}
          {expandedSections["channels"] && (
            <div className="border-t mt-4 pt-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground mb-2">{t("dashboard.channelDetails")}</div>
              {/* Channel type breakdown */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                {(["bark", "feishu", "wecom", "dingtalk"] as const).map((type) => {
                  const count = (channels || []).filter(c => c.type === type).length;
                  const enabledCount = (channels || []).filter(c => c.type === type && c.enabled).length;
                  return count > 0 ? (
                    <div key={type} className="rounded-lg bg-muted/50 p-2 text-center">
                      <div className="text-xs font-medium capitalize">{type}</div>
                      <div className="text-lg font-bold">{count}</div>
                      <div className="text-[10px] text-muted-foreground">{enabledCount} {t("dashboard.enabled")}</div>
                    </div>
                  ) : null;
                })}
              </div>
              {/* Individual channels */}
              {(channels || []).slice(0, 6).map((ch) => (
                <div key={ch.id} className="rounded-lg bg-muted/50 p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{ch.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted capitalize">{ch.type}</span>
                    </div>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium",
                      ch.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                    )}>
                      {ch.enabled ? t("dashboard.enabled") : t("dashboard.disabled")}
                    </span>
                  </div>
                  {ch.last_test_at && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock3 className="h-3 w-3" />
                      {t("dashboard.lastTest")}: {new Date(ch.last_test_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {ch.last_test_result && (
                        <span className={cn(
                          "ml-1",
                          ch.last_test_result === "success" ? "text-emerald-600" : "text-destructive"
                        )}>
                          {ch.last_test_result === "success" ? "✓" : "✗"}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {(channels || []).length > 6 && (
                <Link to="/reminder/channels" className="block text-xs text-center text-muted-foreground hover:text-foreground py-1">
                  {t("common.viewAll")} ({(channels || []).length})
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Module: GitLab Code Scan */}
      {gitlabConfigured && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                {t("dashboard.gitlabCodeScan")}
              </div>
              <div className="flex items-center gap-3">
                {latestScan && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(latestScan.scan_at).toLocaleDateString("zh-CN")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => toggleSection("gitlab")}
                  className="flex items-center gap-1 h-7 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {t("common.viewDetails")}
                  <ChevronDown className={cn("h-3 w-3 transition-transform", expandedSections["gitlab"] && "rotate-180")} />
                </button>
                <Link to="/gitlab/overview" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  {t("common.viewAll")}
                </Link>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <MiniStat icon={GitBranch} label={t("dashboard.changedProjects")} value={gitlabProjects} />
              <MiniStat icon={GitCommit} label={t("dashboard.commitCount")} value={gitlabCommits} />
              <MiniStat icon={Users} label={t("dashboard.contributors")} value={gitlabContributors} />
              <MiniStat
                icon={TrendingUp}
                label={t("dashboard.incrementalCoverage")}
                value={newCoverage != null ? `${newCoverage.toFixed(2)}%` : "-"}
              />
              <MiniStat
                icon={BarChart3}
                label={t("dashboard.fullCoverage")}
                value={allCoverage != null ? `${allCoverage.toFixed(2)}%` : "-"}
              />
            </div>
            {noTestProjects > 0 && (
              <div className="mt-3 pt-3 border-t">
                <span className="text-xs text-muted-foreground">
                  {t("dashboard.noTestProjects")}<span className="font-medium text-foreground">{noTestProjects}</span>
                </span>
              </div>
            )}

            {/* Expandable: GitLab Details */}
            {expandedSections["gitlab"] && latestScan && (
              <div className="border-t mt-4 pt-3 space-y-4">
                {/* Pipeline Stats */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Activity className="h-3 w-3" /> {t("dashboard.pipelineStats")}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="rounded-lg bg-muted/50 p-2 text-center">
                      <div className="text-xs text-muted-foreground">{t("dashboard.total")}</div>
                      <div className="text-lg font-bold">{latestScan.pipeline_total}</div>
                    </div>
                    <div className="rounded-lg bg-emerald-500/5 p-2 text-center">
                      <div className="text-xs text-emerald-600">{t("dashboard.success")}</div>
                      <div className="text-lg font-bold text-emerald-600">{latestScan.pipeline_success}</div>
                    </div>
                    <div className="rounded-lg bg-destructive/5 p-2 text-center">
                      <div className="text-xs text-destructive">{t("dashboard.failed")}</div>
                      <div className="text-lg font-bold text-destructive">{latestScan.pipeline_failed}</div>
                    </div>
                    <div className="rounded-lg bg-amber-500/5 p-2 text-center">
                      <div className="text-xs text-amber-600">{t("dashboard.pendingMRs")}</div>
                      <div className="text-lg font-bold text-amber-600">{latestScan.pending_mrs}</div>
                    </div>
                  </div>
                </div>

                {/* Code Changes */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Code2 className="h-3 w-3" /> {t("dashboard.codeChanges")}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-muted/50 p-2 text-center">
                      <div className="text-xs text-muted-foreground">{t("dashboard.total")}</div>
                      <div className="text-sm font-bold">{formatLinesAdded(latestScan.total_lines_added + latestScan.total_lines_removed)}</div>
                    </div>
                    <div className="rounded-lg bg-emerald-500/5 p-2 text-center">
                      <div className="text-xs text-emerald-600">+ {t("dashboard.added")}</div>
                      <div className="text-sm font-bold text-emerald-600">{formatLinesAdded(latestScan.total_lines_added)}</div>
                    </div>
                    <div className="rounded-lg bg-destructive/5 p-2 text-center">
                      <div className="text-xs text-destructive">- {t("dashboard.removed")}</div>
                      <div className="text-sm font-bold text-destructive">{formatLinesAdded(latestScan.total_lines_removed)}</div>
                    </div>
                  </div>
                </div>

                {/* Scan Range */}
                {latestScan.scan_range_start && latestScan.scan_range_end && (
                  <div className="text-xs text-muted-foreground">
                    {t("dashboard.scanRange")}: {latestScan.scan_range_start} ~ {latestScan.scan_range_end}
                  </div>
                )}

                {/* Top Contributors */}
                {(() => {
                  try {
                    const devs: DeveloperStat[] = JSON.parse(latestScan.developer_stats || "[]");
                    if (devs.length === 0) return null;
                    const top3 = [...devs].sort((a, b) => (b.commits) - (a.commits)).slice(0, 3);
                    return (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Users className="h-3 w-3" /> {t("dashboard.topContributors")}
                        </div>
                        <div className="space-y-1.5">
                          {top3.map((dev, i) => (
                            <div key={dev.name} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-base">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
                                <span className="font-medium">{dev.name}</span>
                              </div>
                              <div className="flex items-center gap-3 text-muted-foreground">
                                <span>{dev.commits} {t("dashboard.commits")}</span>
                                <span className="text-emerald-600">+{dev.lines_added}</span>
                                <span className="text-destructive">-{dev.lines_removed}</span>
                                {dev.mrs_created > 0 && (
                                  <span className="flex items-center gap-0.5">
                                    <GitMerge className="h-3 w-3" />{dev.mrs_created}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  } catch {
                    return null;
                  }
                })()}

                {/* Quality Ratings (Walkin) */}
                {(() => {
                  try {
                    const projects = JSON.parse(latestScan.summary || "[]");
                    const withMetrics = projects.filter((p: { walkin_metrics?: { reliability_rating?: string | null } }) => p.walkin_metrics?.reliability_rating);
                    if (withMetrics.length === 0) return null;
                    const avgReliability = withMetrics.reduce((s: number, p: { walkin_metrics: { reliability_rating: string } }) => s + ratingToNumber(p.walkin_metrics.reliability_rating), 0) / withMetrics.length;
                    const avgSecurity = withMetrics.reduce((s: number, p: { walkin_metrics: { security_rating: string } }) => s + ratingToNumber(p.walkin_metrics.security_rating), 0) / withMetrics.length;
                    const avgMaintainability = withMetrics.reduce((s: number, p: { walkin_metrics: { maintainability_rating: string } }) => s + ratingToNumber(p.walkin_metrics.maintainability_rating), 0) / withMetrics.length;
                    return (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Shield className="h-3 w-3" /> {t("dashboard.qualityRatings")}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <RatingCard label={t("dashboard.reliability")} value={avgReliability} />
                          <RatingCard label={t("dashboard.security")} value={avgSecurity} />
                          <RatingCard label={t("dashboard.maintainability")} value={avgMaintainability} />
                        </div>
                      </div>
                    );
                  } catch {
                    return null;
                  }
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && (
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold leading-tight">{value}</div>
      </div>
    </div>
  );
}

function formatLinesAdded(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}

function ratingToNumber(rating: string | null): number {
  if (!rating) return 0;
  const map: Record<string, number> = { "1.0": 5, "2.0": 4, "3.0": 3, "4.0": 2, "5.0": 1, "A": 5, "B": 4, "C": 3, "D": 2, "E": 1 };
  return map[rating] ?? 0;
}

function RatingCard({ label, value }: { label: string; value: number }) {
  const ratingLabel = value >= 4.5 ? "A" : value >= 3.5 ? "B" : value >= 2.5 ? "C" : value >= 1.5 ? "D" : "E";
  const color = value >= 4 ? "text-emerald-600" : value >= 3 ? "text-amber-600" : "text-destructive";
  return (
    <div className="rounded-lg bg-muted/50 p-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{ratingLabel}</div>
    </div>
  );
}
