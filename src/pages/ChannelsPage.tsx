import { useChannels } from "@/lib/query/channelQueries";
import { ChannelList } from "@/components/modules/reminder/ChannelList";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ChannelEditor } from "@/components/modules/reminder/ChannelEditor";

export function ChannelsPage() {
  const { data: channels, isLoading, error } = useChannels();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);

  const handleCreate = () => {
    setEditingChannelId(null);
    setEditorOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingChannelId(id);
    setEditorOpen(true);
  };

  if (isLoading) {
    return <div className="p-6"><p className="text-muted-foreground">加载中...</p></div>;
  }

  if (error) {
    return <div className="p-6"><p className="text-destructive">加载失败</p></div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">通知渠道</h2>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          新建渠道
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