import type { Task } from "@/types";
import { Button } from "@/components/ui/button";
import { BellPlus } from "lucide-react";
import { TaskCard } from "./TaskCard";

interface TaskListProps {
  tasks: Task[];
  onEdit: (id: string) => void;
  onCreate?: () => void;
}

export function TaskList({ tasks, onEdit, onCreate }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <BellPlus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-2">暂无任务</p>
        {onCreate && (
          <Button onClick={onCreate} className="mt-4">
            创建第一个提醒
          </Button>
        )}
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