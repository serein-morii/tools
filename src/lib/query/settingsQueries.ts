import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api/settings";
import type { Settings, UpdateSettingRequest } from "@/types";

export const settingsKeys = {
  all: ["settings"] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: settingsApi.getAll,
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateSettingRequest) => settingsApi.update(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

export function getSettingValue(settings: Settings[] | undefined, key: string, fallback: string) {
  return settings?.find((setting) => setting.key === key)?.value ?? fallback;
}
