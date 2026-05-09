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

  // List all jobs (with optional pagination)
  router.get("/", (req, res) => {
    let jobs = jobStore.list();
    jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = jobs.length;
    const limit = parseInt(req.query.limit as string) || 0;
    const offset = parseInt(req.query.offset as string) || 0;
    if (limit > 0) {
      jobs = jobs.slice(offset, offset + limit);
    }
    res.json(limit > 0 ? { jobs, total, limit, offset } : jobs);
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
    const { title, prompt, model, timeoutMs, maxRetries, tags, projectId, sessionId, sessionMode } = req.body;
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
      projectId,
      sessionId,
      sessionMode,
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

  // Edit job
  router.patch("/:id", (req, res) => {
    const job = jobStore.get(req.params.id);
    if (!job) throw new NotFoundError("Job", req.params.id);
    if (job.status === "running" || job.status === "retrying") {
      throw new ValidationError("Cannot edit a running job");
    }
    const { title, prompt, model, tags, timeoutMs, maxRetries } = req.body;
    const patch: Record<string, unknown> = {};
    if (title !== undefined) patch.title = title;
    if (prompt !== undefined) patch.prompt = prompt;
    if (model !== undefined) patch.model = model;
    if (tags !== undefined) patch.tags = tags;
    if (timeoutMs !== undefined) patch.timeoutMs = timeoutMs;
    if (maxRetries !== undefined) patch.maxRetries = maxRetries;
    const updated = jobStore.update(req.params.id, patch);
    res.json(updated);
  });

  // Duplicate job
  router.post("/:id/duplicate", (req, res) => {
    const original = jobStore.get(req.params.id);
    if (!original) throw new NotFoundError("Job", req.params.id);
    const duplicate = jobStore.create({
      title: `${original.title} (copy)`,
      prompt: original.prompt,
      model: original.model,
      timeoutMs: original.timeoutMs,
      maxRetries: original.maxRetries,
      tags: [...original.tags],
      projectId: original.projectId,
    });
    res.status(201).json(duplicate);
  });

  // Get job detail (with linked info)
  router.get("/:id/detail", (req, res) => {
    const job = jobStore.get(req.params.id);
    if (!job) throw new NotFoundError("Job", req.params.id);
    res.json({ job, logContent: logStore.read(req.params.id) });
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
