import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { X } from "lucide-react";
import { useChannel, useCreateChannel, useUpdateChannel } from "@/lib/query/channelQueries";
import type {
  CreateChannelRequest,
  UpdateChannelRequest,
  BarkConfig,
  FeishuConfig,
  WeComConfig,
  DingTalkConfig,
} from "@/types";
import { useTranslation } from "react-i18next";

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
  atPhones: [],
};

export function ChannelEditor({ open, onOpenChange, channelId }: ChannelEditorProps) {
  const { data: existingChannel } = useChannel(channelId || "");
  const createMutation = useCreateChannel();
  const updateMutation = useUpdateChannel();
  const { t } = useTranslation();

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
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      const createReq: CreateChannelRequest = {
        name,
        type,
        description: description || undefined,
        config,
      };
      createMutation.mutate(createReq, { onSuccess: () => onOpenChange(false) });
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
              {channelId ? t("channel.editChannel") : t("channel.newChannel")}
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
              <Label htmlFor="name">{t("channel.channelName")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("channel.channelNamePlaceholder")}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">{t("channel.channelType")}</Label>
              <Select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={!!channelId}
              >
                <option value="bark">Bark (iOS)</option>
                <option value="feishu">{t("channel.feishu")}</option>
                <option value="wecom">{t("channel.wecom")}</option>
                <option value="dingtalk">{t("channel.dingtalk")}</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("channel.descriptionOptional")}</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("channel.descriptionPlaceholder")}
              />
            </div>

            {/* Bark Config */}
            {type === "bark" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="barkKey">{t("channel.barkKey")} *</Label>
                  <Input
                    id="barkKey"
                    value={barkConfig.key}
                    onChange={(e) => setBarkConfig({ ...barkConfig, key: e.target.value })}
                    placeholder={t("channel.barkKeyPlaceholder")}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="serverUrl">{t("channel.serverUrl")}</Label>
                  <Input
                    id="serverUrl"
                    value={barkConfig.serverUrl}
                    onChange={(e) => setBarkConfig({ ...barkConfig, serverUrl: e.target.value })}
                    placeholder="https://api.day.app"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("channel.serverUrlHint")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="group">{t("channel.groupName")}</Label>
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
                  <Label htmlFor="feishuWebhook">{t("channel.webhookUrl")} *</Label>
                  <Input
                    id="feishuWebhook"
                    value={feishuConfig.webhookUrl}
                    onChange={(e) => setFeishuConfig({ ...feishuConfig, webhookUrl: e.target.value })}
                    placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("channel.feishuWebhookHint")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="feishuSecret">{t("channel.signSecretOptional")}</Label>
                  <Input
                    id="feishuSecret"
                    type="password"
                    value={feishuConfig.secret || ""}
                    onChange={(e) => setFeishuConfig({ ...feishuConfig, secret: e.target.value })}
                    placeholder={t("channel.signSecretPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("channel.signSecretHint")}
                  </p>
                </div>
              </>
            )}

            {/* WeCom Config */}
            {type === "wecom" && (
              <div className="space-y-2">
                <Label htmlFor="wecomWebhook">{t("channel.webhookUrl")} *</Label>
                <Input
                  id="wecomWebhook"
                  value={wecomConfig.webhookUrl}
                  onChange={(e) => setWecomConfig({ ...wecomConfig, webhookUrl: e.target.value })}
                  placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {t("channel.wecomWebhookHint")}
                </p>
              </div>
            )}

            {/* DingTalk Config */}
            {type === "dingtalk" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="dingtalkWebhook">{t("channel.webhookUrl")} *</Label>
                  <Input
                    id="dingtalkWebhook"
                    value={dingtalkConfig.webhookUrl}
                    onChange={(e) => setDingtalkConfig({ ...dingtalkConfig, webhookUrl: e.target.value })}
                    placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("channel.dingtalkWebhookHint")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dingtalkSecret">{t("channel.signSecretOptional")}</Label>
                  <Input
                    id="dingtalkSecret"
                    type="password"
                    value={dingtalkConfig.secret || ""}
                    onChange={(e) => setDingtalkConfig({ ...dingtalkConfig, secret: e.target.value })}
                    placeholder={t("channel.signSecretPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("channel.signSecretHint")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dingtalkAtPhones">{t("channel.atPhonesOptional")}</Label>
                  <Input
                    id="dingtalkAtPhones"
                    value={(dingtalkConfig.atPhones || []).join(",")}
                    onChange={(e) => setDingtalkConfig({
                      ...dingtalkConfig,
                      atPhones: e.target.value.split(",").map(s => s.trim()).filter(s => s)
                    })}
                    placeholder={t("channel.atPhonesPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("channel.atPhonesHint")}
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
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? t("task.saving") : t("common.save")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}