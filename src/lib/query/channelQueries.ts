import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { channelApi } from "@/lib/api/channel";
import type { CreateChannelRequest, UpdateChannelRequest } from "@/types";

export const channelKeys = {
  all: ["channels"] as const,
  list: () => [...channelKeys.all, "list"] as const,
  detail: (id: string) => [...channelKeys.all, "detail", id] as const,
};

export function useChannels() {
  return useQuery({
    queryKey: channelKeys.list(),
    queryFn: channelApi.getAll,
  });
}

export function useChannel(id: string) {
  return useQuery({
    queryKey: channelKeys.detail(id),
    queryFn: () => channelApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (channel: CreateChannelRequest) => channelApi.create(channel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: channelKeys.list() });
    },
  });
}

export function useUpdateChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, channel }: { id: string; channel: UpdateChannelRequest }) =>
      channelApi.update(id, channel),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: channelKeys.list() });
      queryClient.invalidateQueries({ queryKey: channelKeys.detail(id) });
    },
  });
}

export function useDeleteChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => channelApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: channelKeys.list() });
    },
  });
}

export function useTestChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => channelApi.test(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: channelKeys.list() });
    },
  });
}