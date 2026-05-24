import { AlertCircle, CheckCircle2, Clock3, Loader2 } from "lucide-react";
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
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("history.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-sm text-destructive">{t("history.loadError")}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard title={t("history.all")} value={stats.total} />
        <StatCard title={t("history.success")} value={stats.sent} tone="success" />
        <StatCard title={t("history.failed")} value={stats.failed} tone="danger" />
        <StatCard title={t("history.pending")} value={stats.pending} tone="muted" />
      </div>

      {items.length === 0 ? (
        <Card>
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
  tone = "default",
}: {
  title: string;
  value: number;
  tone?: "default" | "success" | "danger" | "muted";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-green-600",
    danger: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ item }: { item: ReminderHistoryItem }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{item.task_name}</CardTitle>
          <div className="mt-1 text-xs text-muted-foreground">{t("history.taskId")}: {item.task_id}</div>
        </div>
        <StatusBadge status={item.status} />
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <TimeRow label={t("history.scheduledTime")} value={item.scheduled_at} />
          <TimeRow label={t("history.executedTime")} value={item.executed_at} />
        </div>
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          {summarizeChannelResults(item.channel_results, t)}
        </div>
        {item.error_message && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
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
      <Badge className="bg-green-600 hover:bg-green-600">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        {t("history.success")}
      </Badge>
    );
  }

  if (status === "failed") {
    return <Badge variant="destructive">{t("history.failed")}</Badge>;
  }

  return (
    <Badge variant="secondary">
      <Clock3 className="mr-1 h-3 w-3" />
      {t("history.pending")}
    </Badge>
  );
}

function TimeRow({ label, value }: { label: string; value?: number | null }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span>{value ? new Date(value).toLocaleString() : "-"}</span>
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
