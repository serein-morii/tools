export type TaskFilterRange = "all" | "today" | "week";

export type FilterableTask = {
  id: string;
  name: string;
  description?: string | null;
  next_run_at?: number | null;
  priority?: number;
  enabled?: boolean;
};

export type TaskFilterOptions = {
  search: string;
  range: TaskFilterRange;
  now?: number;
};

export function filterTasks<T extends FilterableTask>(
  tasks: T[],
  options: TaskFilterOptions,
): T[] {
  const query = options.search.trim().toLowerCase();
  const now = options.now ?? Date.now();

  const filtered = tasks.filter((task) => {
    const matchesSearch =
      query.length === 0 ||
      task.name.toLowerCase().includes(query) ||
      (task.description ?? "").toLowerCase().includes(query);

    if (!matchesSearch) {
      return false;
    }

    if (options.range === "all") {
      return true;
    }

    if (!task.next_run_at) {
      return false;
    }

    if (options.range === "today") {
      return startOfLocalDay(task.next_run_at) === startOfLocalDay(now);
    }

    const todayStart = startOfLocalDay(now);
    const weekEnd = todayStart + 7 * 24 * 60 * 60 * 1000;

    return task.next_run_at >= todayStart && task.next_run_at < weekEnd;
  });

  // Sort: enabled first, then by priority (descending), then by next_run_at
  return filtered.sort((a, b) => {
    // Enabled tasks come first
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1;
    }
    // Higher priority first
    const priorityA = a.priority ?? 0;
    const priorityB = b.priority ?? 0;
    if (priorityA !== priorityB) {
      return priorityB - priorityA;
    }
    // Earlier next_run_at first
    const nextA = a.next_run_at ?? Infinity;
    const nextB = b.next_run_at ?? Infinity;
    return nextA - nextB;
  });
}

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
