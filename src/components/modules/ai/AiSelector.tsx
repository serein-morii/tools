import { useEffect, type FC } from "react";
import {
  useAiProvidersConfig,
  useDefaultProviderId,
  getEnabledProviders,
  getProviderConfig,
} from "@/lib/query/aiQueries";
import type { AiProviderConfig } from "@/lib/api/ai";

/** Derive provider type from provider ID. CLI providers end with "-cli", API providers end with "-api". */
function getProviderType(id: string): "cli" | "api" {
  return id.endsWith("-api") ? "api" : "cli";
}

interface AiSelectorProps {
  value: AiProviderConfig;
  onChange: (config: AiProviderConfig) => void;
  showModel?: boolean;
}

export const AiSelector: FC<AiSelectorProps> = ({ value, onChange, showModel = true }) => {
  const config = useAiProvidersConfig();
  const defaultId = useDefaultProviderId();
  const providers = getEnabledProviders(config);

  // Initialize from default if no value set
  useEffect(() => {
    if (!value?.id) {
      const def = getProviderConfig(config, defaultId) || providers[0];
      if (def) onChange(def);
    }
  }, []);

  const handleProviderChange = (id: string) => {
    const p = getProviderConfig(config, id);
    if (p) onChange(p);
  };

  const handleModelChange = (model: string) => {
    onChange({ ...value, default_model: model });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={value?.id || ""}
        onChange={(e) => handleProviderChange(e.target.value)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs min-w-[140px]"
      >
        {providers.length === 0 && <option value="">无可用 AI</option>}
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id === defaultId ? "★ " : ""}{p.id}
          </option>
        ))}
      </select>
      {showModel && getProviderType(value.id) === "api" && (
        <input
          type="text"
          placeholder="模型名"
          value={value.default_model || ""}
          onChange={(e) => handleModelChange(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs w-[160px]"
        />
      )}
      {showModel && getProviderType(value.id) === "cli" && value.id !== "claude-cli" && (
        <input
          type="text"
          placeholder="模型名 (可选)"
          value={value.default_model || ""}
          onChange={(e) => handleModelChange(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs w-[140px]"
        />
      )}
    </div>
  );
};
