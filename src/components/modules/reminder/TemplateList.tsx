import { TemplateCard } from "./TemplateCard";
import type { Template } from "@/types";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";

interface TemplateListProps {
  templates: Template[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TemplateList({ templates, onEdit, onDelete }: TemplateListProps) {
  const { t } = useTranslation();

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 mb-4">
          <FileText className="h-7 w-7 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">{t("template.emptyList")}</p>
        <p className="text-xs text-muted-foreground">{t("template.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2 xl:grid-cols-2">
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
