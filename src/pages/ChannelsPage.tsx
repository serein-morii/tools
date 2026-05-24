import { useChannels } from "@/lib/query/channelQueries";
import { ChannelList } from "@/components/modules/reminder/ChannelList";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
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
      <div className="p-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {t("channel.loadError")}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("channel.pageTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("channel.emptyList")}
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          {t("channel.newChannel")}
        </Button>
      </div>

      <ChannelList channels={channels || []} onEdit={handleEdit} />

      <ChannelEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        channelId={editingChannelId}
      />
    </div>
  );
}