import type { Task } from "@/types";
import { TaskCard } from "./TaskCard";

interface TaskListProps {
  tasks: Task[];
  onEdit: (id: string) => void;
}

export function TaskList({ tasks, onEdit }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-2">暂无任务</p>
        <p className="text-sm text-muted-foreground">点击右上角「新建任务」创建第一个提醒</p>
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