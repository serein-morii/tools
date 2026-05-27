import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gitlabApi } from "@/lib/api/gitlab";
import type { GitLabConfig } from "@/types";

const gitlabKeys = {
  config: ["gitlab-config"] as const,
  history: ["gitlab-history"] as const,
  configured: ["gitlab-configured"] as const,
};

export function useGitLabConfig() {
  return useQuery({
    queryKey: gitlabKeys.config,
    queryFn: gitlabApi.getConfig,
  });
}

export function useGitLabConfigured() {
  return useQuery({
    queryKey: gitlabKeys.configured,
    queryFn: gitlabApi.isConfigured,
  });
}

export function useSaveGitLabConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: GitLabConfig) => gitlabApi.saveConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gitlabKeys.config });
      queryClient.invalidateQueries({ queryKey: gitlabKeys.configured });
    },
  });
}

export function useTestGitLabConnection() {
  return useMutation({
    mutationFn: (config: GitLabConfig) => gitlabApi.testConnection(config),
  });
}

export function useTriggerGitLabScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scanType: string) => gitlabApi.triggerScan(scanType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gitlabKeys.history });
    },
  });
}

export function useGitLabScanHistory(limit?: number) {
  return useQuery({
    queryKey: [...gitlabKeys.history, limit],
    queryFn: () => gitlabApi.getScanHistory(limit),
  });
}

export function useGitLabScanDetail(id: string) {
  return useQuery({
    queryKey: [...gitlabKeys.history, id],
    queryFn: () => gitlabApi.getScanDetail(id),
    enabled: !!id,
  });
}

export function useDeleteGitLabScanHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => gitlabApi.deleteScanHistory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gitlabKeys.history });
    },
  });
}
