import type { Executor } from "./types.js";
import type { AIProvider } from "../queue/types.js";
import { ClaudeExecutor } from "./claude.js";
import { DeepSeekExecutor } from "./deepseek.js";

export function createExecutor(provider: AIProvider): Executor {
  const apiKey = process.env[provider.apiKeyEnvVar];
  if (!apiKey && provider.type !== "claude-cli") {
    throw new Error(`API key env var '${provider.apiKeyEnvVar}' is not set`);
  }

  if (provider.type === "claude-cli") {
    return new ClaudeExecutor(
      provider.claudeCmd ?? "claude",
      provider.claudeFlags ?? "--dangerously-skip-permissions",
    );
  }

  if (provider.type === "openai-compatible") {
    return new DeepSeekExecutor(apiKey || "");
  }

  throw new Error(`Unknown provider type: ${(provider as any).type}`);
}
