import { Router } from "express";
import type { QueueManager } from "../queue/manager.js";

export function createQueueRouter(queueManager: QueueManager): Router {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.json({
      running: queueManager.isRunning,
    });
  });

  router.post("/pause", (_req, res) => {
    queueManager.stop();
    res.json({ running: false });
  });

  router.post("/resume", (_req, res) => {
    queueManager.start();
    res.json({ running: true });
  });

  return router;
}
