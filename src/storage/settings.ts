import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AppSettings } from "../queue/types.js";
import { logger } from "../logger.js";

const DEFAULT_SETTINGS: AppSettings = {
  providers: [
    {
      id: "claude-cli-default",
      name: "Claude CLI",
      type: "claude-cli",
      apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN",
      defaultModel: "claude-sonnet-4-6",
      enabled: true,
      isDefault: true,
      claudeCmd: "claude",
      claudeFlags: "--dangerously-skip-permissions",
    },
  ],
  defaultProviderId: "claude-cli-default",
  executionDefaults: {
    timeoutMs: 0,           // No hard timeout by default
    idleTimeoutMs: 1_800_000, // 30 min idle timeout
    maxRetries: 2,
  },
  promptImprovement: {
    providerId: "claude-cli-default",
    model: "claude-sonnet-4-6",
  },
};

export class SettingsStore {
  private filePath: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, "settings.json");
  }

  load(): AppSettings {
    if (!existsSync(this.filePath)) return { ...DEFAULT_SETTINGS };
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const saved = JSON.parse(raw);
      // Deep-merge executionDefaults so new defaults fill missing keys
      const settings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...saved,
        executionDefaults: {
          ...DEFAULT_SETTINGS.executionDefaults,
          ...(saved.executionDefaults || {}),
        },
        promptImprovement: {
          ...DEFAULT_SETTINGS.promptImprovement,
          ...(saved.promptImprovement || {}),
        },
      };
      // Fallback: if defaultProviderId is stale, reset to first enabled provider
      if (settings.providers.length > 0 && !settings.providers.find((p) => p.id === settings.defaultProviderId)) {
        const fallback = settings.providers.find((p) => p.enabled !== false) ?? settings.providers[0];
        settings.defaultProviderId = fallback.id;
        fallback.isDefault = true;
        logger.warn(`defaultProviderId was stale — reset to ${fallback.id}`);
      }
      return settings;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  save(settings: AppSettings): void {
    writeFileSync(this.filePath, JSON.stringify(settings, null, 2));
  }
}
