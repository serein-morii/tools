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
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg border">
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