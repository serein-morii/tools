# Task List UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the task list UI with task cards, task creation/editing dialog, and basic interactions.

**Architecture:** Update the existing TaskReminderPage to display a real task list using the React Query hooks. Create a TaskCard component for displaying individual tasks and a TaskEditor dialog for creating/editing tasks. Use Radix UI Dialog for modals.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Radix UI Dialog, React Query, Lucide icons

---

## File Structure

```
src/
├── components/
│   └── modules/
│       └── reminder/
│           ├── TaskCard.tsx          # Individual task card
│           ├── TaskList.tsx          # Task list container
│           ├── TaskEditor.tsx        # Task create/edit dialog
│           └── CronEditor.tsx        # Cron expression editor
├── pages/
│   └── TaskReminderPage.tsx          # Updated to use TaskList
└── lib/
    └── query/
        └── taskQueries.ts            # Already exists
```

---

### Task 1: Update TaskReminderPage with Task List

**Files:**
- Modify: `src/pages/TaskReminderPage.tsx`

- [ ] **Step 1: Update TaskReminderPage to display task list**

```tsx
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
        <p className="text-destructive">加载失败: {error.message}</p>
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
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: Builds successfully (will have missing component errors)

- [ ] **Step 3: Commit**

```bash
git add src/pages/TaskReminderPage.tsx
git commit -m "feat: update TaskReminderPage with task list structure"
```

---

### Task 2: Create TaskList Component

**Files:**
- Create: `src/components/modules/reminder/TaskList.tsx`

- [ ] **Step 1: Create TaskList component**

```tsx
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
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: Builds with missing TaskCard error

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/reminder/TaskList.tsx
git commit -m "feat: add TaskList component"
```

---

### Task 3: Create TaskCard Component

**Files:**
- Create: `src/components/modules/reminder/TaskCard.tsx`

- [ ] **Step 1: Create TaskCard component**

```tsx
import type { Task } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Bell, BellOff } from "lucide-react";
import { useToggleTask, useDeleteTask } from "@/lib/query/taskQueries";
import { useState } from "react";

interface TaskCardProps {
  task: Task;
  onEdit: (id: string) => void;
}

const reminderTypeLabels: Record<string, string> = {
  simple: "简单通知",
  confirm: "需要确认",
  feedback: "需要反馈",
};

