import { Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{template.name}</CardTitle>
          {template.description && (
            <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
          )}
        </div>
        <Badge variant="secondary">{template.category}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-xs text-muted-foreground">{t("template.titleTemplate")}</div>
          <div className="mt-1 rounded-md bg-muted px-3 py-2 text-sm">{template.title_template}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t("template.bodyTemplate")}</div>
          <div className="mt-1 whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm">
            {template.body_template}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-xs text-muted-foreground">
            {t("template.defaultCron")}: {template.default_cron || t("template.notSet")}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(template.id)}>
              <Edit className="mr-1 h-3 w-3" />
              {t("common.edit")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onDelete(template.id)}>
              <Trash2 className="mr-1 h-3 w-3" />
              {t("common.delete")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
