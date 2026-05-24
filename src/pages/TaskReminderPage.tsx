import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { TaskList } from "@/components/modules/reminder/TaskList";
import { TaskEditor } from "@/components/modules/reminder/TaskEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTasks } from "@/lib/query/taskQueries";
import { cn } from "@/lib/utils";
import { filterTasks, type TaskFilterRange } from "@/lib/taskFilters";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import { useTranslation } from "react-i18next";

export function TaskReminderPage() {
  const { data: tasks, isLoading, error } = useTasks();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<TaskFilterRange>("all");
  const { t } = useTranslation();

  const filterOptions: Array<{ value: TaskFilterRange; label: string }> = [
    { value: "today", label: t("task.filterToday") },
    { value: "week", label: t("task.filterWeek") },
    { value: "all", label: t("task.filterAll") },
  ];

  const filteredTasks = useMemo(
    () => filterTasks(tasks || [], { search, range }),
    [tasks, search, range],
  );

  const handleCreate = () => {
    setEditingTaskId(null);
    setEditorOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingTaskId(id);
    setEditorOpen(true);
  };

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "n",
      meta: true,
      action: handleCreate,
      description: t("task.newTask"),
    },
  ]);

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive">{t("task.loadError")}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("task.searchPlaceholder")}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border bg-background p-1">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={cn(
                  "rounded-sm px-3 py-1.5 text-sm transition-colors",
                  range === option.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t("task.newTask")}
          </Button>
        </div>
      </div>

      <TaskList tasks={filteredTasks} onEdit={handleEdit} />

      <TaskEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        taskId={editingTaskId}
      />
    </div>
  );
}