export function TaskCard({ task, onEdit }: TaskCardProps) {
  const toggleMutation = useToggleTask();
  const deleteMutation = useDeleteTask();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggle = () => {
    toggleMutation.mutate({ id: task.id, enabled: !task.enabled });
  };

  const handleDelete = () => {
    if (isDeleting) {
      deleteMutation.mutate(task.id);
      setIsDeleting(false);
    } else {
      setIsDeleting(true);
      setTimeout(() => setIsDeleting(false), 3000);
    }
  };

  const formatNextRun = (timestamp?: number) => {
    if (!timestamp) return "未安排";
    const date = new Date(timestamp);
    return date.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const parseChannelIds = (channelIdsStr: string): string[] => {
    try {
      return JSON.parse(channelIdsStr);
    } catch {
      return [];
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium truncate">{task.name}</h3>
            <Badge variant={task.enabled ? "default" : "secondary"}>
              {task.enabled ? "启用" : "禁用"}
            </Badge>
            {task.reminder_type !== "simple" && (
              <Badge variant="outline">
                {reminderTypeLabels[task.reminder_type] || task.reminder_type}
              </Badge>
            )}
          </div>

          {task.description && (
            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
              {task.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              {task.enabled ? (
                <Bell className="h-3 w-3" />
              ) : (
                <BellOff className="h-3 w-3" />
              )}
              {task.cron_expr}
            </span>
            <span>下次: {formatNextRun(task.next_run_at)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={task.enabled}
            onCheckedChange={handleToggle}
            disabled={toggleMutation.isPending}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(task.id)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            className={isDeleting ? "text-destructive hover:text-destructive" : ""}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: Builds successfully

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/reminder/TaskCard.tsx
git commit -m "feat: add TaskCard component with toggle and delete"
```

---

### Task 4: Create TaskEditor Dialog

**Files:**
- Create: `src/components/modules/reminder/TaskEditor.tsx`

- [ ] **Step 1: Create TaskEditor component**

```tsx
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { X } from "lucide-react";
import { useTask, useCreateTask, useUpdateTask } from "@/lib/query/taskQueries";
import type { CreateTaskRequest, UpdateTaskRequest } from "@/types";
import { createDefaultTaskRequest } from "@/lib/cron";

interface TaskEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string | null;
}

export function TaskEditor({ open, onOpenChange, taskId }: TaskEditorProps) {
  const { data: existingTask } = useTask(taskId || "");
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();

  const [form, setForm] = useState<CreateTaskRequest>(createDefaultTaskRequest());

  useEffect(() => {
    if (existingTask) {
      setForm({
        name: existingTask.name,
        description: existingTask.description || undefined,
        reminder_type: existingTask.reminder_type,
        cron_expr: existingTask.cron_expr,
        cron_config: existingTask.cron_config,
        template_id: existingTask.template_id || undefined,
        channel_ids: JSON.parse(existingTask.channel_ids || "[]"),
        tags: JSON.parse(existingTask.tags || "[]"),
        priority: existingTask.priority,
      });
    } else {
      setForm(createDefaultTaskRequest());
    }
  }, [existingTask, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) return;

    if (taskId) {
      const updateReq: UpdateTaskRequest = {
        name: form.name,
        description: form.description,
        reminder_type: form.reminder_type,
        cron_expr: form.cron_expr,
        cron_config: form.cron_config,
        template_id: form.template_id,
        channel_ids: form.channel_ids,
        tags: form.tags,
        priority: form.priority,
      };
      updateMutation.mutate(
        { id: taskId, task: updateReq },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createMutation.mutate(form, { onSuccess: () => onOpenChange(false) });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg">
          <Dialog.Title className="text-lg font-semibold mb-4">
            {taskId ? "编辑任务" : "新建任务"}
          </Dialog.Title>
          <Dialog.Close asChild>
            <button
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">任务名称</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="输入任务名称"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">描述 (可选)</Label>
              <Textarea
                id="description"
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value || undefined })}
                placeholder="任务描述"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reminder_type">提醒类型</Label>
              <Select
                id="reminder_type"
                value={form.reminder_type}
                onChange={(e) => setForm({ ...form, reminder_type: e.target.value })}
              >
                <option value="simple">简单通知</option>
                <option value="confirm">需要确认</option>
                <option value="feedback">需要反馈</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cron_expr">Cron 表达式</Label>
              <Input
                id="cron_expr"
                value={form.cron_expr}
                onChange={(e) => setForm({ ...form, cron_expr: e.target.value })}
                placeholder="0 9 * * *"
              />
              <p className="text-xs text-muted-foreground">
                格式: 分 时 日 月 周 (例如: 0 9 * * * 表示每天9:00)
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: Builds successfully

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/reminder/TaskEditor.tsx
git commit -m "feat: add TaskEditor dialog for create/edit tasks"
```

---

### Task 5: Create Module Index and Verify

**Files:**
- Create: `src/components/modules/reminder/index.ts`

- [ ] **Step 1: Create index file for reminder module**

```tsx
export { TaskCard } from "./TaskCard";
export { TaskList } from "./TaskList";
export { TaskEditor } from "./TaskEditor";
```

- [ ] **Step 2: Build and test**

Run: `npm run build`
Expected: Builds successfully

- [ ] **Step 3: Run dev server and verify UI**

Run: `npm run tauri dev`
Expected: App shows task list, can create new tasks

- [ ] **Step 4: Commit**

```bash
git add src/components/modules/reminder/index.ts
git commit -m "feat: add reminder module index"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Task list display
- ✅ Task creation dialog
- ✅ Task editing
- ✅ Task toggle (enable/disable)
- ✅ Task deletion
- ⚠️ Cron editor UI - simplified for now, will be enhanced later
- ⚠️ Channel selection - not implemented yet

**2. Placeholder scan:**
- ✅ No TBD or TODO
- ✅ All code blocks complete

**3. Type consistency:**
- ✅ Task type matches backend
- ✅ CreateTaskRequest and UpdateTaskRequest used correctly
