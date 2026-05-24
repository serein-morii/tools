import { TemplateCard } from "./TemplateCard";
import type { Template } from "@/types";
import { useTranslation } from "react-i18next";

interface TemplateListProps {
  templates: Template[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TemplateList({ templates, onEdit, onDelete }: TemplateListProps) {
  const { t } = useTranslation();

  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center">
        <p className="text-muted-foreground">{t("template.emptyList")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("template.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
