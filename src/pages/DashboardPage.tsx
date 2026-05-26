import { useTasks } from "@/lib/query/taskQueries";
import { useChannels } from "@/lib/query/channelQueries";
import { useTemplates } from "@/lib/query/templateQueries";
import { useReminderHistory } from "@/lib/query/reminderQueries";
import { Card } from "@/components/ui/card";
import { Bell, Radio, FileText, CheckCircle2, AlertCircle, Clock3, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatCronDescription } from "@/lib/cron";
import type { CronConfig } from "@/types";

export function DashboardPage() {
  const { data: tasks, isLoading: tasksLoading, error: tasksError } = useTasks();
  const { data: channels, isLoading: channelsLoading, error: channelsError } = useChannels();
  const { data: templates, isLoading: templatesLoading, error: templatesError } = useTemplates();
  const { data: history, isLoading: historyLoading, error: historyError } = useReminderHistory();
  const { t } = useTranslation();

  const isLoading = tasksLoading || channelsLoading || templatesLoading || historyLoading;
  const error = tasksError || channelsError || templatesError || historyError;

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

  // Get upcoming tasks (next 7 days)
  const now = Date.now();
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
  const upcomingTasks = (tasks || [])
    .filter((t) => t.enabled && t.next_run_at && t.next_run_at <= weekAhead)
    .sort((a, b) => (a.next_run_at || 0) - (b.next_run_at || 0))
    .slice(0, 5);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md">
          <TrendingUp className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{t("dashboard.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.description")}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          Icon={Bell}
          label={t("nav.tasks")}
          value={activeTasks}
          subtext={`${t("common.enabled")} / ${totalTasks}`}
          color="violet"
        />
        <StatCard
          Icon={Radio}
          label={t("nav.channels")}
          value={activeChannels}
          subtext={`${t("common.enabled")} / ${totalChannels}`}
          color="blue"
        />
        <StatCard
          Icon={FileText}
          label={t("nav.templates")}
          value={totalTemplates}
          subtext={t("dashboard.available")}
          color="amber"
        />
        <StatCard
          Icon={CheckCircle2}
          label={t("dashboard.successRate")}
          value={historyItems.length > 0 ? Math.round((successCount / historyItems.length) * 100) : 0}
          subtext={`%`}
          color="green"
          isPercent
        />
      </div>

      {/* History Stats */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card className="bg-green-50 dark:bg-green-950/30 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <div className="text-sm text-muted-foreground">{t("history.success")}</div>
              <div className="text-2xl font-bold text-green-600">{successCount}</div>
            </div>
          </div>
        </Card>
        <Card className="bg-red-50 dark:bg-red-950/30 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <div>
              <div className="text-sm text-muted-foreground">{t("history.failed")}</div>
              <div className="text-2xl font-bold text-red-600">{failedCount}</div>
            </div>
          </div>
        </Card>
        <Card className="bg-amber-50 dark:bg-amber-950/30 p-4">
          <div className="flex items-center gap-3">
            <Clock3 className="h-5 w-5 text-amber-600" />
            <div>
              <div className="text-sm text-muted-foreground">{t("history.pending")}</div>
              <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Upcoming Tasks */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-muted-foreground" />
          {t("dashboard.upcoming")}
        </h3>
        {upcomingTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t("dashboard.noUpcoming")}
          </p>
        ) : (
          <div className="space-y-3">
            {upcomingTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
                    <Bell className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <div className="font-medium">{task.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(() => {
                        try {
                          const config = JSON.parse(task.cron_config) as CronConfig;
                          return formatCronDescription(config, t);
                        } catch {
                          return task.cron_config;
                        }
                      })()}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {task.next_run_at
                    ? new Date(task.next_run_at).toLocaleDateString()
                    : t("task.notScheduled")}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  Icon,
  label,
  value,
  subtext,
  color,
  isPercent,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  subtext: string;
  color: "violet" | "blue" | "amber" | "green";
  isPercent?: boolean;
}) {
  const colorClasses = {
    violet: "from-violet-500 to-purple-600",
    blue: "from-blue-500 to-cyan-600",
    amber: "from-amber-500 to-orange-600",
    green: "from-green-500 to-emerald-600",
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm", colorClasses[color])}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">
            {isPercent ? `${value}%` : value}
          </div>
          <div className="text-xs text-muted-foreground">{subtext}</div>
        </div>
      </div>
    </Card>
  );
}