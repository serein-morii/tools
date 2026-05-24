import type { Task } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Bell, BellOff, AlertCircle } from "lucide-react";
import { useToggleTask, useDeleteTask } from "@/lib/query/taskQueries";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface TaskCardProps {
  task: Task;
  onEdit: (id: string) => void;
}

export function TaskCard({ task, onEdit }: TaskCardProps) {
  const toggleMutation = useToggleTask();
  const deleteMutation = useDeleteTask();
  const [isDeleting, setIsDeleting] = useState(false);
  const { t } = useTranslation();

  const reminderTypeLabels: Record<string, string> = {
    simple: t("task.simpleNotification"),
    confirm: t("task.needConfirm"),
    feedback: t("task.needFeedback"),
  };

  const priorityConfig: Record<number, { label: string; color: string; borderColor: string }> = {
    2: { label: t("task.urgentPriority"), color: "text-red-500", borderColor: "border-l-4 border-l-red-500" },
    1: { label: t("task.importantPriority"), color: "text-yellow-500", borderColor: "border-l-4 border-l-yellow-500" },
    0: { label: "", color: "", borderColor: "" },
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
    <Card className={cn("p-4", priorityConfig[task.priority]?.borderColor)}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium truncate">{task.name}</h3>
            <Badge variant={task.enabled ? "default" : "secondary"}>
              {task.enabled ? t("common.enabled") : t("common.disabled")}
            </Badge>
            {task.reminder_type !== "simple" && (
              <Badge variant="outline">
                {reminderTypeLabels[task.reminder_type] || task.reminder_type}
              </Badge>
            )}
            {task.priority > 0 && (
              <Badge variant="outline" className={cn("gap-1", priorityConfig[task.priority]?.color)}>
                <AlertCircle className="h-3 w-3" />
                {priorityConfig[task.priority]?.label}
              </Badge>
            )}
          </div>

          {task.description && (
            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
              {task.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              {task.enabled ? (
                <Bell className="h-3 w-3" />
              ) : (
                <BellOff className="h-3 w-3" />
              )}
              {task.cron_expr}
            </span>
            <span>{t("task.nextRunLabel")}: {formatNextRun(task.next_run_at)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={task.enabled}
            onCheckedChange={handleToggle}
            disabled={toggleMutation.isPending}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(task.id)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            className={isDeleting ? "text-destructive hover:text-destructive" : ""}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}