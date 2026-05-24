import { useState } from "react";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  useKeyboardShortcuts([
    {
      key: "n",
      meta: true,
      action: handleCreate,
      description: t("template.newTemplate"),
    },
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {t("template.loading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {t("template.loadError")}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-md">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{t("template.pageTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("template.pageDescription")}
            </p>
          </div>
        </div>
        <Button onClick={handleCreate} className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
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