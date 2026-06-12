import { useTasks } from "@/lib/query/taskQueries";
import { useChannels } from "@/lib/query/channelQueries";
import { useTemplates } from "@/lib/query/templateQueries";
import { useReminderHistory } from "@/lib/query/reminderQueries";
import { useGitLabScanHistory, useGitLabConfigured, useGitLabConfig } from "@/lib/query/gitlabQueries";
import { gitlabApi } from "@/lib/api/gitlab";
import { getHistory as getSonarHistory } from "@/lib/sonar/history";
import { getTemplates } from "@/lib/sonar/templates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bell, Radio, CheckCircle2, GitBranch, BarChart3, RefreshCw,
  FlaskConical, FileCode, Brain,
  ArrowRight, LayoutGrid, Settings, MessageSquare, History, Cog,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { UnitBoardData, DeveloperStat } from "@/types";
import { cn } from "@/lib/utils";
import { useWalkinAuth } from "@/components/modules/gitlab/WalkinAuthManager";

const quickLinks = [
  { to: "/reminder/tasks", icon: Bell, label: "提醒任务", color: "text-amber-500" },
  { to: "/reminder/channels", icon: Radio, label: "通知渠道", color: "text-blue-500" },
  { to: "/reminder/templates", icon: FileCode, label: "消息模板", color: "text-purple-500" },
  { to: "/reminder/history", icon: History, label: "发送历史", color: "text-cyan-500" },
  { to: "/gitlab/overview", icon: GitBranch, label: "Git扫描", color: "text-orange-500" },
  { to: "/gitlab/settings", icon: Settings, label: "Git 配置", color: "text-gray-500" },
  { to: "/sonar", icon: FlaskConical, label: "单测覆盖率", color: "text-emerald-500", settingsTo: "/sonar?tab=settings" },
  { to: "/ai-coverage", icon: Brain, label: "AI生成率", color: "text-violet-500", settingsTo: "/ai-coverage?tab=settings" },
  { to: "/settings", icon: Settings, label: "系统设置", color: "text-muted-foreground" },
];

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: tasks } = useTasks();
  const { data: channels } = useChannels();
  const { data: templates } = useTemplates();
  const { data: history } = useReminderHistory();
  const { data: gitlabHistory } = useGitLabScanHistory(5);
  const { data: gitlabConfigured } = useGitLabConfigured();
  const { data: gitlabConfig } = useGitLabConfig();
  const { isLoggedIn, userName } = useWalkinAuth();
  const { t, i18n } = useTranslation();
  const [unitBoardData, setUnitBoardData] = useState<UnitBoardData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sonarHistory] = useState(() => getSonarHistory());
  const [sonarTemplates] = useState(() => getTemplates());
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setIsRefreshing(false);
  }, [queryClient]);

  useEffect(() => {
    const fetchUnitBoard = async () => {
      if (!gitlabConfig?.walkin_enabled || !gitlabConfig?.walkin_url || !gitlabConfig?.walkin_dept_id || !gitlabConfig?.walkin_dept_name || !gitlabConfig?.walkin_csrf_token || !gitlabConfig?.walkin_x_auth_token) return;
      try {
        const result = await gitlabApi.walkinFetchUnitBoard(
          gitlabConfig.walkin_url,
          { csrf_token: gitlabConfig.walkin_csrf_token, project: gitlabConfig.walkin_project_header || "", workspace: gitlabConfig.walkin_workspace_id || gitlabConfig.walkin_workspace_name || "", x_auth_token: gitlabConfig.walkin_x_auth_token },
          gitlabConfig.walkin_dept_id, gitlabConfig.walkin_dept_name, gitlabConfig.walkin_workspace_name,
        );
        setUnitBoardData(result);
      } catch { /* ignore */ }
    };
    fetchUnitBoard();
  }, [gitlabConfig]);

  const taskList = tasks || [];
  const channelList = channels || [];
  const historyList = history || [];
  const activeTasks = taskList.filter(t => t.enabled).length;
  const activeChannels = channelList.filter(c => c.enabled).length;
  const totalTemplates = (templates || []).length;
  const successCount = historyList.filter(h => h.status === "sent").length;
  const successRate = historyList.length > 0 ? Math.round((successCount / historyList.length) * 100) : 0;

  const latestScan = gitlabHistory?.[0];
  const gitlabProjects = latestScan?.total_projects || 0;
  const gitlabCommits = latestScan?.total_commits || 0;
  const gitlabContributors = latestScan ? JSON.parse(latestScan.contributors || "[]").length : 0;

  const now = Date.now();
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
  const upcomingTasks = taskList.filter(t => t.enabled && t.next_run_at && t.next_run_at <= weekAhead).sort((a, b) => (a.next_run_at || 0) - (b.next_run_at || 0));

  const recentHistory = historyList.filter(h => h.executed_at).slice(0, 5);

  return (
    <div className="p-3 space-y-2.5 max-w-[1400px] mx-auto">
      {/* Welcome Bar */}
      <div className="relative overflow-hidden rounded-lg border bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-purple-500/10 px-4 py-3">
        <div className="absolute top-0 right-0 text-4xl opacity-10 select-none">
          {(["☀️","🌤️","🌙","🌟"])[currentTime.getHours() < 12 ? 0 : currentTime.getHours() < 18 ? 1 : 2]}
        </div>
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md">
              <LayoutGrid className="h-[18px] w-[18px] text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold">
                  {isLoggedIn && userName ? userName : t("dashboard.welcome")}
                </h2>
                {(() => {
                  const h = currentTime.getHours();
                  const key = h < 6 ? "greetingLateNight" :
                              h < 9 ? "greetingMorning" :
                              h < 12 ? "greetingForenoon" :
                              h < 14 ? "greetingNoon" :
                              h < 18 ? "greetingAfternoon" :
                              h < 22 ? "greetingEvening" : "greetingLateNight";
                  return (
                    <span className="text-[10px] text-muted-foreground font-normal">
                      — {t(`dashboard.${key}`)}
                    </span>
                  );
                })()}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {currentTime.toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
                {" · "}{currentTime.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end">
              <span className="inline-flex items-center gap-1 text-[9px] bg-background/80 rounded-full px-2 py-0.5">
                <span className="h-1 w-1 rounded-full bg-emerald-500" />
                扫描 {sonarHistory.length}
              </span>
              {gitlabConfigured && (
                <span className="inline-flex items-center gap-1 text-[9px] bg-background/80 rounded-full px-2 py-0.5">
                  <span className="h-1 w-1 rounded-full bg-orange-500" />
                  Git {gitlabProjects}
                </span>
              )}
              <span className={cn("inline-flex items-center gap-1 text-[9px] bg-background/80 rounded-full px-2 py-0.5",
                isLoggedIn ? "" : "text-muted-foreground"
              )}>
                <span className={cn("h-1 w-1 rounded-full", isLoggedIn ? "bg-emerald-500" : "bg-muted-foreground")} />
                {isLoggedIn ? "Walkin 在线" : "Walkin 离线"}
              </span>
            </div>
            <button onClick={handleRefresh} disabled={isRefreshing} className="flex items-center gap-1 h-6 rounded-md bg-background/80 px-2 text-[10px] text-muted-foreground hover:text-foreground hover:bg-background transition-colors shrink-0">
              <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
              刷新
            </button>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-11 gap-1">
        {quickLinks.map(link => (
          <div key={link.to} className="relative group">
            <Link to={link.to} className="flex flex-col items-center gap-0.5 rounded-md border bg-card px-1.5 py-1.5 hover:bg-muted/50 transition-colors">
              <link.icon className={cn("h-4 w-4", link.color)} />
              <span className="text-[9px] text-muted-foreground group-hover:text-foreground leading-tight text-center">{link.label}</span>
            </Link>
            {"settingsTo" in link && link.settingsTo && (
              <Link
                to={link.settingsTo}
                title="设置"
                onClick={(e) => e.stopPropagation()}
                className="absolute top-0.5 right-0.5 h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Cog className="h-2.5 w-2.5" />
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-5 gap-2 px-4 py-2 bg-muted/30 rounded-lg border">
        <StatCard icon={Bell} label="活跃任务" value={activeTasks} sub={`共 ${taskList.length}`} href="/reminder/tasks" color="text-amber-500" />
        <StatCard icon={Radio} label="通知渠道" value={activeChannels} sub={`共 ${channelList.length}`} href="/reminder/channels" color="text-blue-500" />
        <StatCard icon={CheckCircle2} label="发送成功" value={successCount} sub={`${successRate}%`} href="/reminder/history" color="text-emerald-500" />
        <StatCard icon={FlaskConical} label="扫描记录" value={sonarHistory.length} sub={`${sonarHistory.reduce((s, r) => s + r.fileCount, 0)} 文件`} href="/sonar" color="text-cyan-500" />
        <StatCard icon={GitBranch} label="变更项目" value={gitlabConfigured ? gitlabProjects : "-"} sub={gitlabConfigured ? `${gitlabCommits} commits` : "未配置"} href="/gitlab/overview" color="text-orange-500" />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left Column */}
        <div className="space-y-3">
          {/* Reminder Status */}
          <Card>
            <CardHeader className="pb-1.5 pt-2 px-3 flex-row items-center justify-between">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-amber-500" /> 智能提醒
              </CardTitle>
              <Link to="/reminder/tasks" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                全部 <ArrowRight className="h-2.5 w-2.5" />
              </Link>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 space-y-2">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded bg-muted/50 p-1.5"><div className="text-base font-bold">{taskList.length}</div><div className="text-[10px] text-muted-foreground">任务</div></div>
                <div className="rounded bg-muted/50 p-1.5"><div className="text-lg font-bold text-emerald-600">{activeTasks}</div><div className="text-[10px] text-muted-foreground">已启用</div></div>
                <div className="rounded bg-muted/50 p-1.5"><div className="text-base font-bold">{channelList.length}</div><div className="text-[10px] text-muted-foreground">渠道</div></div>
                <div className="rounded bg-muted/50 p-1.5"><div className="text-base font-bold">{totalTemplates}</div><div className="text-[10px] text-muted-foreground">模板</div></div>
              </div>
              {upcomingTasks.length > 0 && (
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1.5">未来 7 天</div>
                  <div className="space-y-1">
                    {upcomingTasks.slice(0, 4).map(task => (
                      <div key={task.id} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
                        <span className="truncate">{task.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{task.next_run_at ? new Date(task.next_run_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : "-"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-1.5">
                <Link to="/reminder/tasks" className="flex-1 text-center text-[10px] border rounded px-2 py-1 hover:bg-muted transition-colors">管理任务</Link>
                <Link to="/reminder/channels" className="flex-1 text-center text-[10px] border rounded px-2 py-1 hover:bg-muted transition-colors">管理渠道</Link>
                <Link to="/reminder/templates" className="flex-1 text-center text-[10px] border rounded px-2 py-1 hover:bg-muted transition-colors">管理模板</Link>
              </div>
            </CardContent>
          </Card>

          {/* Code Scan Summary */}
          {gitlabConfigured && latestScan && (
            <Card>
              <CardHeader className="pb-1.5 pt-2 px-3 flex-row items-center justify-between">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5 text-orange-500" /> 代码扫描
                </CardTitle>
                <Link to="/gitlab/overview" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                  详情 <ArrowRight className="h-2.5 w-2.5" />
                </Link>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0 space-y-2">
                <div className="text-[10px] text-muted-foreground">最近扫描: {new Date(latestScan.scan_at).toLocaleString("zh-CN")}</div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <MiniBlock label="项目" value={latestScan.total_projects} />
                  <MiniBlock label="提交" value={latestScan.total_commits} />
                  <MiniBlock label="贡献者" value={gitlabContributors} />
                  <MiniBlock label="MR" value={latestScan.pending_mrs} color="text-amber-600" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MiniBlock label="流水线" value={`${latestScan.pipeline_success}/${latestScan.pipeline_total}`} color="text-emerald-600" />
                  <MiniBlock label="+行" value={formatLines(latestScan.total_lines_added)} color="text-emerald-600" />
                  <MiniBlock label="-行" value={formatLines(latestScan.total_lines_removed)} color="text-destructive" />
                </div>
                {(() => {
                  try {
                    const devs: DeveloperStat[] = JSON.parse(latestScan.developer_stats || "[]");
                    const top3 = [...devs].sort((a, b) => b.commits - a.commits).slice(0, 3);
                    if (top3.length === 0) return null;
                    return (
                      <div>
                        <div className="text-[10px] text-muted-foreground mb-1">Top 贡献者</div>
                        {top3.map((dev, i) => (
                          <div key={dev.name} className="flex items-center justify-between text-[10px] bg-muted/30 rounded px-2 py-0.5 mb-0.5">
                            <span>{["🥇", "🥈", "🥉"][i]} {dev.name}</span>
                            <span className="text-muted-foreground">{dev.commits} commits</span>
                          </div>
                        ))}
                      </div>
                    );
                  } catch { return null; }
                })()}
              </CardContent>
            </Card>
          )}

          {/* Quick Notes removed */}
        </div>

        {/* Right Column */}
        <div className="space-y-3">
          {/* Coverage Board */}
          <Card>
            <CardHeader className="pb-1.5 pt-2 px-3 flex-row items-center justify-between">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-violet-500" /> 团队覆盖率
              </CardTitle>
              <Link to="/sonar" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                单测 <ArrowRight className="h-2.5 w-2.5" />
              </Link>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              {unitBoardData ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1">增量覆盖率</div>
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        {unitBoardData.ynewValue != null && <MiniBlock label="综合" value={`${unitBoardData.ynewValue.toFixed(1)}%`} color="text-primary" />}
                        {unitBoardData.ynewLineValue != null && <MiniBlock label="行" value={`${unitBoardData.ynewLineValue.toFixed(1)}%`} color="text-primary" />}
                        {unitBoardData.ynewBranchValue != null && <MiniBlock label="分支" value={`${unitBoardData.ynewBranchValue.toFixed(1)}%`} color="text-primary" />}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1">全量覆盖率</div>
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        {unitBoardData.yallValue != null && <MiniBlock label="综合" value={`${unitBoardData.yallValue.toFixed(1)}%`} color="text-emerald-600" />}
                        {unitBoardData.yallLineValue != null && <MiniBlock label="行" value={`${unitBoardData.yallLineValue.toFixed(1)}%`} color="text-emerald-600" />}
                        {unitBoardData.yallBranchValue != null && <MiniBlock label="分支" value={`${unitBoardData.yallBranchValue.toFixed(1)}%`} color="text-emerald-600" />}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground text-center py-3">暂无覆盖率数据</p>
              )}
              <div className="flex gap-1.5 mt-2">
                <div className="relative group flex-1">
                  <Link to="/sonar" className="block text-center text-[10px] border rounded px-2 py-1 hover:bg-muted transition-colors">单测覆盖</Link>
                  <Link to="/sonar?tab=settings" title="设置" className="absolute top-0.5 right-0.5 h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                    <Cog className="h-2.5 w-2.5" />
                  </Link>
                </div>
                <div className="relative group flex-1">
                  <Link to="/ai-coverage" className="block text-center text-[10px] border rounded px-2 py-1 hover:bg-muted transition-colors">AI 覆盖</Link>
                  <Link to="/ai-coverage?tab=settings" title="设置" className="absolute top-0.5 right-0.5 h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                    <Cog className="h-2.5 w-2.5" />
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sonar Prompt History */}
          <Card>
            <CardHeader className="pb-1.5 pt-2 px-3 flex-row items-center justify-between">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5 text-emerald-500" /> 单测扫描历史
              </CardTitle>
              <Link to="/sonar" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                生成 <ArrowRight className="h-2.5 w-2.5" />
              </Link>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="grid grid-cols-3 gap-2 text-center mb-2">
                <div className="rounded bg-muted/50 p-1.5"><div className="text-base font-bold">{sonarHistory.length}</div><div className="text-[10px] text-muted-foreground">记录</div></div>
                <div className="rounded bg-muted/50 p-1.5"><div className="text-base font-bold">{sonarHistory.reduce((s, r) => s + r.fileCount, 0)}</div><div className="text-[10px] text-muted-foreground">文件</div></div>
                <div className="rounded bg-muted/50 p-1.5"><div className="text-base font-bold">{sonarTemplates.length}</div><div className="text-[10px] text-muted-foreground">模板</div></div>
              </div>
              {sonarHistory.length > 0 ? (
                <div className="space-y-1">
                  {sonarHistory.slice(0, 3).map(record => (
                    <div key={record.id} className="flex items-center justify-between text-[10px] bg-muted/30 rounded px-2 py-1">
                      <span className="font-medium truncate max-w-[120px]">{record.projectKey}</span>
                      <span className="text-muted-foreground">{record.branch}</span>
                      <span className="text-muted-foreground">{record.fileCount} 文件</span>
                      <span className="text-muted-foreground">{new Date(record.createdAt).toLocaleDateString("zh-CN")}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground text-center py-2">暂无扫描记录</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Sends */}
          <Card>
            <CardHeader className="pb-1.5 pt-2 px-3 flex-row items-center justify-between">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-cyan-500" /> 最近发送
              </CardTitle>
              <Link to="/reminder/history" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                历史 <ArrowRight className="h-2.5 w-2.5" />
              </Link>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              {recentHistory.length > 0 ? (
                <div className="space-y-1">
                  {recentHistory.map(h => (
                    <div key={h.id} className="flex items-center justify-between text-[10px] bg-muted/30 rounded px-2 py-1">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", h.status === "sent" ? "bg-emerald-500" : "bg-destructive")} />
                      <span className="truncate flex-1 mx-1.5">{h.task_name}</span>
                      <span className={cn("shrink-0", h.status === "sent" ? "text-emerald-600" : "text-destructive")}>{h.status === "sent" ? "✓" : "✗"}</span>
                      <span className="text-muted-foreground ml-1.5 shrink-0">{h.executed_at ? new Date(h.executed_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "-"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground text-center py-2">暂无发送记录</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom: All-in-one quick actions */}
      <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-muted/30 rounded-lg border">
        <ActionCard icon={Bell} label="创建提醒" desc="设置定时推送任务" to="/reminder/tasks" />
        <ActionCard icon={GitBranch} label="代码扫描" desc="分析 GitLab 提交" to="/gitlab/overview" />
        <ActionCard icon={FlaskConical} label="生成 Prompt" desc="覆盖率 → 单测提示词" to="/sonar" />
        <ActionCard icon={Brain} label="AI 覆盖率" desc="智能增量覆盖率追踪" to="/ai-coverage" />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, href, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; sub: string; href: string; color: string }) {
  return (
    <Link to={href} className="rounded-md border bg-card p-2 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className={cn("h-2.5 w-2.5", color)} />
        <span className="text-[9px] text-muted-foreground">{label}</span>
      </div>
      <div className="text-sm font-bold">{value}</div>
      <div className="text-[8px] text-muted-foreground">{sub}</div>
    </Link>
  );
}

function MiniBlock({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded bg-muted/50 p-1">
      <div className={cn("text-sm font-bold", color)}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ActionCard({ icon: Icon, label, desc, to }: { icon: React.ComponentType<{ className?: string }>; label: string; desc: string; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 rounded-md border bg-card p-2.5 hover:bg-muted/50 transition-colors group">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted group-hover:bg-background transition-colors">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div>
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">{desc}</div>
      </div>
    </Link>
  );
}

function formatLines(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}
