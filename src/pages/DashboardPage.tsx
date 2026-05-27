import { useTasks } from "@/lib/query/taskQueries";
import { useChannels } from "@/lib/query/channelQueries";
import { useTemplates } from "@/lib/query/templateQueries";
import { useReminderHistory } from "@/lib/query/reminderQueries";
import { useGitLabScanHistory, useGitLabConfigured } from "@/lib/query/gitlabQueries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Radio, CheckCircle2, AlertCircle, Clock3, GitBranch, GitCommit, Users, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function DashboardPage() {
  const { data: tasks, isLoading: tasksLoading, error: tasksError } = useTasks();
  const { data: channels, isLoading: channelsLoading, error: channelsError } = useChannels();
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const { data: history, isLoading: historyLoading, error: historyError } = useReminderHistory();
  const { data: gitlabHistory, isLoading: gitlabLoading } = useGitLabScanHistory(5);
  const { data: gitlabConfigured } = useGitLabConfigured();
  const { t } = useTranslation();

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
          {t("common.error")}
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
  const gitlabCoverage = latestScan && latestScan.total_projects > 0
    ? Math.round((latestScan.test_projects / latestScan.total_projects) * 100)
    : 0;
  const noTestProjects = latestScan ? latestScan.total_projects - latestScan.test_projects : 0;

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
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{t("dashboard.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("dashboard.description")}</p>
        </div>
      </div>

      {/* Module: 提醒任务 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              提醒任务
            </div>
            <Link to="/reminder/tasks" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              查看全部 →
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <MiniStat label="任务总数" value={totalTasks} />
            <MiniStat label="已启用" value={activeTasks} />
            <MiniStat label="消息模板" value={totalTemplates} />
          </div>

          {upcomingTasks.length > 0 && (
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground mb-2">近7天待执行</div>
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
            <p className="text-xs text-muted-foreground text-center py-2">暂无待执行任务</p>
          )}
        </CardContent>
      </Card>

      {/* Module: 通知渠道 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-muted-foreground" />
              通知渠道
            </div>
            <Link to="/reminder/channels" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              查看全部 →
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <MiniStat label="渠道总数" value={totalChannels} />
              <MiniStat label="已启用" value={activeChannels} />
            </div>
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">推送统计</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  <span className="font-medium">{successCount}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                  <span className="font-medium">{failedCount}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Clock3 className="h-3.5 w-3.5 text-yellow-500" />
                  <span className="font-medium">{pendingCount}</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                成功率 <span className="font-medium text-foreground">{successRate}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Module: GitLab 代码扫描 */}
      {gitlabConfigured && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                GitLab 代码扫描
              </div>
              <div className="flex items-center gap-3">
                {latestScan && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(latestScan.scan_at).toLocaleDateString("zh-CN")}
                  </span>
                )}
                <Link to="/gitlab/overview" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  查看详情 →
                </Link>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <MiniStat icon={GitBranch} label="变更项目" value={gitlabProjects} />
              <MiniStat icon={GitCommit} label="提交次数" value={gitlabCommits} />
              <MiniStat icon={Users} label="参与人数" value={gitlabContributors} />
              <MiniStat icon={CheckCircle2} label="单测覆盖" value={`${gitlabCoverage}%`} />
              <MiniStat icon={AlertCircle} label="无单测项目" value={noTestProjects} />
            </div>
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
        <div className="flex h-7 w-7 items-center justify-center rounded bg-muted">
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
