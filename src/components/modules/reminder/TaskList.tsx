import type { Task } from "@/types";
import { TaskCard } from "./TaskCard";
import { useTranslation } from "react-i18next";

interface TaskListProps {
  tasks: Task[];
  onEdit: (id: string) => void;
}

export function TaskList({ tasks, onEdit }: TaskListProps) {
  const { t } = useTranslation();

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-2">{t("task.emptyList")}</p>
        <p className="text-sm text-muted-foreground">{t("task.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} onEdit={onEdit} />
      ))}
    </div>
  );
}