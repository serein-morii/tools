import { Edit, Trash2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Template } from "@/types";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface TemplateCardProps {
  template: Template;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TemplateCard({ template, onEdit, onDelete }: TemplateCardProps) {
  const { t } = useTranslation();

  return (
    <Card className="group overflow-hidden transition-all duration-200 hover:shadow-md">
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
            <FileText className="h-5 w-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-foreground truncate">{template.name}</h3>
              <Badge variant="secondary" className="text-xs">
                {template.category}
              </Badge>
            </div>

            {template.description && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-1">
                {template.description}
              </p>
            )}

            <div className="space-y-2">
              <div className="text-xs">
                <span className="text-muted-foreground">{t("template.titleTemplate")}: </span>
                <code className="bg-muted/50 px-1.5 py-0.5 rounded text-foreground">{template.title_template}</code>
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">{t("template.bodyTemplate")}: </span>
                <code className="bg-muted/50 px-1.5 py-0.5 rounded text-foreground line-clamp-1">{template.body_template}</code>
              </div>
              <div className="text-xs text-muted-foreground">
                {t("template.defaultCron")}: <span className="font-mono">{template.default_cron || t("template.notSet")}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(template.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(template.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}