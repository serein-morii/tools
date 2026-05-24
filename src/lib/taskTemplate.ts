import type { CreateTaskRequest, Template } from "@/types";

function isCronConfigJson(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && "mode" in parsed;
  } catch {
    return false;
  }
}

export function applyTemplateToTaskForm(form: CreateTaskRequest, template: Template): CreateTaskRequest {
  const defaultCron = template.default_cron;

  // If default_cron is a full cron_config JSON, use it directly
  if (defaultCron && isCronConfigJson(defaultCron)) {
    const config = JSON.parse(defaultCron);
    return {
      ...form,
      template_id: template.id,
      name: form.name || template.name,
      description: form.description || template.description,
      cron_config: defaultCron,
      cron_expr: extractCronExpr(config),
    };
  }

  // Otherwise treat it as a cron expression and wrap in advanced mode
  return {
    ...form,
    template_id: template.id,
    name: form.name || template.name,
    description: form.description || template.description,
    cron_expr: defaultCron || form.cron_expr,
    cron_config: defaultCron
      ? JSON.stringify({
          mode: "advanced",
          advanced: {
            expression: defaultCron,
          },
          endCondition: {
            type: "never",
          },
        })
      : form.cron_config,
  };
}

function extractCronExpr(config: { mode: string; standard?: { frequency?: string; time?: string; dayOfWeek?: number; dayOfMonth?: number; month?: number }; advanced?: { expression?: string } }): string {
  if (config.mode === "advanced" && config.advanced?.expression) {
    return config.advanced.expression;
  }
  // For special modes, the scheduler will handle it, use a placeholder
  return "0 9 * * *";
}
