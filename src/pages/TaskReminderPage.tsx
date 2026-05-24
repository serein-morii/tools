import { useTasks } from "@/lib/query/taskQueries";
import { TaskList } from "@/components/modules/reminder/TaskList";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { TaskEditor } from "@/components/modules/reminder/TaskEditor";

export function TaskReminderPage() {
  const { data: tasks, isLoading, error } = useTasks();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const handleCreate = () => {
    setEditingTaskId(null);
    setEditorOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingTaskId(id);
    setEditorOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive">加载失败</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">任务提醒</h2>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          新建任务
        </Button>
      </div>

      <TaskList tasks={tasks || []} onEdit={handleEdit} />

      <TaskEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        taskId={editingTaskId}
      />
    </div>
  );
}