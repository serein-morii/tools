import type { Channel } from "@/types";
import { ChannelCard } from "./ChannelCard";
import { useTranslation } from "react-i18next";

interface ChannelListProps {
  channels: Channel[];
  onEdit: (id: string) => void;
}

export function ChannelList({ channels, onEdit }: ChannelListProps) {
  const { t } = useTranslation();

  if (channels.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-2">{t("channel.emptyList")}</p>
        <p className="text-sm text-muted-foreground">{t("channel.emptyHint")}</p>
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