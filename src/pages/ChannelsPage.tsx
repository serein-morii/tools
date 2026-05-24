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

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "n",
      meta: true,
      action: handleCreate,
      description: t("channel.newChannel"),
    },
  ]);

  if (isLoading) {
    return <div className="p-6"><p className="text-muted-foreground">{t("common.loading")}</p></div>;
  }

  if (error) {
    return <div className="p-6"><p className="text-destructive">{t("channel.loadError")}</p></div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">{t("channel.pageTitle")}</h2>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
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