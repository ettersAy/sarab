import { Router } from "express";
import type { JobStore } from "../storage/jobs.js";
import type { LogStore } from "../storage/logs.js";
import type { QueueManager } from "../queue/manager.js";
import { ValidationError, NotFoundError } from "../errors.js";

const VALID_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-4-20250501",
]);

export function createJobsRouter(jobStore: JobStore, logStore: LogStore, queueManager: QueueManager): Router {
  const router = Router();

  // List all jobs
  router.get("/", (_req, res) => {
    const jobs = jobStore.list();
    // Sort: newest first
    jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(jobs);
  });

  // Get stats
  router.get("/stats", (_req, res) => {
    res.json(jobStore.stats());
  });

  // Get single job
  router.get("/:id", (req, res) => {
    const job = jobStore.get(req.params.id);
    if (!job) throw new NotFoundError("Job", req.params.id);
    res.json(job);
  });

  // Create job
  router.post("/", (req, res) => {
    const { title, prompt, model, timeoutMs, maxRetries, tags } = req.body;
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      throw new ValidationError("Title is required");
    }
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      throw new ValidationError("Prompt is required");
    }
    if (model && !VALID_MODELS.has(model)) {
      throw new ValidationError(`Invalid model: ${model}`);
    }
    const job = jobStore.create({
      title: title.trim(),
      prompt: prompt.trim(),
      model,
      timeoutMs,
      maxRetries,
      tags,
    });
    res.status(201).json(job);
  });

  // Cancel job
  router.post("/:id/cancel", (req, res) => {
    const job = queueManager.cancelJob(req.params.id);
    res.json(job);
  });

  // Retry job
  router.post("/:id/retry", (req, res) => {
    const job = queueManager.retryJob(req.params.id);
    res.json(job);
  });

  // Delete job
  router.delete("/:id", (req, res) => {
    const job = jobStore.get(req.params.id);
    if (!job) throw new NotFoundError("Job", req.params.id);
    if (job.status === "running" || job.status === "retrying") {
      throw new ValidationError("Cannot delete a running job");
    }
    logStore.delete(req.params.id);
    jobStore.delete(req.params.id);
    res.json({ deleted: true });
  });

  // Get job log
  router.get("/:id/log", (req, res) => {
    const job = jobStore.get(req.params.id);
    if (!job) throw new NotFoundError("Job", req.params.id);
    const log = logStore.read(req.params.id);
    res.json({ jobId: job.id, content: log });
  });

  return router;
}
