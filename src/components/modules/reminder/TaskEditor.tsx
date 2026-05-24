import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTask, useCreateTask, useUpdateTask } from "@/lib/query/taskQueries";
import { useChannels } from "@/lib/query/channelQueries";
import { CronEditor } from "./CronEditor";
import type { CreateTaskRequest, UpdateTaskRequest } from "@/types";
import { createDefaultTaskRequest } from "@/lib/cron";

interface TaskEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string | null;
}

export function TaskEditor({ open, onOpenChange, taskId }: TaskEditorProps) {
  const { data: existingTask } = useTask(taskId || "");
  const { data: channels } = useChannels();
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
        {
          onSuccess: () => {
            toast.success("任务已更新");
            onOpenChange(false);
          },
          onError: (error) => {
            toast.error("更新失败: " + error.message);
          }
        }
      );
    } else {
      createMutation.mutate(form, {
        onSuccess: () => {
          toast.success("任务已创建");
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error("创建失败: " + error.message);
        }
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg max-h-[85vh] translate-x-[-50%] translate-y-[-50%] bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg border flex flex-col">
          <div className="flex items-center justify-between p-6 pb-0">
            <Dialog.Title className="text-lg font-semibold">
              {taskId ? "编辑任务" : "新建任务"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
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
              <Label>时间配置</Label>
              <CronEditor
                value={form.cron_config || ""}
                onChange={(cronExpr, cronConfig) =>
                  setForm({ ...form, cron_expr: cronExpr, cron_config: cronConfig })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>通知渠道</Label>
              <div className="flex flex-wrap gap-2">
                {channels?.map((channel) => (
                  <label
                    key={channel.id}
                    className="flex items-center gap-2 px-3 py-1.5 border rounded-md cursor-pointer hover:bg-muted transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={form.channel_ids?.includes(channel.id) || false}
                      onChange={(e) => {
                        const currentIds = form.channel_ids || [];
                        if (e.target.checked) {
                          setForm({ ...form, channel_ids: [...currentIds, channel.id] });
                        } else {
                          setForm({
                            ...form,
                            channel_ids: currentIds.filter((id) => id !== channel.id),
                          });
                        }
                      }}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">{channel.name}</span>
                  </label>
                ))}
                {(!channels || channels.length === 0) && (
                  <p className="text-sm text-muted-foreground">
                    暂无可用渠道，请先在渠道管理中创建
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">优先级</Label>
              <Select
                id="priority"
                value={form.priority?.toString() || "0"}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })}
              >
                <option value="0">普通</option>
                <option value="1">重要</option>
                <option value="2">紧急</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>标签</Label>
              <div className="flex flex-wrap gap-2">
                {form.tags?.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => {
                        setForm({
                          ...form,
                          tags: form.tags?.filter((_, i) => i !== idx),
                        });
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder="添加标签..."
                  className="px-2 py-1 border rounded-md text-sm w-24"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const value = (e.target as HTMLInputElement).value.trim();
                      if (value && !form.tags?.includes(value)) {
                        setForm({
                          ...form,
                          tags: [...(form.tags || []), value],
                        });
                      }
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                按 Enter 添加标签
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t bg-background p-6 -mx-6 -mb-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}