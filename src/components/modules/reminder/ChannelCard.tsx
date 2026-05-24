import type { Channel } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Zap, CheckCircle, XCircle } from "lucide-react";
import { useUpdateChannel, useDeleteChannel, useTestChannel } from "@/lib/query/channelQueries";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
    <Card className="p-4">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium truncate">{channel.name}</h3>
            <Badge variant={channel.enabled ? "default" : "secondary"}>
              {channel.enabled ? t("common.enabled") : t("common.disabled")}
            </Badge>
            <Badge variant="outline">
              {channelTypeLabels[channel.type] || channel.type}
            </Badge>
          </div>

          {channel.description && (
            <p className="text-sm text-muted-foreground mb-2">
              {channel.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
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

        <div className="flex items-center gap-2">
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
          >
            <Zap className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(channel.id)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            className={isDeleting ? "text-destructive hover:text-destructive" : ""}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}