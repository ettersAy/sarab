import { Router } from "express";
import type { JobStore } from "../storage/jobs.js";
import type { LogStore } from "../storage/logs.js";
import type { ProjectStore } from "../storage/projects.js";
import type { SessionStore } from "../storage/sessions.js";
import type { SettingsStore } from "../storage/settings.js";
import type { TicketStore } from "../storage/tickets.js";
import type { ChatStore } from "../storage/chatbot.js";
import type { QueueManager } from "../queue/manager.js";
import type { Executor } from "../executor/types.js";
import { createJobsRouter } from "./jobs.js";
import { createQueueRouter } from "./queue.js";
import { createPromptRouter } from "./prompt.js";
import { createSessionsRouter } from "./sessions.js";
import { createProjectsRouter } from "./projects.js";
import { createSettingsRouter } from "./settings.js";
import { createTicketsRouter } from "./tickets.js";
import { createChatbotRouter } from "./chatbot.js";

export function createApiRouter(
  jobStore: JobStore,
  logStore: LogStore,
  queueManager: QueueManager,
  executor: Executor,
  projectStore: ProjectStore,
  sessionStore: SessionStore,
  settingsStore: SettingsStore,
  ticketStore: TicketStore,
  chatStore: ChatStore,
  promptExecutor?: Executor,
): Router {
  const router = Router();

  router.use("/jobs", createJobsRouter(jobStore, logStore, queueManager));
  router.use("/queue", createQueueRouter(queueManager));
  router.use("/prompt", createPromptRouter(promptExecutor ?? executor));
  router.use("/sessions", createSessionsRouter(sessionStore));
  router.use("/projects", createProjectsRouter(projectStore, jobStore, sessionStore));
  router.use("/settings", createSettingsRouter(settingsStore));
  router.use("/tickets", createTicketsRouter(ticketStore));
  router.use("/chatbot", createChatbotRouter(chatStore, projectStore, settingsStore, executor));

  return router;
}
