import { useState } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TemplateEditor } from "@/components/modules/reminder/TemplateEditor";
import { TemplateList } from "@/components/modules/reminder/TemplateList";
import { useDeleteTemplate, useTemplates } from "@/lib/query/templateQueries";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import { useTranslation } from "react-i18next";

export function TemplatesPage() {
  const { data: templates, isLoading, error } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "success" | "error">("idle");
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
  };

  const confirmDelete = async () => {
    if (!templateToDelete) return;
    try {
      await deleteTemplate.mutateAsync(templateToDelete);
      setDeleteStatus("success");
      setTimeout(() => {
        setDeleteStatus("idle");
        setTemplateToDelete(null);
      }, 1500);
    } catch {
      setDeleteStatus("error");
      setTimeout(() => setDeleteStatus("idle"), 1500);
    }
  };

  const cancelDelete = () => {
    setTemplateToDelete(null);
    setDeleteStatus("idle");
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
      <div className="p-5">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {t("template.loadError")}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {t("template.pageDescription")}
        </p>
        <Button onClick={handleCreate} size="sm" className="gap-1.5 shadow-sm h-7 text-xs">
          <Plus className="h-3.5 w-3.5" />
          {t("template.newTemplate")}
        </Button>
      </div>

      <TemplateList templates={templates || []} onEdit={handleEdit} onDelete={handleDelete} />

      <TemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        templateId={editingTemplateId}
      />

      {/* Inline delete confirmation */}
      {templateToDelete && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-card border rounded-lg px-3 py-2 shadow-lg">
          <span className="text-xs">{t("template.deleteConfirm")}</span>
          <Button size="sm" variant="destructive" className="h-6 text-xs gap-1" onClick={confirmDelete}>
            {deleteStatus === "success" ? <Check className="h-3 w-3" /> : deleteStatus === "error" ? <X className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
            {deleteStatus === "success" ? t("template.deleteSuccess") : deleteStatus === "error" ? t("template.deleteFailed") : t("common.delete")}
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={cancelDelete}>
            {t("common.cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}