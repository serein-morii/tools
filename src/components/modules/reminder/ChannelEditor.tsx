import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useChannel, useCreateChannel, useUpdateChannel } from "@/lib/query/channelQueries";
import type {
  CreateChannelRequest,
  UpdateChannelRequest,
  BarkConfig,
  FeishuConfig,
  WeComConfig,
  DingTalkConfig,
} from "@/types";

interface ChannelEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string | null;
}

const defaultBarkConfig: BarkConfig = {
  serverUrl: "https://api.day.app",
  key: "",
  sound: "bell",
  group: "Tools",
};

const defaultFeishuConfig: FeishuConfig = {
  webhookUrl: "",
  secret: "",
};

const defaultWeComConfig: WeComConfig = {
  webhookUrl: "",
};

const defaultDingTalkConfig: DingTalkConfig = {
  webhookUrl: "",
  secret: "",
};

export function ChannelEditor({ open, onOpenChange, channelId }: ChannelEditorProps) {
  const { data: existingChannel } = useChannel(channelId || "");
  const createMutation = useCreateChannel();
  const updateMutation = useUpdateChannel();

  const [name, setName] = useState("");
  const [type, setType] = useState("bark");
  const [description, setDescription] = useState("");
  const [barkConfig, setBarkConfig] = useState<BarkConfig>(defaultBarkConfig);
  const [feishuConfig, setFeishuConfig] = useState<FeishuConfig>(defaultFeishuConfig);
  const [wecomConfig, setWecomConfig] = useState<WeComConfig>(defaultWeComConfig);
  const [dingtalkConfig, setDingtalkConfig] = useState<DingTalkConfig>(defaultDingTalkConfig);

  useEffect(() => {
    if (existingChannel) {
      setName(existingChannel.name);
      setType(existingChannel.type);
      setDescription(existingChannel.description || "");
      try {
        const config = JSON.parse(existingChannel.config);
        switch (existingChannel.type) {
          case "bark":
            setBarkConfig({ ...defaultBarkConfig, ...config });
            break;
          case "feishu":
            setFeishuConfig({ ...defaultFeishuConfig, ...config });
            break;
          case "wecom":
            setWecomConfig({ ...defaultWeComConfig, ...config });
            break;
          case "dingtalk":
            setDingtalkConfig({ ...defaultDingTalkConfig, ...config });
            break;
        }
      } catch {
        // Use defaults
      }
    } else {
      setName("");
      setType("bark");
      setDescription("");
      setBarkConfig(defaultBarkConfig);
      setFeishuConfig(defaultFeishuConfig);
      setWecomConfig(defaultWeComConfig);
      setDingtalkConfig(defaultDingTalkConfig);
    }
  }, [existingChannel, open]);

  const getConfigJson = (): string => {
    switch (type) {
      case "bark":
        return JSON.stringify(barkConfig);
      case "feishu":
        return JSON.stringify(feishuConfig);
      case "wecom":
        return JSON.stringify(wecomConfig);
      case "dingtalk":
        return JSON.stringify(dingtalkConfig);
      default:
        return "{}";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    const config = getConfigJson();

    if (channelId) {
      const updateReq: UpdateChannelRequest = {
        name,
        description: description || undefined,
        config,
      };
      updateMutation.mutate(
        { id: channelId, channel: updateReq },
        {
          onSuccess: () => {
            toast.success("渠道已更新");
            onOpenChange(false);
          },
          onError: (error) => {
            toast.error("更新失败: " + error.message);
          }
        }
      );
    } else {
      const createReq: CreateChannelRequest = {
        name,
        type,
        description: description || undefined,
        config,
      };
      createMutation.mutate(createReq, {
        onSuccess: () => {
          toast.success("渠道已创建");
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error("创建失败: " + error.message);
        }
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg max-h-[85vh] translate-x-[-50%] translate-y-[-50%] bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-lg border flex flex-col">
          <div className="flex items-center justify-between p-6 pb-0">
            <Dialog.Title className="text-lg font-semibold">
              {channelId ? "编辑渠道" : "新建渠道"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">渠道名称</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如: 我的 iPhone"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">渠道类型</Label>
              <Select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={!!channelId}
              >
                <option value="bark">Bark (iOS)</option>
                <option value="feishu">飞书</option>
                <option value="wecom">企业微信</option>
                <option value="dingtalk">钉钉</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">描述 (可选)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="渠道描述"
              />
            </div>

            {/* Bark Config */}
            {type === "bark" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="barkKey">Bark Key *</Label>
                  <Input
                    id="barkKey"
                    value={barkConfig.key}
                    onChange={(e) => setBarkConfig({ ...barkConfig, key: e.target.value })}
                    placeholder="从 Bark App 获取"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="serverUrl">服务器地址</Label>
                  <Input
                    id="serverUrl"
                    value={barkConfig.serverUrl}
                    onChange={(e) => setBarkConfig({ ...barkConfig, serverUrl: e.target.value })}
                    placeholder="https://api.day.app"
                  />
                  <p className="text-xs text-muted-foreground">
                    默认使用官方服务器，可填入自建服务器地址
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="group">分组名称</Label>
                  <Input
                    id="group"
                    value={barkConfig.group}
                    onChange={(e) => setBarkConfig({ ...barkConfig, group: e.target.value })}
                    placeholder="Tools"
                  />
                </div>
              </>
            )}

            {/* Feishu Config */}
            {type === "feishu" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="feishuWebhook">Webhook 地址 *</Label>
                  <Input
                    id="feishuWebhook"
                    value={feishuConfig.webhookUrl}
                    onChange={(e) => setFeishuConfig({ ...feishuConfig, webhookUrl: e.target.value })}
                    placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    在飞书群组中添加自定义机器人获取
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="feishuSecret">签名密钥 (可选)</Label>
                  <Input
                    id="feishuSecret"
                    type="password"
                    value={feishuConfig.secret || ""}
                    onChange={(e) => setFeishuConfig({ ...feishuConfig, secret: e.target.value })}
                    placeholder="启用签名验证时填写"
                  />
                  <p className="text-xs text-muted-foreground">
                    如果机器人开启了签名验证，需要填写此密钥
                  </p>
                </div>
              </>
            )}

            {/* WeCom Config */}
            {type === "wecom" && (
              <div className="space-y-2">
                <Label htmlFor="wecomWebhook">Webhook 地址 *</Label>
                <Input
                  id="wecomWebhook"
                  value={wecomConfig.webhookUrl}
                  onChange={(e) => setWecomConfig({ ...wecomConfig, webhookUrl: e.target.value })}
                  placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                  required
                />
                <p className="text-xs text-muted-foreground">
                  在企业微信群组中添加自定义机器人获取
                </p>
              </div>
            )}

            {/* DingTalk Config */}
            {type === "dingtalk" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="dingtalkWebhook">Webhook 地址 *</Label>
                  <Input
                    id="dingtalkWebhook"
                    value={dingtalkConfig.webhookUrl}
                    onChange={(e) => setDingtalkConfig({ ...dingtalkConfig, webhookUrl: e.target.value })}
                    placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    在钉钉群组中添加自定义机器人获取
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dingtalkSecret">签名密钥 (可选)</Label>
                  <Input
                    id="dingtalkSecret"
                    type="password"
                    value={dingtalkConfig.secret || ""}
                    onChange={(e) => setDingtalkConfig({ ...dingtalkConfig, secret: e.target.value })}
                    placeholder="启用签名验证时填写"
                  />
                  <p className="text-xs text-muted-foreground">
                    如果机器人开启了签名验证，需要填写此密钥
                  </p>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t bg-background p-6 -mx-6 -mb-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}