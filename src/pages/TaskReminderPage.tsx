import { useMemo, useState, useEffect, useCallback } from "react";
import { Bell, Plus, Search, ListChecks, CalendarDays, Clock3, ToggleRight } from "lucide-react";
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

  const stats = useMemo(() => {
    const all = tasks || [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - now.getDay() * 86400000;
    return {
      total: all.length,
      today: all.filter((t) => t.next_run_at && t.next_run_at >= todayStart && t.next_run_at < todayStart + 86400000).length,
      week: all.filter((t) => t.next_run_at && t.next_run_at >= weekStart).length,
      enabled: all.filter((t) => t.enabled).length,
    };
  }, [tasks]);

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
      <div className="min-h-full bg-background">
      {/* Header */}
      <div className="border-b px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Bell className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-medium">任务提醒</h1>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] space-y-3 px-3 py-3 animate-in fade-in duration-200">
        <div className="flex items-center justify-center p-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {t("common.loading")}
          </div>
        </div>
      </div>
    </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-full bg-background">
      {/* Header */}
      <div className="border-b px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Bell className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-medium">任务提醒</h1>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] space-y-3 px-3 py-3 animate-in fade-in duration-200">
        <div className="p-5">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {t("task.loadError")}
          </div>
        </div>
      </div>
    </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="border-b px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Bell className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-medium">任务提醒</h1>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] space-y-3 px-3 py-3 animate-in fade-in duration-200">
      {/* Stats */}
      <div className="mb-3 grid grid-cols-4 gap-2 px-4 py-2 bg-muted/30 rounded-lg border">
        {[
          { icon: ListChecks, label: t("task.total") || "全部任务", value: stats.total },
          { icon: CalendarDays, label: t("task.today") || "今日", value: stats.today },
          { icon: Clock3, label: t("task.thisWeek") || "本周", value: stats.week },
          { icon: ToggleRight, label: t("task.enabled") || "已启用", value: stats.enabled },
        ].map((card) => (
          <div key={card.label} className="rounded-md border bg-card p-2">
            <div className="flex items-center gap-1.5">
              <card.icon className="h-3 w-3 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold">{card.value}</span>
                <p className="text-[9px] text-muted-foreground">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("task.searchPlaceholder")}
            className="pl-9 h-7 text-xs bg-card"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-card p-0.5">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200",
                  range === option.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button onClick={handleCreate} size="sm" className="gap-1.5 shadow-sm h-7 text-xs">
            <Plus className="h-3.5 w-3.5" />
            {t("task.newTask")}
            <Kbd keys={["⌘", "N"]} className="ml-0.5" />
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
    </div>
  );
}