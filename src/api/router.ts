import { Router } from "express";
import type { JobStore } from "../storage/jobs.js";
import type { LogStore } from "../storage/logs.js";
import type { QueueManager } from "../queue/manager.js";
import type { Executor } from "../executor/types.js";
import { createJobsRouter } from "./jobs.js";
import { createQueueRouter } from "./queue.js";
import { createPromptRouter } from "./prompt.js";

export function createApiRouter(
  jobStore: JobStore,
  logStore: LogStore,
  queueManager: QueueManager,
  executor: Executor,
): Router {
  const router = Router();

  router.use("/jobs", createJobsRouter(jobStore, logStore, queueManager));
  router.use("/queue", createQueueRouter(queueManager));
  router.use("/prompt", createPromptRouter(executor));

  return router;
}
