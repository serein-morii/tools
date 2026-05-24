import { call } from "./index";
import type { Channel, CreateChannelRequest, UpdateChannelRequest } from "@/types";

export const channelApi = {
  getAll: (): Promise<Channel[]> => call<Channel[]>("get_channels"),

  getById: (id: string): Promise<Channel> => call<Channel>("get_channel", { id }),

  create: (channel: CreateChannelRequest): Promise<Channel> =>
    call<Channel>("create_channel", { channel }),

  update: (id: string, channel: UpdateChannelRequest): Promise<Channel> =>
    call<Channel>("update_channel", { id, channel }),

  delete: (id: string): Promise<void> => call<void>("delete_channel", { id }),

  test: (id: string): Promise<string> => call<string>("test_channel_cmd", { id }),
};