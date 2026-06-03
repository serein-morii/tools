import { useState, useMemo } from "react";
import { AlertCircle, CheckCircle2, Clock, Clock3, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReminderActionPanel } from "@/components/modules/reminder/ReminderActionPanel";
import { useReminderHistory } from "@/lib/query/reminderQueries";
import type { ReminderHistoryItem } from "@/types";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "sent" | "failed" | "pending";

export function HistoryPage() {
  const { data: history, isLoading, error } = useReminderHistory();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const items = history || [];

  const stats = {
    total: items.length,
    sent: items.filter((item) => item.status === "sent").length,
    failed: items.filter((item) => item.status === "failed").length,
    pending: items.filter((item) => item.status === "pending").length,
  };

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((item) => item.status === statusFilter);
  }, [items, statusFilter]);

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
      <div className="p-5">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-sm text-destructive">{t("history.loadError")}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="border-b px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Clock className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-medium">提醒历史</h1>
              <p className="text-xs text-muted-foreground mt-0.5">查看所有已发递的提醒记录</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] space-y-3 px-3 py-3 animate-in fade-in duration-200">
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-muted/30 rounded-lg border mb-3">
        <StatCard
          title={t("history.all")}
          value={stats.total}
          icon={Clock3}
          color="text-muted-foreground"
          bg="bg-muted/50"
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <StatCard
          title={t("history.success")}
          value={stats.sent}
          icon={CheckCircle2}
          color="text-emerald-600"
          bg="bg-emerald-50 dark:bg-emerald-950/30"
          active={statusFilter === "sent"}
          onClick={() => setStatusFilter("sent")}
        />
        <StatCard
          title={t("history.failed")}
          value={stats.failed}
          icon={AlertCircle}
          color="text-destructive"
          bg="bg-red-50 dark:bg-red-950/30"
          active={statusFilter === "failed"}
          onClick={() => setStatusFilter("failed")}
        />
        <StatCard
          title={t("history.pending")}
          value={stats.pending}
          icon={Clock3}
          color="text-amber-600"
          bg="bg-amber-50 dark:bg-amber-950/30"
          active={statusFilter === "pending"}
          onClick={() => setStatusFilter("pending")}
        />
      </div>

      {filteredItems.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("history.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <HistoryCard key={item.id} item={item} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  bg,
  active,
  onClick,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        bg,
        "cursor-pointer transition-all hover:shadow-md",
        active && "ring-2 ring-primary"
      )}
      onClick={onClick}
    >
      <CardContent className="p-2">
        <div className="flex items-center gap-1 mb-0.5">
          <Icon className={`h-3 w-3 ${color}`} />
          <span className="text-[9px] text-muted-foreground">{title}</span>
        </div>
        <span className={`text-sm font-bold ${color}`}>{value}</span>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ item }: { item: ReminderHistoryItem }) {
  const { t } = useTranslation();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-1.5 pt-2 px-3 bg-muted/30 border-b">
        <div>
          <CardTitle className="text-xs">{item.task_name}</CardTitle>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{t("history.taskId")}: {item.task_id}</div>
        </div>
        <StatusBadge status={item.status} />
      </CardHeader>
      <CardContent className="p-2.5 space-y-1.5 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TimeRow label={t("history.scheduledTime")} value={item.scheduled_at} />
          <TimeRow label={t("history.executedTime")} value={item.executed_at} />
        </div>
        <div className="rounded-lg bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
          {summarizeChannelResults(item.channel_results, t)}
        </div>
        {item.error_message && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] text-destructive">
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