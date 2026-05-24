import type { Channel } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Zap, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useUpdateChannel, useDeleteChannel, useTestChannel } from "@/lib/query/channelQueries";
import { useState } from "react";

interface ChannelCardProps {
  channel: Channel;
  onEdit: (id: string) => void;
}

const channelTypeLabels: Record<string, string> = {
  bark: "Bark",
  feishu: "飞书",
  wecom: "企业微信",
  dingtalk: "钉钉",
};

export function ChannelCard({ channel, onEdit }: ChannelCardProps) {
  const updateMutation = useUpdateChannel();
  const deleteMutation = useDeleteChannel();
  const testMutation = useTestChannel();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggle = () => {
    updateMutation.mutate(
      { id: channel.id, channel: { enabled: !channel.enabled } },
      {
        onSuccess: () => {
          toast.success(channel.enabled ? "渠道已禁用" : "渠道已启用");
        },
        onError: (error) => {
          toast.error("操作失败: " + error.message);
        }
      }
    );
  };

  const handleDelete = () => {
    if (isDeleting) {
      deleteMutation.mutate(channel.id, {
        onSuccess: () => {
          toast.success("渠道已删除");
          setIsDeleting(false);
        },
        onError: (error) => {
          toast.error("删除失败: " + error.message);
        }
      });
    } else {
      setIsDeleting(true);
      setTimeout(() => setIsDeleting(false), 3000);
    }
  };

  const handleTest = () => {
    testMutation.mutate(channel.id, {
      onSuccess: (result) => {
        if (result.includes("发送成功")) {
          toast.success("测试成功");
        } else {
          toast.error("测试失败: " + result);
        }
      },
      onError: (error) => {
        toast.error("测试失败: " + error.message);
      }
    });
  };

  const formatLastTest = (timestamp?: number) => {
    if (!timestamp) return "未测试";
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
              {channel.enabled ? "启用" : "禁用"}
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
              上次测试: {formatLastTest(channel.last_test_at)}
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
            title="测试"
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