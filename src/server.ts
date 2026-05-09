import express from "express";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadConfig } from "./config.js";
import { logger, setLogFile } from "./logger.js";
import { AppError } from "./errors.js";
import { JobStore } from "./storage/jobs.js";
import { LogStore } from "./storage/logs.js";
import { ProjectStore } from "./storage/projects.js";
import { SessionStore } from "./storage/sessions.js";
import { SettingsStore } from "./storage/settings.js";
import { TicketStore } from "./storage/tickets.js";
import { ClaudeExecutor } from "./executor/claude.js";
import { createExecutor } from "./executor/factory.js";
import type { Executor } from "./executor/types.js";
import { QueueManager } from "./queue/manager.js";
import { SSEManager } from "./queue/sse.js";
import { createApiRouter } from "./api/router.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const config = loadConfig();
setLogFile(config.dataDir);

// Storage
const jobStore = new JobStore(config.dataDir, config.defaultTimeoutMs, config.defaultMaxRetries);
const logStore = new LogStore(config.dataDir);
const projectStore = new ProjectStore(config.dataDir);
const sessionStore = new SessionStore(config.dataDir);
const settingsStore = new SettingsStore(config.dataDir);
const ticketStore = new TicketStore(config.dataDir);

// Executor — use settings when available, fall back to env config
const settings = settingsStore.load();
const defaultProvider = settings.providers.find((p) => p.isDefault) ?? settings.providers[0];
const executor = defaultProvider
  ? createExecutor(defaultProvider)
  : new ClaudeExecutor(config.claudeCmd, config.claudeFlags);

// Prompt improvement executor from settings
const piProviderId = settings.promptImprovement?.providerId;
const piProvider = piProviderId
  ? settings.providers.find((p) => p.id === piProviderId)
  : defaultProvider;
const promptExecutor: Executor | undefined = piProvider
  ? createExecutor(piProvider)
  : executor;

// Queue
const queueManager = new QueueManager(jobStore, logStore, executor, config.pollIntervalMs, sessionStore, projectStore, config.concurrency);

// SSE
const sseManager = new SSEManager(queueManager, jobStore);

// Express
const app = express();
app.use(express.json({ limit: "1mb" }));

// Serve static web UI
const webDir = join(__dirname, "web");
app.use(express.static(webDir));

// API routes
app.use("/api", createApiRouter(jobStore, logStore, queueManager, executor, projectStore, sessionStore, settingsStore, ticketStore, promptExecutor));

// SSE endpoint
app.get("/api/events", (req, res) => {
  sseManager.addClient(res);
});

// Health
app.get("/health", (_req, res) => {
  const claude = spawnSync(config.claudeCmd, ["--version"], { timeout: 5000 });
  res.json({
    status: "ok",
    uptime: process.uptime(),
    claude: claude.status === 0 ? "available" : "unavailable",
  });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(err.toJSON());
  } else {
    logger.error("Unhandled error:", err.message);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Internal server error" });
  }
});

// Start
app.listen(config.port, () => {
  logger.info(`SARAB listening on http://localhost:${config.port}`);
  logger.info(`Data dir: ${config.dataDir}`);
  queueManager.start();
});

// Graceful shutdown
async function shutdown(signal: string) {
  logger.warn(`Received ${signal} — shutting down...`);
  await queueManager.stop();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
