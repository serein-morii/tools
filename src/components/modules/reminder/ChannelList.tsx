import type { Channel } from "@/types";
import { ChannelCard } from "./ChannelCard";
import { useTranslation } from "react-i18next";
import { Radio } from "lucide-react";

interface ChannelListProps {
  channels: Channel[];
  onEdit: (id: string) => void;
}

export function ChannelList({ channels, onEdit }: ChannelListProps) {
  const { t } = useTranslation();

  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 mb-4">
          <Radio className="h-7 w-7 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">{t("channel.emptyList")}</p>
        <p className="text-xs text-muted-foreground">{t("channel.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {channels.map((channel) => (
        <ChannelCard key={channel.id} channel={channel} onEdit={onEdit} />
      ))}
    </div>
  );
}