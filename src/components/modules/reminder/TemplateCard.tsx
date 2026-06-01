import { Edit, Trash2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Template } from "@/types";
import { useTranslation } from "react-i18next";

interface TemplateCardProps {
  template: Template;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TemplateCard({ template, onEdit, onDelete }: TemplateCardProps) {
  const { t } = useTranslation();

  return (
    <Card className="group overflow-hidden transition-all duration-200 hover:shadow-md">
      <div className="p-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
            <FileText className="h-4 w-4" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h3 className="text-sm font-medium text-foreground truncate">{template.name}</h3>
              <Badge variant="secondary" className="text-xs">
                {template.category}
              </Badge>
            </div>

            {template.description && (
              <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
                {template.description}
              </p>
            )}

            <div className="space-y-1">
              <div className="text-[11px]">
                <span className="text-muted-foreground">{t("template.titleTemplate")}: </span>
                <code className="bg-muted/50 px-1 py-0.5 rounded text-foreground">{template.title_template}</code>
              </div>
              <div className="text-[11px]">
                <span className="text-muted-foreground">{t("template.bodyTemplate")}: </span>
                <code className="bg-muted/50 px-1 py-0.5 rounded text-foreground line-clamp-1">{template.body_template}</code>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t("template.defaultCron")}: <span className="font-mono">{template.default_cron || t("template.notSet")}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(template.id)}
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(template.id)}
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}