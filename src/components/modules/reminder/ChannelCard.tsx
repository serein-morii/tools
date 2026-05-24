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
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm",
              channelColors[channel.type] || "from-gray-500 to-gray-600"
            )}
          >
            <Radio className="h-5 w-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-foreground truncate">{channel.name}</h3>
              <Badge variant="outline" className="text-xs">
                {channelTypeLabels[channel.type] || channel.type}
              </Badge>
            </div>

            {channel.description && (
              <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
                {channel.description}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
          <div className="flex items-center gap-1">
            <Switch
              checked={channel.enabled}
              onCheckedChange={handleToggle}
              disabled={updateMutation.isPending}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleTest}
              disabled={testMutation.isPending}
              title={t("channel.testChannel")}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Zap className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(channel.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              className={cn(
                "opacity-0 group-hover:opacity-100 transition-opacity",
                isDeleting && "opacity-100 text-destructive hover:text-destructive"
              )}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}