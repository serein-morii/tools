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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

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
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[85vh] w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold">
              {templateId ? t("template.editTemplate") : t("template.newTemplate")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="template-name" className="text-xs">{t("template.templateName")}</Label>
              <Input
                id="template-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="h-7 text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-description" className="text-xs">{t("template.description")}</Label>
              <Input
                id="template-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="h-7 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-category" className="text-xs">{t("template.category")}</Label>
              <Input
                id="template-category"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                className="h-7 text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-title" className="text-xs">{t("template.titleTemplate")}</Label>
              <Input
                id="template-title"
                value={form.title_template}
                onChange={(event) => setForm({ ...form, title_template: event.target.value })}
                className="h-7 text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-body" className="text-xs">{t("template.bodyTemplate")}</Label>
              <Textarea
                id="template-body"
                value={form.body_template}
                onChange={(event) => setForm({ ...form, body_template: event.target.value })}
                rows={5}
                className="text-xs"
                required
              />
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p className="font-medium">{t("template.variables")}:</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pl-2">
                  <span><code className="bg-muted px-1 rounded">{`{task_name}`}</code> {t("template.varTaskName")}</span>
                  <span><code className="bg-muted px-1 rounded">{`{description}`}</code> {t("template.varDescription")}</span>
                  <span><code className="bg-muted px-1 rounded">{`{date}`}</code> {t("template.varDate")}</span>
                  <span><code className="bg-muted px-1 rounded">{`{time}`}</code> {t("template.varTime")}</span>
                  <span><code className="bg-muted px-1 rounded">{`{weekday}`}</code> {t("template.varWeekday")}</span>
                  <span><code className="bg-muted px-1 rounded">{`{weekday_num}`}</code> {t("template.varWeekdayNum")}</span>
                  <span><code className="bg-muted px-1 rounded">{`{week_of_month}`}</code> {t("template.varWeekOfMonth")}</span>
                  <span><code className="bg-muted px-1 rounded">{`{day_of_month}`}</code> {t("template.varDayOfMonth")}</span>
                  <span><code className="bg-muted px-1 rounded">{`{days_remaining}`}</code> {t("template.varDaysRemaining")}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("template.defaultTime")}</Label>
              <CronEditor
                value={form.cron_config}
                onChange={(cronExpr, cronConfig) => setForm({ ...form, default_cron: cronExpr, cron_config: cronConfig })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" size="sm" className="h-7 text-xs" disabled={createTemplate.isPending || updateTemplate.isPending}>
                {t("common.save")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
