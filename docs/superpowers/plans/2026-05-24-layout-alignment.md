# Layout Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the app shell and reminder module UI with the approved task reminder design document.

**Architecture:** Keep `MainLayout` as the global shell and move reminder-specific navigation into a new `ReminderLayout`. Use the sidebar only for top-level modules, and keep existing task/channel data flows unchanged. Add local task filtering in the task page without changing backend APIs.

**Tech Stack:** React 19, React Router 7, TypeScript, Tailwind CSS, React Query, Tauri v2, Rust scheduler tests.

---

## File Structure

- Modify: `src/App.tsx` — route `/` to `/reminder/tasks`, nest reminder pages under `ReminderLayout`, add timer/notes placeholders.
- Modify: `src/components/layout/Sidebar.tsx` — replace wide navigation with 72px top-level module rail.
- Create: `src/components/modules/reminder/ReminderLayout.tsx` — reminder module header and second-level tabs.
- Modify: `src/pages/TaskReminderPage.tsx` — add toolbar with search, new task, today/week/all filters.
- Create: `src/lib/taskFilters.ts` — pure helpers for task search and date filtering.
- Create: `src/lib/taskFilters.test.ts` — node-compatible tests for filtering helpers.
- Create: `src/pages/TemplatesPage.tsx` — reminder template placeholder.
- Create: `src/pages/HistoryPage.tsx` — reminder history placeholder.
- Create: `src/pages/TimerPage.tsx` — timer module placeholder.
- Create: `src/pages/NotesPage.tsx` — notes module placeholder.

---

### Task 1: Add Task Filtering Helpers

**Files:**
- Create: `src/lib/taskFilters.ts`
- Create: `src/lib/taskFilters.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/taskFilters.test.ts`:

```ts
import assert from "node:assert/strict";
import { filterTasks, type FilterableTask } from "./taskFilters";

const baseTime = new Date("2026-05-24T10:00:00.000Z").getTime();

const tasks: FilterableTask[] = [
  {
    id: "today",
    name: "Morning Review",
    description: "Check metrics",
    next_run_at: new Date("2026-05-24T12:00:00.000Z").getTime(),
  },
  {
    id: "week",
    name: "Weekly Planning",
    description: null,
    next_run_at: new Date("2026-05-27T12:00:00.000Z").getTime(),
  },
  {
    id: "later",
    name: "Monthly Billing",
    description: "Invoice review",
    next_run_at: new Date("2026-06-03T12:00:00.000Z").getTime(),
  },
];

assert.deepEqual(
  filterTasks(tasks, { search: "metrics", range: "all", now: baseTime }).map((task) => task.id),
  ["today"],
);

assert.deepEqual(
  filterTasks(tasks, { search: "", range: "today", now: baseTime }).map((task) => task.id),
  ["today"],
);

assert.deepEqual(
  filterTasks(tasks, { search: "", range: "week", now: baseTime }).map((task) => task.id),
  ["today", "week"],
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/lib/taskFilters.test.ts`

Expected: FAIL because `tsx` is not installed or `src/lib/taskFilters.ts` does not exist. Since the project has no test runner, use TypeScript build as the durable verification target after adding helpers.

- [ ] **Step 3: Implement helpers**

Create `src/lib/taskFilters.ts`:

```ts
export type TaskFilterRange = "all" | "today" | "week";

export type FilterableTask = {
  id: string;
  name: string;
  description?: string | null;
  next_run_at?: number | null;
};

export type TaskFilterOptions = {
  search: string;
  range: TaskFilterRange;
  now?: number;
};

export function filterTasks<T extends FilterableTask>(tasks: T[], options: TaskFilterOptions): T[] {
  const query = options.search.trim().toLowerCase();
  const now = options.now ?? Date.now();

  return tasks.filter((task) => {
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
      return isSameLocalDay(task.next_run_at, now);
    }

    return task.next_run_at >= startOfLocalDay(now) && task.next_run_at < startOfLocalDay(now) + 7 * 24 * 60 * 60 * 1000;
  });
}

function isSameLocalDay(left: number, right: number) {
  return startOfLocalDay(left) === startOfLocalDay(right);
}

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
```

- [ ] **Step 4: Verify with build**

Run: `npm run build`

Expected: PASS.

---

### Task 2: Align Routing and Reminder Module Shell

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/modules/reminder/ReminderLayout.tsx`
- Create: `src/pages/TemplatesPage.tsx`
- Create: `src/pages/HistoryPage.tsx`
- Create: `src/pages/TimerPage.tsx`
- Create: `src/pages/NotesPage.tsx`

- [ ] **Step 1: Add reminder layout**

Create `ReminderLayout` with second-level tabs for tasks, templates, channels, and history.

- [ ] **Step 2: Add placeholder pages**

Create focused placeholder pages for template/history/timer/notes so every designed route renders.

- [ ] **Step 3: Update routes**

Change routes so `/` redirects to `/reminder/tasks`, and reminder pages nest under `/reminder`.

- [ ] **Step 4: Verify routes compile**

Run: `npm run build`

Expected: PASS.

---

### Task 3: Align Global Sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Replace wide sidebar**

Change the sidebar to a 72px module rail with top-level entries:

- 提醒 → `/reminder/tasks`
- 计时 → `/timer`
- 笔记 → `/notes`
- 设置 → `/settings` fixed at bottom

- [ ] **Step 2: Preserve active state**

Use `useLocation()` so `/reminder/*` highlights 提醒.

- [ ] **Step 3: Verify sidebar compiles**

Run: `npm run build`

Expected: PASS.

---

### Task 4: Add Task Page Toolbar

**Files:**
- Modify: `src/pages/TaskReminderPage.tsx`
- Use: `src/lib/taskFilters.ts`

- [ ] **Step 1: Add local state**

Add `search` and `range` state to the task page.

- [ ] **Step 2: Apply filtering**

Pass filtered tasks to `TaskList` while keeping existing create/edit/delete behavior.

- [ ] **Step 3: Add toolbar UI**

Add search input, `+ 新建任务`, and filter buttons `今天 / 本周 / 全部`.

- [ ] **Step 4: Verify task page compiles**

Run: `npm run build`

Expected: PASS.

---

### Task 5: Final Verification

**Files:**
- Verify current working tree only.

- [ ] **Step 1: Run frontend build**

Run: `npm run build`

Expected: PASS with TypeScript and Vite build succeeding.

- [ ] **Step 2: Run backend tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS with scheduler and notifier tests passing.

- [ ] **Step 3: Launch application**

Run: `npm run tauri dev`

Expected: app launches and Vite serves successfully.

- [ ] **Step 4: Check routes manually**

Open routes in the running app:

- `/reminder/tasks`
- `/reminder/templates`
- `/reminder/channels`
- `/reminder/history`
- `/timer`
- `/notes`
- `/settings`

Expected: each route renders inside the narrow sidebar shell, reminder routes show the second-level tabs, and task page shows the toolbar.
