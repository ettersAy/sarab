import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AppSettings } from "../queue/types.js";

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
    timeoutMs: 600_000,
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
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  save(settings: AppSettings): void {
    writeFileSync(this.filePath, JSON.stringify(settings, null, 2));
  }
}
