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
  Zap, TrendingUp, Calendar, Clock
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { UnitBoardData, DeveloperStat } from "@/types";
import { cn } from "@/lib/utils";
import { useWalkinAuth } from "@/components/modules/gitlab/WalkinAuthManager";

const quickLinks = [
  { to: "/reminder/tasks", icon: Bell, label: "提醒任务", color: "text-amber-500", bg: "bg-amber-500/10" },
  { to: "/reminder/channels", icon: Radio, label: "通知渠道", color: "text-blue-500", bg: "bg-blue-500/10" },
  { to: "/reminder/templates", icon: FileCode, label: "消息模板", color: "text-violet-500", bg: "bg-violet-500/10" },
  { to: "/reminder/history", icon: History, label: "发送历史", color: "text-cyan-500", bg: "bg-cyan-500/10" },
  { to: "/gitlab/overview", icon: GitBranch, label: "Git 扫描", color: "text-orange-500", bg: "bg-orange-500/10" },
  { to: "/gitlab/settings", icon: Settings, label: "Git 配置", color: "text-slate-500", bg: "bg-slate-500/10" },
  { to: "/sonar", icon: FlaskConical, label: "单测覆盖率", color: "text-emerald-500", bg: "bg-emerald-500/10", settingsTo: "/sonar?tab=settings" },
  { to: "/ai-coverage", icon: Brain, label: "AI生成率", color: "text-indigo-500", bg: "bg-indigo-500/10", settingsTo: "/ai-coverage?tab=settings" },
  { to: "/settings", icon: Settings, label: "系统设置", color: "text-muted-foreground", bg: "bg-muted" },
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

  // Get greeting based on time
  const getGreeting = () => {
    const h = currentTime.getHours();
    if (h < 6) return { text: "夜深了，注意休息", icon: "🌙" };
    if (h < 9) return { text: "早安，开始新的一天", icon: "☀️" };
    if (h < 12) return { text: "上午好", icon: "🌤️" };
    if (h < 14) return { text: "午安", icon: "🌞" };
    if (h < 18) return { text: "下午好", icon: "🌤️" };
    if (h < 22) return { text: "晚上好", icon: "🌙" };
    return { text: "夜深了，注意休息", icon: "🌙" };
  };

  const greeting = getGreeting();

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <LayoutGrid className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">概览</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="section-spacing animate-in fade-in duration-200">
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 px-5 py-4">
          <div className="absolute top-4 right-4 text-3xl opacity-20 select-none">
            {greeting.icon}
          </div>
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/25">
                <LayoutGrid className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {isLoggedIn && userName ? userName : t("dashboard.welcome")}
                  </h2>
                  <span className="text-sm text-muted-foreground font-normal">
                    {greeting.text}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {currentTime.toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 flex-wrap justify-end">
                <span className="status-badge bg-emerald-500/10 text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Sonar {sonarHistory.length}
                </span>
                {gitlabConfigured && (
                  <span className="status-badge bg-orange-500/10 text-orange-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                    Git {gitlabProjects}
                  </span>
                )}
                <span className={cn("status-badge", isLoggedIn ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", isLoggedIn ? "bg-emerald-500" : "bg-muted-foreground")} />
                  {isLoggedIn ? "Walkin 在线" : "Walkin 离线"}
                </span>
              </div>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="btn-modern h-8 rounded-lg bg-muted px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors shrink-0"
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                刷新
              </button>
            </div>
          </div>
        </div>

        {/* Quick Links - Bento Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
          {quickLinks.map(link => (
            <div key={link.to} className="relative group">
              <Link
                to={link.to}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-card px-3 py-3 transition-all duration-200 hover:border-primary/30 hover:shadow-md hover:scale-[1.02]"
              >
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", link.bg)}>
                  <link.icon className={cn("h-4.5 w-4.5", link.color)} />
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-foreground leading-tight text-center font-medium">{link.label}</span>
              </Link>
              {"settingsTo" in link && link.settingsTo && (
                <Link
                  to={link.settingsTo}
                  title="设置"
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-1 right-1 h-5 w-5 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Cog className="h-3 w-3" />
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard icon={Bell} label="活跃任务" value={activeTasks} sub={`共 ${taskList.length}`} href="/reminder/tasks" color="text-amber-500" bg="bg-amber-500/10" />
          <StatCard icon={Radio} label="通知渠道" value={activeChannels} sub={`共 ${channelList.length}`} href="/reminder/channels" color="text-blue-500" bg="bg-blue-500/10" />
          <StatCard icon={CheckCircle2} label="发送成功" value={successCount} sub={`${successRate}%`} href="/reminder/history" color="text-emerald-500" bg="bg-emerald-500/10" />
          <StatCard icon={FlaskConical} label="扫描记录" value={sonarHistory.length} sub={`${sonarHistory.reduce((s, r) => s + r.fileCount, 0)} 文件`} href="/sonar" color="text-cyan-500" bg="bg-cyan-500/10" />
          <StatCard icon={GitBranch} label="变更项目" value={gitlabConfigured ? gitlabProjects : "-"} sub={gitlabConfigured ? `${gitlabCommits} commits` : "未配置"} href="/gitlab/overview" color="text-orange-500" bg="bg-orange-500/10" />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Reminder Status */}
            <Card className="card-modern">
              <CardHeader className="pb-2 pt-3 px-4 flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 font-semibold">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
                    <Bell className="h-4 w-4 text-amber-500" />
                  </div>
                  智能提醒
                </CardTitle>
                <Link to="/reminder/tasks" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  全部 <ArrowRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-3">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <div className="text-xl font-bold tabular-nums">{taskList.length}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">任务</div>
                  </div>
                  <div className="rounded-lg bg-emerald-500/10 p-2.5">
                    <div className="text-xl font-bold text-emerald-600 tabular-nums">{activeTasks}</div>
                    <div className="text-xs text-emerald-600/70 mt-0.5">已启用</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <div className="text-xl font-bold tabular-nums">{channelList.length}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">渠道</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <div className="text-xl font-bold tabular-nums">{totalTemplates}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">模板</div>
                  </div>
                </div>
                {upcomingTasks.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                      <Calendar className="h-3.5 w-3.5" />
                      未来 7 天
                    </div>
                    <div className="space-y-1.5">
                      {upcomingTasks.slice(0, 4).map(task => (
                        <div key={task.id} className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50">
                          <span className="truncate font-medium">{task.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0 ml-2 tabular-nums">
                            {task.next_run_at ? new Date(task.next_run_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : "-"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Link to="/reminder/tasks" className="flex-1 text-center text-xs border rounded-lg px-3 py-2 hover:bg-muted transition-colors font-medium">管理任务</Link>
                  <Link to="/reminder/channels" className="flex-1 text-center text-xs border rounded-lg px-3 py-2 hover:bg-muted transition-colors font-medium">管理渠道</Link>
                  <Link to="/reminder/templates" className="flex-1 text-center text-xs border rounded-lg px-3 py-2 hover:bg-muted transition-colors font-medium">管理模板</Link>
                </div>
              </CardContent>
            </Card>

            {/* Code Scan Summary */}
            {gitlabConfigured && latestScan && (
              <Card className="card-modern">
                <CardHeader className="pb-2 pt-3 px-4 flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2 font-semibold">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10">
                      <GitBranch className="h-4 w-4 text-orange-500" />
                    </div>
                    代码扫描
                  </CardTitle>
                  <Link to="/gitlab/overview" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                    详情 <ArrowRight className="h-3 w-3" />
                  </Link>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    最近扫描: {new Date(latestScan.scan_at).toLocaleString("zh-CN")}
                  </div>
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
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                            <TrendingUp className="h-3.5 w-3.5" />
                            Top 贡献者
                          </div>
                          {top3.map((dev, i) => (
                            <div key={dev.name} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-1.5 mb-1 transition-colors hover:bg-muted/50">
                              <span className="flex items-center gap-2">
                                <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold",
                                  i === 0 ? "bg-yellow-500/20 text-yellow-600" :
                                  i === 1 ? "bg-slate-300/30 text-slate-600" :
                                  "bg-amber-600/20 text-amber-700"
                                )}>
                                  {i + 1}
                                </span>
                                {dev.name}
                              </span>
                              <span className="text-muted-foreground tabular-nums">{dev.commits} commits</span>
                            </div>
                          ))}
                        </div>
                      );
                    } catch { return null; }
                  })()}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Coverage Board */}
            <Card className="card-modern">
              <CardHeader className="pb-2 pt-3 px-4 flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 font-semibold">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10">
                    <BarChart3 className="h-4 w-4 text-violet-500" />
                  </div>
                  团队覆盖率
                </CardTitle>
                <Link to="/sonar" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  单测 <ArrowRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                {unitBoardData ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                          <Zap className="h-3.5 w-3.5" />
                          增量覆盖率
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-center">
                          {unitBoardData.ynewValue != null && <MiniBlock label="综合" value={`${unitBoardData.ynewValue.toFixed(1)}%`} color="text-primary" />}
                          {unitBoardData.ynewLineValue != null && <MiniBlock label="行" value={`${unitBoardData.ynewLineValue.toFixed(1)}%`} color="text-primary" />}
                          {unitBoardData.ynewBranchValue != null && <MiniBlock label="分支" value={`${unitBoardData.ynewBranchValue.toFixed(1)}%`} color="text-primary" />}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          全量覆盖率
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-center">
                          {unitBoardData.yallValue != null && <MiniBlock label="综合" value={`${unitBoardData.yallValue.toFixed(1)}%`} color="text-emerald-600" />}
                          {unitBoardData.yallLineValue != null && <MiniBlock label="行" value={`${unitBoardData.yallLineValue.toFixed(1)}%`} color="text-emerald-600" />}
                          {unitBoardData.yallBranchValue != null && <MiniBlock label="分支" value={`${unitBoardData.yallBranchValue.toFixed(1)}%`} color="text-emerald-600" />}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">暂无覆盖率数据</p>
                )}
                <div className="flex gap-2 mt-3">
                  <div className="relative group flex-1">
                    <Link to="/sonar" className="block text-center text-xs border rounded-lg px-3 py-2 hover:bg-muted transition-colors font-medium">单测覆盖</Link>
                    <Link to="/sonar?tab=settings" title="设置" className="absolute top-1 right-1 h-5 w-5 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      <Cog className="h-3 w-3" />
                    </Link>
                  </div>
                  <div className="relative group flex-1">
                    <Link to="/ai-coverage" className="block text-center text-xs border rounded-lg px-3 py-2 hover:bg-muted transition-colors font-medium">AI 覆盖</Link>
                    <Link to="/ai-coverage?tab=settings" title="设置" className="absolute top-1 right-1 h-5 w-5 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      <Cog className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sonar Prompt History */}
            <Card className="card-modern">
              <CardHeader className="pb-2 pt-3 px-4 flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 font-semibold">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
                    <FlaskConical className="h-4 w-4 text-emerald-500" />
                  </div>
                  单测扫描历史
                </CardTitle>
                <Link to="/sonar" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  生成 <ArrowRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <div className="text-xl font-bold tabular-nums">{sonarHistory.length}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">记录</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <div className="text-xl font-bold tabular-nums">{sonarHistory.reduce((s, r) => s + r.fileCount, 0)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">文件</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <div className="text-xl font-bold tabular-nums">{sonarTemplates.length}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">模板</div>
                  </div>
                </div>
                {sonarHistory.length > 0 ? (
                  <div className="space-y-1.5">
                    {sonarHistory.slice(0, 3).map(record => (
                      <div key={record.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50">
                        <span className="font-medium truncate max-w-[140px]">{record.projectKey}</span>
                        <span className="text-muted-foreground">{record.branch}</span>
                        <span className="text-muted-foreground tabular-nums">{record.fileCount} 文件</span>
                        <span className="text-muted-foreground tabular-nums">{new Date(record.createdAt).toLocaleDateString("zh-CN")}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-3">暂无扫描记录</p>
                )}
              </CardContent>
            </Card>

            {/* Recent Sends */}
            <Card className="card-modern">
              <CardHeader className="pb-2 pt-3 px-4 flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 font-semibold">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10">
                    <MessageSquare className="h-4 w-4 text-cyan-500" />
                  </div>
                  最近发送
                </CardTitle>
                <Link to="/reminder/history" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  历史 <ArrowRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                {recentHistory.length > 0 ? (
                  <div className="space-y-1.5">
                    {recentHistory.map(h => (
                      <div key={h.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", h.status === "sent" ? "bg-emerald-500" : "bg-destructive")} />
                        <span className="truncate flex-1 mx-2 font-medium">{h.task_name}</span>
                        <span className={cn("shrink-0", h.status === "sent" ? "text-emerald-600" : "text-destructive")}>{h.status === "sent" ? "✓" : "✗"}</span>
                        <span className="text-muted-foreground ml-2 shrink-0 tabular-nums">{h.executed_at ? new Date(h.executed_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "-"}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-3">暂无发送记录</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bottom: Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ActionCard icon={Bell} label="创建提醒" desc="设置定时推送任务" to="/reminder/tasks" color="text-amber-500" bg="bg-amber-500/10" />
          <ActionCard icon={GitBranch} label="代码扫描" desc="分析 GitLab 提交" to="/gitlab/overview" color="text-orange-500" bg="bg-orange-500/10" />
          <ActionCard icon={FlaskConical} label="生成 Prompt" desc="覆盖率 → 单测提示词" to="/sonar" color="text-emerald-500" bg="bg-emerald-500/10" />
          <ActionCard icon={Brain} label="AI 覆盖率" desc="智能增量覆盖率追踪" to="/ai-coverage" color="text-indigo-500" bg="bg-indigo-500/10" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, href, color, bg }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub: string;
  href: string;
  color: string;
  bg: string;
}) {
  return (
    <Link to={href} className="stat-card group">
      <div className="flex items-center gap-2 mb-1">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", bg)}>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </Link>
  );
}

function MiniBlock({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2">
      <div className={cn("text-lg font-bold tabular-nums", color)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function ActionCard({ icon: Icon, label, desc, to, color, bg }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  to: string;
  color: string;
  bg: string;
}) {
  return (
    <Link to={to} className="stat-card group flex items-center gap-3">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", bg)}>
        <Icon className={cn("h-5 w-5", color)} />
      </div>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
    </Link>
  );
}

function formatLines(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}