import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TemplateEditor } from "@/components/modules/reminder/TemplateEditor";
import { TemplateList } from "@/components/modules/reminder/TemplateList";
import { useDeleteTemplate, useTemplates } from "@/lib/query/templateQueries";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export function TemplatesPage() {
  const { data: templates, isLoading, error } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const { t } = useTranslation();

  const handleCreate = () => {
    setEditingTemplateId(null);
    setEditorOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingTemplateId(id);
    setEditorOpen(true);
  };

  const handleDelete = (id: string) => {
    setTemplateToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!templateToDelete) return;
    try {
      await deleteTemplate.mutateAsync(templateToDelete);
      toast.success(t("template.deleteSuccess"));
    } catch {
      toast.error(t("template.deleteFailed"));
    }
    setDeleteConfirmOpen(false);
    setTemplateToDelete(null);
  };

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "n",
      meta: true,
      action: handleCreate,
      description: t("template.newTemplate"),
    },
  ]);

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t("template.loading")}</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-sm text-destructive">{t("template.loadError")}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t("template.pageTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("template.pageDescription")}
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t("template.newTemplate")}
        </Button>
      </div>

      <TemplateList templates={templates || []} onEdit={handleEdit} onDelete={handleDelete} />

      <TemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        templateId={editingTemplateId}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("template.deleteTitle")}
        description={t("template.deleteDescription")}
        confirmText={t("common.delete")}
        onConfirm={confirmDelete}
        destructive
      />
    </div>
  );
}
