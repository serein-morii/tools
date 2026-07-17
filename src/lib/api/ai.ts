import { invoke } from "@tauri-apps/api/core";

export interface AiProviderInfo {
  id: string;
  name: string;
  provider_type: "cli" | "api";
  enabled: boolean;
}

export interface AiProviderConfig {
  id: string;
  enabled: boolean;
  command: string;
  default_model: string;
  api_key: string;
  base_url: string;
  max_tokens: number;
  extra_args: string[];
}

export interface AiProvidersConfig {
  providers: AiProviderConfig[];
}

export interface AiResponse {
  output: string;
  token_count: number | null;
}

export async function listAiProviders(): Promise<AiProviderInfo[]> {
  return invoke<AiProviderInfo[]>("list_ai_providers");
}

export async function callAi(params: {
  providerId: string;
  prompt: string;
  configJson: string;
  continueSession: boolean;
}): Promise<AiResponse> {
  return invoke<AiResponse>("call_ai", {
    providerId: params.providerId,
    prompt: params.prompt,
    configJson: params.configJson,
    continueSession: params.continueSession,
  });
}

/** Derive provider type from provider ID. CLI providers end with "-cli", API providers end with "-api". */
export function getProviderType(id: string): "cli" | "api" {
  return id.endsWith("-api") ? "api" : "cli";
}

export function getDefaultProvidersConfig(): AiProvidersConfig {
  return {
    providers: [
      {
        id: "claude-cli", enabled: true,
        command: "", default_model: "",
        api_key: "", base_url: "", max_tokens: 0, extra_args: ["--permission-mode", "acceptEdits", "--disallowedTools", "Bash"],
      },
      {
        id: "codex-cli", enabled: false,
        command: "", default_model: "",
        api_key: "", base_url: "", max_tokens: 0, extra_args: [],
      },
      {
        id: "anthropic-api", enabled: false,
        command: "", default_model: "claude-sonnet-4-20250514",
        api_key: "", base_url: "https://api.anthropic.com", max_tokens: 4096, extra_args: [],
      },
      {
        id: "openai-api", enabled: false,
        command: "", default_model: "gpt-4o",
        api_key: "", base_url: "https://api.openai.com", max_tokens: 4096, extra_args: [],
      },
    ],
  };
}
