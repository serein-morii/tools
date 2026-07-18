import type { Channel } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Zap, CheckCircle, XCircle, Radio } from "lucide-react";
import { useUpdateChannel, useDeleteChannel, useTestChannel } from "@/lib/query/channelQueries";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ChannelCardProps {
  channel: Channel;
  onEdit: (id: string) => void;
}

export function ChannelCard({ channel, onEdit }: ChannelCardProps) {
  const updateMutation = useUpdateChannel();
  const deleteMutation = useDeleteChannel();
  const testMutation = useTestChannel();
  const [isDeleting, setIsDeleting] = useState(false);
  const { t } = useTranslation();

  const channelTypeLabels: Record<string, string> = {
    bark: "Bark",
    feishu: t("channel.feishu"),
    wecom: t("channel.wecom"),
    dingtalk: t("channel.dingtalk"),
  };

  const channelColors: Record<string, string> = {
    bark: "from-green-500 to-emerald-600",
    feishu: "from-blue-500 to-cyan-600",
    wecom: "from-orange-500 to-amber-600",
    dingtalk: "from-sky-500 to-blue-600",
  };

  const handleToggle = () => {
    updateMutation.mutate({ id: channel.id, channel: { enabled: !channel.enabled } });
  };

  const handleDelete = () => {
    if (isDeleting) {
      deleteMutation.mutate(channel.id);
      setIsDeleting(false);
    } else {
      setIsDeleting(true);
      setTimeout(() => setIsDeleting(false), 3000);
    }
  };

  const handleTest = () => {
    testMutation.mutate(channel.id);
  };

  const formatLastTest = (timestamp?: number) => {
    if (!timestamp) return t("channel.notTested");
    const date = new Date(timestamp);
    return date.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card className={cn("group overflow-hidden transition-all duration-200 hover:shadow-md", !channel.enabled && "opacity-60")}>
      <div className="p-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm",
              channelColors[channel.type] || "from-gray-500 to-gray-600"
            )}
          >
            <Radio className="h-4 w-4" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h3 className="text-sm font-medium text-foreground truncate">{channel.name}</h3>
              <Badge variant="outline" className="text-xs">
                {channelTypeLabels[channel.type] || channel.type}
              </Badge>
            </div>

            {channel.description && (
              <p className="text-xs text-muted-foreground mb-1 line-clamp-1">
                {channel.description}
              </p>
            )}

            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {testMutation.isPending ? (
                  <Zap className="h-3 w-3 animate-pulse" />
                ) : channel.last_test_result?.includes("发送成功") ? (
                  <CheckCircle className="h-3 w-3 text-green-500" />
                ) : channel.last_test_at ? (
                  <XCircle className="h-3 w-3 text-red-500" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
                {t("channel.lastTest")}: {formatLastTest(channel.last_test_at)}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            <Switch
              checked={channel.enabled}
              onCheckedChange={handleToggle}
              disabled={updateMutation.isPending}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleTest}
              disabled={testMutation.isPending}
              title={t("channel.testChannel")}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Zap className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onEdit(channel.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleDelete}
              className={cn(
                "opacity-0 group-hover:opacity-100 transition-opacity",
                isDeleting && "opacity-100 text-destructive hover:text-destructive"
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}