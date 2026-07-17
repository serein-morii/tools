import { useQuery } from "@tanstack/react-query";
import { listAiProviders, getDefaultProvidersConfig, type AiProvidersConfig, type AiProviderConfig } from "@/lib/api/ai";
import { useSettings, getSettingValue, useUpdateSetting } from "@/lib/query/settingsQueries";

export function useAiProviders() {
  return useQuery({
    queryKey: ["ai-providers"],
    queryFn: listAiProviders,
    staleTime: 60_000,
  });
}

export function useAiProvidersConfig(): AiProvidersConfig {
  const { data: settings } = useSettings();
  const raw = getSettingValue(settings, "ai_providers_config", "");
  if (!raw) return getDefaultProvidersConfig();
  try {
    return JSON.parse(raw) as AiProvidersConfig;
  } catch {
    return getDefaultProvidersConfig();
  }
}

export function getProviderConfig(config: AiProvidersConfig, providerId: string): AiProviderConfig | undefined {
  return config.providers.find((p) => p.id === providerId);
}

export function getEnabledProviders(config: AiProvidersConfig): AiProviderConfig[] {
  return config.providers.filter((p) => p.enabled);
}

export function useDefaultProviderId(): string {
  const { data: settings } = useSettings();
  return getSettingValue(settings, "ai_default_provider", "claude-cli");
}

export function useSaveAiProvidersConfig() {
  const updateSetting = useUpdateSetting();
  return (config: AiProvidersConfig) => {
    updateSetting.mutate({ key: "ai_providers_config", value: JSON.stringify(config) });
  };
}

export function useSaveDefaultProvider() {
  const updateSetting = useUpdateSetting();
  return (providerId: string) => {
    updateSetting.mutate({ key: "ai_default_provider", value: providerId });
  };
}
