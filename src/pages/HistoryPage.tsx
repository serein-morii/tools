import { AlertCircle, CheckCircle2, Clock3, Loader2, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReminderActionPanel } from "@/components/modules/reminder/ReminderActionPanel";
import { useReminderHistory } from "@/lib/query/reminderQueries";
import type { ReminderHistoryItem } from "@/types";
import { useTranslation } from "react-i18next";

export function HistoryPage() {
  const { data: history, isLoading, error } = useReminderHistory();
  const { t } = useTranslation();
  const items = history || [];

  const stats = {
    total: items.length,
    sent: items.filter((item) => item.status === "sent").length,
    failed: items.filter((item) => item.status === "failed").length,
    pending: items.filter((item) => item.status === "pending").length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("history.loading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-sm text-destructive">{t("history.loadError")}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md">
          <History className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{t("history.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {items.length === 0 ? t("history.empty") : `${items.length} ${t("history.title").toLowerCase()}`}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          title={t("history.all")}
          value={stats.total}
          icon={Clock3}
          color="text-muted-foreground"
          bg="bg-muted/50"
        />
        <StatCard
          title={t("history.success")}
          value={stats.sent}
          icon={CheckCircle2}
          color="text-green-600"
          bg="bg-green-50 dark:bg-green-950/30"
        />
        <StatCard
          title={t("history.failed")}
          value={stats.failed}
          icon={AlertCircle}
          color="text-red-600"
          bg="bg-red-50 dark:bg-red-950/30"
        />
        <StatCard
          title={t("history.pending")}
          value={stats.pending}
          icon={Clock3}
          color="text-amber-600"
          bg="bg-amber-50 dark:bg-amber-950/30"
        />
      </div>

      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("history.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <HistoryCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  bg,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}) {
  return (
    <Card className={bg}>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="text-sm text-muted-foreground">{title}</span>
        </div>
        <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ item }: { item: ReminderHistoryItem }) {
  const { t } = useTranslation();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3 bg-muted/30 border-b">
        <div>
          <CardTitle className="text-base">{item.task_name}</CardTitle>
          <div className="mt-1 text-xs text-muted-foreground">{t("history.taskId")}: {item.task_id}</div>
        </div>
        <StatusBadge status={item.status} />
      </CardHeader>
      <CardContent className="p-4 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <TimeRow label={t("history.scheduledTime")} value={item.scheduled_at} />
          <TimeRow label={t("history.executedTime")} value={item.executed_at} />
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          {summarizeChannelResults(item.channel_results, t)}
        </div>
        {item.error_message && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{item.error_message}</span>
          </div>
        )}
        <ReminderActionPanel item={item} />
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();

  if (status === "sent") {
    return (
      <Badge className="bg-green-600 hover:bg-green-600 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {t("history.success")}
      </Badge>
    );
  }

  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        {t("history.failed")}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1">
      <Clock3 className="h-3 w-3" />
      {t("history.pending")}
    </Badge>
  );
}

function TimeRow({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-mono text-xs">{value ? new Date(value).toLocaleString() : "-"}</span>
    </div>
  );
}

function summarizeChannelResults(raw: string, t: (key: string) => string) {
  try {
    const results = JSON.parse(raw) as Array<{
      channel_name?: string;
      success?: boolean;
      message?: string;
    }>;

    if (results.length === 0) {
      return t("history.noChannelResult");
    }

    return results
      .map((result) => {
        const name = result.channel_name || t("history.unknownChannel");
        const status = result.success ? t("history.success") : t("history.failed");
        const message = result.message ? `：${result.message}` : "";
        return `${name} ${status}${message}`;
      })
      .join("；");
  } catch {
    return raw || t("history.noChannelResult");
  }
}