import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { X } from "lucide-react";
import { useChannel, useCreateChannel, useUpdateChannel } from "@/lib/query/channelQueries";
import type { CreateChannelRequest, UpdateChannelRequest, BarkConfig } from "@/types";

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

export function ChannelEditor({ open, onOpenChange, channelId }: ChannelEditorProps) {
  const { data: existingChannel } = useChannel(channelId || "");
  const createMutation = useCreateChannel();
  const updateMutation = useUpdateChannel();

  const [name, setName] = useState("");
  const [type, setType] = useState("bark");
  const [description, setDescription] = useState("");
  const [barkConfig, setBarkConfig] = useState<BarkConfig>(defaultBarkConfig);

  useEffect(() => {
    if (existingChannel) {
      setName(existingChannel.name);
      setType(existingChannel.type);
      setDescription(existingChannel.description || "");
      try {
        const config = JSON.parse(existingChannel.config);
        setBarkConfig({ ...defaultBarkConfig, ...config });
      } catch {
        setBarkConfig(defaultBarkConfig);
      }
    } else {
      setName("");
      setType("bark");
      setDescription("");
      setBarkConfig(defaultBarkConfig);
    }
  }, [existingChannel, open]);

  const getConfigJson = (): string => {
    if (type === "bark") {
      return JSON.stringify(barkConfig);
    }
    return "{}";
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
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-lg border">
          <Dialog.Title className="text-lg font-semibold mb-4">
            {channelId ? "编辑渠道" : "新建渠道"}
          </Dialog.Title>
          <Dialog.Close asChild>
            <button
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>

          <form onSubmit={handleSubmit} className="space-y-4">
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

            <div className="flex justify-end gap-2 pt-4">
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