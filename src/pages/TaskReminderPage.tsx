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
      <div className="min-h-full">
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight">任务提醒</h1>
              </div>
            </div>
          </div>
        </div>
        <div className="section-spacing">
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
      <div className="min-h-full">
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight">任务提醒</h1>
              </div>
            </div>
          </div>
        </div>
        <div className="section-spacing">
          <div className="p-5">
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {t("task.loadError")}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Bell className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">任务提醒</h1>
            </div>
          </div>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3 animate-in fade-in duration-200">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: ListChecks, label: t("task.total") || "全部任务", value: stats.total, bg: "bg-muted" },
          { icon: CalendarDays, label: t("task.today") || "今日", value: stats.today, bg: "bg-blue-500/10", color: "text-blue-600" },
          { icon: Clock3, label: t("task.thisWeek") || "本周", value: stats.week, bg: "bg-violet-500/10", color: "text-violet-600" },
          { icon: ToggleRight, label: t("task.enabled") || "已启用", value: stats.enabled, bg: "bg-emerald-500/10", color: "text-emerald-600" },
        ].map((card) => (
          <div key={card.label} className="stat-card-compact">
            <div className="flex items-center gap-2">
              <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", card.bg)}>
                <card.icon className={cn("h-4 w-4", card.color || "text-muted-foreground")} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-lg font-bold tabular-nums">{card.value}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("task.searchPlaceholder")}
            className="pl-9 h-9 text-sm"
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
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150",
                  range === option.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button onClick={handleCreate} size="sm" className="gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" />
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