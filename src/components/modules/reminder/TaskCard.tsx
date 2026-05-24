import type { Task, CronConfig } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Bell, BellOff, AlertCircle, Clock, Send } from "lucide-react";
import { useToggleTask, useDeleteTask, useTestTask } from "@/lib/query/taskQueries";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { formatCronDescription } from "@/lib/cron";
import { toast } from "sonner";

// Parse cron_config and return human-readable description
function getCronDescription(cronConfigStr: string, t?: (key: string) => string): string {
  try {
    const config = JSON.parse(cronConfigStr) as CronConfig;
    return formatCronDescription(config, t);
  } catch {
    return cronConfigStr || "自定义时间";
  }
}

interface TaskCardProps {
  task: Task;
  onEdit: (id: string) => void;
}

export function TaskCard({ task, onEdit }: TaskCardProps) {
  const toggleMutation = useToggleTask();
  const deleteMutation = useDeleteTask();
  const testMutation = useTestTask();
  const [isDeleting, setIsDeleting] = useState(false);
  const { t } = useTranslation();

  const reminderTypeLabels: Record<string, string> = {
    simple: t("task.simpleNotification"),
    confirm: t("task.needConfirm"),
    feedback: t("task.needFeedback"),
  };

  const priorityConfig: Record<number, { label: string; color: string; bgClass: string }> = {
    2: { label: t("task.urgentPriority"), color: "text-red-600", bgClass: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800" },
    1: { label: t("task.importantPriority"), color: "text-amber-600", bgClass: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800" },
    0: { label: "", color: "", bgClass: "" },
  };

  const handleToggle = () => {
    toggleMutation.mutate({ id: task.id, enabled: !task.enabled });
  };

  const handleDelete = () => {
    if (isDeleting) {
      deleteMutation.mutate(task.id);
      setIsDeleting(false);
    } else {
      setIsDeleting(true);
      setTimeout(() => setIsDeleting(false), 3000);
    }
  };

  const handleTest = () => {
    testMutation.mutate(task.id, {
      onSuccess: () => {
        toast.success(t("channel.testSuccess"));
      },
      onError: (error) => {
        toast.error(`${t("channel.testFailed")}: ${error}`);
      },
    });
  };

  const formatNextRun = (timestamp?: number) => {
    if (!timestamp) return t("task.notScheduled");
    const date = new Date(timestamp);
    return date.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-200 hover:shadow-md",
        !task.enabled && "opacity-60",
        priorityConfig[task.priority]?.bgClass
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
              task.enabled
                ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm"
                : "bg-muted text-muted-foreground"
            )}
          >
            {task.enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-medium text-foreground truncate">{task.name}</h3>
              {task.priority > 0 && (
                <Badge variant="outline" className={cn("gap-1 text-xs", priorityConfig[task.priority]?.color)}>
                  <AlertCircle className="h-3 w-3" />
                  {priorityConfig[task.priority]?.label}
                </Badge>
              )}
              {task.reminder_type !== "simple" && (
                <Badge variant="secondary" className="text-xs">
                  {reminderTypeLabels[task.reminder_type] || task.reminder_type}
                </Badge>
              )}
            </div>

            {task.description && (
              <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
                {task.description}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                {getCronDescription(task.cron_config, t)}
              </span>
              <span className="flex items-center gap-1.5">
                {t("task.nextRunLabel")}: {formatNextRun(task.next_run_at)}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleTest}
              disabled={testMutation.isPending}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              title={t("channel.testChannel")}
            >
              <Send className={cn("h-4 w-4", testMutation.isPending && "animate-pulse")} />
            </Button>
            <Switch
              checked={task.enabled}
              onCheckedChange={handleToggle}
              disabled={toggleMutation.isPending}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(task.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              className={cn(
                "opacity-0 group-hover:opacity-100 transition-opacity",
                isDeleting && "opacity-100 text-destructive hover:text-destructive"
              )}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}