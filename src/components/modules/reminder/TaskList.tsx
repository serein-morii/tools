import type { Task } from "@/types";
import { TaskCard } from "./TaskCard";
import { useTranslation } from "react-i18next";
import { BellOff, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TaskListProps {
  tasks: Task[];
  onEdit: (id: string) => void;
  onCreate?: () => void;
}

export function TaskList({ tasks, onEdit, onCreate }: TaskListProps) {
  const { t } = useTranslation();

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 mb-4">
          <BellOff className="h-7 w-7 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">{t("task.emptyList")}</p>
        <p className="text-xs text-muted-foreground mb-4">{t("task.emptyHint")}</p>
        {onCreate && (
          <Button onClick={onCreate} variant="outline" size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            {t("task.newTask")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} onEdit={onEdit} />
      ))}
    </div>
  );
}