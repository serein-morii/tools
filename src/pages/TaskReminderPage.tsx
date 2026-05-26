import { useMemo, useState, useEffect, useCallback } from "react";
import { Plus, Search, Bell } from "lucide-react";
import { TaskList } from "@/components/modules/reminder/TaskList";
import { TaskEditor } from "@/components/modules/reminder/TaskEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
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

  const handleCreate = useCallback(() => {
    setEditingTaskId(null);
    setEditorOpen(true);
  }, []);

  const handleEdit = useCallback((id: string) => {
    setEditingTaskId(id);
    setEditorOpen(true);
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "n",
      meta: true,
      action: handleCreate,
      description: t("task.newTask"),
    },
  ]);

  // Listen for tray new-task event
  useEffect(() => {
    const handler = () => handleCreate();
    window.addEventListener("tray-new-task", handler);
    return () => window.removeEventListener("tray-new-task", handler);
  }, [handleCreate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {t("task.loadError")}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md">
          <Bell className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{t("reminder.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("reminder.description")}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("task.searchPlaceholder")}
            className="pl-10 h-10 bg-card"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-card p-1">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200",
                  range === option.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button onClick={handleCreate} className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            {t("task.newTask")}
            <Kbd keys={["⌘", "N"]} className="ml-1" />
          </Button>
        </div>
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