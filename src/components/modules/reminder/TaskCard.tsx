import type { Task } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { useToggleTask, useDeleteTask } from "@/lib/query/taskQueries";
import { useState, useMemo } from "react";

interface TaskCardProps {
  task: Task;
  onEdit: (id: string) => void;
}

const reminderTypeLabels: Record<string, string> = {
  simple: "简单通知",
  confirm: "需要确认",
  feedback: "需要反馈",
};

export function TaskCard({ task, onEdit }: TaskCardProps) {
  const toggleMutation = useToggleTask();
  const deleteMutation = useDeleteTask();
  const [isDeleting, setIsDeleting] = useState(false);

  const tags = useMemo(() => {
    try {
      return JSON.parse(task.tags || "[]") as string[];
    } catch {
      return [];
    }
  }, [task.tags]);

  const handleToggle = () => {
    toggleMutation.mutate(
      { id: task.id, enabled: !task.enabled },
      {
        onSuccess: () => {
          toast.success(task.enabled ? "任务已暂停" : "任务已启用");
        },
        onError: (error) => {
          toast.error("操作失败: " + error.message);
        }
      }
    );
  };

  const handleDelete = () => {
    if (isDeleting) {
      deleteMutation.mutate(task.id, {
        onSuccess: () => {
          toast.success("任务已删除");
          setIsDeleting(false);
        },
        onError: (error) => {
          toast.error("删除失败: " + error.message);
        }
      });
    } else {
      setIsDeleting(true);
      setTimeout(() => setIsDeleting(false), 3000);
    }
  };

  const formatNextRun = (timestamp?: number) => {
    if (!timestamp) return "未安排";
    const date = new Date(timestamp);
    return date.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card className={`p-4 ${task.priority === 2 ? 'border-l-4 border-l-red-500' : task.priority === 1 ? 'border-l-4 border-l-yellow-500' : ''}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium truncate">{task.name}</h3>
            {task.priority === 2 && (
              <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">紧急</span>
            )}
            {task.priority === 1 && (
              <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded font-medium">重要</span>
            )}
            <Badge variant={task.enabled ? "default" : "secondary"}>
              {task.enabled ? "启用" : "禁用"}
            </Badge>
            {task.reminder_type !== "simple" && (
              <Badge variant="outline">
                {reminderTypeLabels[task.reminder_type] || task.reminder_type}
              </Badge>
            )}
          </div>

          {task.description && (
            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
              {task.description}
            </p>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="text-xs px-1.5 py-0.5 bg-muted rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
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
            <span>下次: {formatNextRun(task.next_run_at)}</span>
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
            title="编辑"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant={isDeleting ? "destructive" : "ghost"}
            size="icon"
            onClick={handleDelete}
            title={isDeleting ? "再次点击确认删除" : "删除"}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}