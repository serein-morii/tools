import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { X } from "lucide-react";
import { useTask, useCreateTask, useUpdateTask } from "@/lib/query/taskQueries";
import { useChannels } from "@/lib/query/channelQueries";
import { useTemplates } from "@/lib/query/templateQueries";
import { CronEditor } from "./CronEditor";
import type { CreateTaskRequest, UpdateTaskRequest } from "@/types";
import { createDefaultTaskRequest } from "@/lib/cron";
import { applyTemplateToTaskForm } from "@/lib/taskTemplate";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface TaskEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string | null;
}

export function TaskEditor({ open, onOpenChange, taskId }: TaskEditorProps) {
  const { data: existingTask } = useTask(taskId || "");
  const { data: channels } = useChannels();
  const { data: templates } = useTemplates();
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const { t } = useTranslation();

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

  const handleTemplateChange = (templateId: string) => {
    if (!templateId) {
      setForm({ ...form, template_id: undefined });
      return;
    }

    const template = templates?.find((item) => item.id === templateId);
    if (template) {
      setForm(applyTemplateToTaskForm(form, template));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error(t("task.nameRequired"));
      return;
    }

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
          onSuccess: () => onOpenChange(false),
          onError: (err) => toast.error(String(err)),
        }
      );
    } else {
      createMutation.mutate(form, {
        onSuccess: () => onOpenChange(false),
        onError: (err) => toast.error(String(err)),
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg max-h-[85vh] translate-x-[-50%] translate-y-[-50%] bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg border flex flex-col">
          <div className="flex items-center justify-between p-6 pb-0">
            <Dialog.Title className="text-lg font-semibold">
              {taskId ? t("task.editTask") : t("task.newTask")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template_id">{t("task.reminderTemplate")}</Label>
              <Select
                id="template_id"
                value={form.template_id || ""}
                onChange={(e) => handleTemplateChange(e.target.value)}
              >
                <option value="">{t("task.noTemplate")}</option>
                {templates?.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("task.templateHint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">{t("task.taskName")}</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("task.taskNamePlaceholder")}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("task.descriptionOptional")}</Label>
              <Textarea
                id="description"
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value || undefined })}
                placeholder={t("task.descriptionPlaceholder")}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reminder_type">{t("task.reminderType")}</Label>
              <Select
                id="reminder_type"
                value={form.reminder_type}
                onChange={(e) => setForm({ ...form, reminder_type: e.target.value })}
              >
                <option value="simple">{t("task.simpleNotification")}</option>
                <option value="confirm">{t("task.needConfirm")}</option>
                <option value="feedback">{t("task.needFeedback")}</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("task.timeConfig")}</Label>
              <CronEditor
                value={form.cron_config || ""}
                onChange={(cronExpr, cronConfig) =>
                  setForm({ ...form, cron_expr: cronExpr, cron_config: cronConfig })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>{t("task.channels")}</Label>
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
                    {t("task.noChannels")}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">{t("task.priority")}</Label>
              <Select
                id="priority"
                value={form.priority?.toString() || "0"}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })}
              >
                <option value="0">{t("task.normal")}</option>
                <option value="1">{t("task.important")}</option>
                <option value="2">{t("task.urgent")}</option>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t bg-background p-6 -mx-6 -mb-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? t("task.saving") : t("common.save")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}