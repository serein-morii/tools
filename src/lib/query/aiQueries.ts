import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAiProviders, getDefaultProvidersConfig, type AiProvidersConfig, type AiProviderConfig } from "@/lib/api/ai";
import { useSettings, getSettingValue, useUpdateSetting } from "@/lib/query/settingsQueries";

/**
 * On first load, migrate old ai_summary_* settings to new ai_providers_config format.
 * This runs once when settings are loaded.
 */
export function useMigrateAiSettings() {
  const { data: settings } = useSettings();
  const updateSetting = useUpdateSetting();
  const migratedKey = "ai_settings_migrated";

  useEffect(() => {
    if (!settings) return;
    const migrated = getSettingValue(settings, migratedKey, "false");
    if (migrated === "true") return;

    // Check if new config already exists
    const existing = getSettingValue(settings, "ai_providers_config", "");
    if (existing) {
      updateSetting.mutate({ key: migratedKey, value: "true" });
      return;
    }

    // Get old settings
    const oldMethod = getSettingValue(settings, "ai_summary_method", "");
    const oldTool = getSettingValue(settings, "ai_summary_tool", "");
    const oldProvider = getSettingValue(settings, "ai_summary_provider", "");
    const oldApiKey = getSettingValue(settings, "ai_summary_api_key", "");
    const oldModel = getSettingValue(settings, "ai_summary_model", "");

    // Build new config from old settings
    const defaultConfig = getDefaultProvidersConfig();

    // If they used API mode, pre-configure the API provider
    if (oldMethod === "api" && oldProvider && oldApiKey) {
      const provider = defaultConfig.providers.find(
        (p) => p.id === `${oldProvider}-api`
      );
      if (provider) {
        provider.enabled = true;
        provider.api_key = oldApiKey;
        if (oldModel) provider.default_model = oldModel;
      }
    }

    // If they used CLI mode, ensure the CLI provider is enabled and default
    if (oldMethod === "cli" && oldTool) {
      const cliProvider = defaultConfig.providers.find(
        (p) => p.id === `${oldTool}-cli`
      );
      if (cliProvider) {
        cliProvider.enabled = true;
      }
      updateSetting.mutate({
        key: "ai_default_provider",
        value: `${oldTool}-cli`,
      });
    }

    updateSetting.mutate({
      key: "ai_providers_config",
      value: JSON.stringify(defaultConfig),
    });
    updateSetting.mutate({ key: migratedKey, value: "true" });
  }, [settings]);
}

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
