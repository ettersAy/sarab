export interface AppConfig {
  port: number;
  dataDir: string;
  claudeCmd: string;
  claudeFlags: string;
  defaultTimeoutMs: number;
  defaultIdleTimeoutMs: number;
  defaultMaxRetries: number;
  pollIntervalMs: number;
  concurrency: number;
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT || "3457", 10),
    dataDir: process.env.SARAB_DATA_DIR || "./data",
    claudeCmd: process.env.CLAUDE_CMD || "claude",
    claudeFlags: process.env.CLAUDE_FLAGS || "--dangerously-skip-permissions",
    defaultTimeoutMs: parseInt(process.env.SARAB_TIMEOUT || "0", 10),
    defaultIdleTimeoutMs: parseInt(process.env.SARAB_IDLE_TIMEOUT || "1800000", 10),
    defaultMaxRetries: parseInt(process.env.SARAB_MAX_RETRIES || "2", 10),
    pollIntervalMs: parseInt(process.env.SARAB_POLL_INTERVAL || "5000", 10),
    concurrency: parseInt(process.env.SARAB_CONCURRENCY || "1", 10),
  };
}
