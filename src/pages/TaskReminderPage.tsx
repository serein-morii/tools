import { useTasks } from "@/lib/query/taskQueries";
import { TaskList } from "@/components/modules/reminder/TaskList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, Search, Bell, BellOff, CheckCircle } from "lucide-react";
import { useState, useMemo } from "react";
import { TaskEditor } from "@/components/modules/reminder/TaskEditor";
import type { Task } from "@/types";

export function TaskReminderPage() {
  const { data: tasks, isLoading, error } = useTasks();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const stats = useMemo(() => {
    if (!tasks) return { total: 0, enabled: 0, disabled: 0 };
    return {
      total: tasks.length,
      enabled: tasks.filter((t: Task) => t.enabled).length,
      disabled: tasks.filter((t: Task) => !t.enabled).length,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    if (!searchQuery.trim()) return tasks;

    const query = searchQuery.toLowerCase();
    return tasks.filter((task: Task) => {
      const nameMatch = task.name.toLowerCase().includes(query);
      const descMatch = task.description?.toLowerCase().includes(query);
      const tagsMatch = (() => {
        try {
          const tags = JSON.parse(task.tags || "[]") as string[];
          return tags.some((tag) => tag.toLowerCase().includes(query));
        } catch {
          return false;
        }
      })();
      return nameMatch || descMatch || tagsMatch;
    });
  }, [tasks, searchQuery]);

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
      <div className="flex items-center justify-between mb-6 gap-4">
        <h2 className="text-2xl font-semibold">任务提醒</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索任务..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-48"
            />
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            新建任务
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Bell className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">总任务</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{stats.enabled}</p>
              <p className="text-sm text-muted-foreground">已启用</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <BellOff className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{stats.disabled}</p>
              <p className="text-sm text-muted-foreground">已暂停</p>
            </div>
          </div>
        </Card>
      </div>

      <TaskList tasks={filteredTasks} onEdit={handleEdit} onCreate={handleCreate} />

      <TaskEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        taskId={editingTaskId}
      />
    </div>
  );
}
