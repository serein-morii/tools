import type { Channel } from "@/types";
import { ChannelCard } from "./ChannelCard";

interface ChannelListProps {
  channels: Channel[];
  onEdit: (id: string) => void;
}

export function ChannelList({ channels, onEdit }: ChannelListProps) {
  if (channels.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-2">暂无通知渠道</p>
        <p className="text-sm text-muted-foreground">点击右上角「新建渠道」添加第一个通知渠道</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {channels.map((channel) => (
        <ChannelCard key={channel.id} channel={channel} onEdit={onEdit} />
      ))}
    </div>
  );
}