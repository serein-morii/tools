import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateTemplate, useTemplate, useUpdateTemplate } from "@/lib/query/templateQueries";
import { CronEditor } from "./CronEditor";
import type { CronConfig } from "@/types";

interface TemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
}

const initialForm = {
  name: "",
  description: "",
  category: "custom",
  title_template: "",
  body_template: "",
  default_cron: "0 9 * * *",
  cron_config: JSON.stringify({
    mode: "standard",
    standard: { frequency: "daily", time: "09:00" },
    endCondition: { type: "never" },
  } as CronConfig),
};

export function TemplateEditor({ open, onOpenChange, templateId }: TemplateEditorProps) {
  const { data: template } = useTemplate(templateId || "");
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (template && templateId) {
      setForm({
        name: template.name,
        description: template.description || "",
        category: template.category,
        title_template: template.title_template,
        body_template: template.body_template,
        default_cron: template.default_cron || "0 9 * * *",
        cron_config: template.default_cron && template.default_cron.startsWith("{")
          ? template.default_cron
          : JSON.stringify({
              mode: "advanced",
              advanced: { expression: template.default_cron || "0 9 * * *" },
              endCondition: { type: "never" },
            } as CronConfig),
      });
    } else if (!templateId && open) {
      setForm(initialForm);
    }
  }, [template, templateId, open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      name: form.name,
      description: form.description || undefined,
      category: form.category || "custom",
      title_template: form.title_template,
      body_template: form.body_template,
      default_cron: form.cron_config,
    };

    if (templateId) {
      await updateTemplate.mutateAsync({ id: templateId, template: payload });
    } else {
      await createTemplate.mutateAsync(payload);
    }

    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-background p-6 shadow-lg">
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">
              {templateId ? "编辑模板" : "新建模板"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="template-name">模板名称</Label>
              <Input
                id="template-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="template-description">描述</Label>
              <Input
                id="template-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="template-category">分类</Label>
              <Input
                id="template-category"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="template-title">标题模板</Label>
              <Input
                id="template-title"
                value={form.title_template}
                onChange={(event) => setForm({ ...form, title_template: event.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="template-body">正文模板</Label>
              <Textarea
                id="template-body"
                value={form.body_template}
                onChange={(event) => setForm({ ...form, body_template: event.target.value })}
                rows={6}
                required
              />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">可用变量：</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-2">
                  <span><code className="bg-muted px-1 rounded">{`{task_name}`}</code> 任务名称</span>
                  <span><code className="bg-muted px-1 rounded">{`{date}`}</code> 日期 (如 2026-05-25)</span>
                  <span><code className="bg-muted px-1 rounded">{`{time}`}</code> 时间 (如 09:00)</span>
                  <span><code className="bg-muted px-1 rounded">{`{weekday}`}</code> 星期 (如 周一)</span>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>默认时间配置</Label>
              <CronEditor
                value={form.cron_config}
                onChange={(cronExpr, cronConfig) => setForm({ ...form, default_cron: cronExpr, cron_config: cronConfig })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={createTemplate.isPending || updateTemplate.isPending}>
                保存
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
