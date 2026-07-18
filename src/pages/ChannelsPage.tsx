import { useChannels } from "@/lib/query/channelQueries";
import { ChannelList } from "@/components/modules/reminder/ChannelList";
import { Button } from "@/components/ui/button";
import { Plus, Hash } from "lucide-react";
import { useState } from "react";
import { ChannelEditor } from "@/components/modules/reminder/ChannelEditor";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import { useTranslation } from "react-i18next";

export function ChannelsPage() {
  const { data: channels, isLoading, error } = useChannels();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const { t } = useTranslation();

  const handleCreate = () => {
    setEditingChannelId(null);
    setEditorOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingChannelId(id);
    setEditorOpen(true);
  };

  useKeyboardShortcuts([
    {
      key: "n",
      meta: true,
      action: handleCreate,
      description: t("channel.newChannel"),
    },
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {t("channel.loadError")}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Hash className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-medium">渠道管理</h1>
              <p className="text-xs text-muted-foreground mt-0.5">管理通知推送渠道</p>
            </div>
          </div>
          <Button onClick={handleCreate} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t("channel.newChannel")}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="section-spacing-compact animate-in fade-in duration-200">
        <p className="text-xs text-muted-foreground">
          {(channels || []).length === 0 ? t("channel.emptyList") : `${(channels || []).length} ${t("channel.pageTitle").toLowerCase()}`}
        </p>

        <ChannelList channels={channels || []} onEdit={handleEdit} />

        <ChannelEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          channelId={editingChannelId}
        />
      </div>
    </div>
  );
}