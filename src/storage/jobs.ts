import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Job, JobCreateInput, QueueStats } from "../queue/types.js";
import { v4 as uuid } from "uuid";
import { logger } from "../logger.js";
import { NotFoundError } from "../errors.js";
import { promptsDir, safeFilenameWithId, getProjectsRoot, findProjectNameById } from "./fs-utils.js";
import { serializePromptMd, deserializePromptMd } from "./md-serializer.js";

export class JobStore {
  private filePath: string;
  private cache = new Map<string, Job>();

  constructor(
    dataDir: string,
    private readonly defaultTimeoutMs: number = 600_000,
    private readonly defaultMaxRetries: number = 2,
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, "jobs.jsonl");
    this.loadCache();
    this.loadFromMarkdown();
  }

  private loadCache(): void {
    if (!existsSync(this.filePath)) return;
    const raw = readFileSync(this.filePath, "utf-8").trim();
    if (!raw) return;
    for (const line of raw.split("\n")) {
      try {
        const job = JSON.parse(line) as Job;
        this.cache.set(job.id, job);
      } catch { /* skip malformed lines */ }
    }
  }

  private loadFromMarkdown(): void {
    const root = getProjectsRoot();
    if (!existsSync(root)) return;
    try {
      for (const entry of readdirSync(root)) {
        const promptsDir = join(root, entry, "prompts");
        if (!existsSync(promptsDir)) continue;
        for (const file of readdirSync(promptsDir)) {
          if (!file.endsWith(".md")) continue;
          try {
            const content = readFileSync(join(promptsDir, file), "utf-8");
            const parsed = deserializePromptMd(content);
            if (!parsed) continue;
            const id = parsed.meta.title ? undefined : undefined;
            // Extract ID from filename
            const match = file.match(/-([a-z0-9]{8})\.md$/);
            const jobId = match ? match[1] : undefined;
            if (!jobId || this.cache.has(jobId)) continue;

            const job: Job = {
              id: jobId,
              title: parsed.meta.title,
              prompt: parsed.content,
              model: parsed.meta.model || undefined,
              status: parsed.meta.status as Job["status"],
              timeoutMs: this.defaultTimeoutMs,
              maxRetries: parsed.meta.maxRetries,
              attempt: parsed.meta.attempt,
              exitCode: parsed.meta.exitCode,
              error: parsed.meta.error,
              createdAt: parsed.meta.createdAt,
              startedAt: parsed.meta.startedAt,
              completedAt: parsed.meta.completedAt,
              stoppedAt: null,
              logFile: null,
              tags: parsed.meta.tags,
              projectId: parsed.meta.projectId,
              sessionId: parsed.meta.sessionId,
              sessionMode: parsed.meta.sessionMode as Job["sessionMode"],
              executionMode: parsed.meta.executionMode as Job["executionMode"],
              promptFile: undefined,
              resumedFrom: undefined,
            };
            this.cache.set(job.id, job);
          } catch (err) {
            logger.warn(`Skipping malformed prompt file: ${join(promptsDir, file)} — ${String(err)}`);
          }
        }
      }
    } catch {
      // No projects directory yet
    }
  }

  list(): Job[] {
    return Array.from(this.cache.values());
  }

  get(id: string): Job | undefined {
    return this.cache.get(id);
  }

  create(input: JobCreateInput): Job {
    const job: Job = {
      id: uuid().slice(0, 8),
      title: input.title,
      prompt: input.prompt,
      model: input.model,
      status: "pending",
      timeoutMs: input.timeoutMs ?? this.defaultTimeoutMs,
      maxRetries: input.maxRetries ?? this.defaultMaxRetries,
      attempt: 0,
      exitCode: null,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      stoppedAt: null,
      logFile: null,
      tags: input.tags ?? [],
      projectId: input.projectId,
      sessionId: input.sessionId,
      sessionMode: input.sessionMode,
      executionMode: input.executionMode,
      promptFile: input.promptFile,
      resumedFrom: undefined,
    };
    this.cache.set(job.id, job);
    this.persistOne(job);
    this.writeMarkdown(job);
    logger.info(`Job created: ${job.id} — "${job.title}"`);
    return job;
  }

  update(id: string, patch: Partial<Job>): Job {
    const existing = this.cache.get(id);
    if (!existing) throw new NotFoundError("Job", id);
    const updated = { ...existing, ...patch };
    this.cache.set(id, updated);
    this.persistAll();
    this.writeMarkdown(updated);
    return updated;
  }

  delete(id: string): void {
    const existing = this.cache.get(id);
    if (existing) {
      this.deleteMarkdown(existing);
    }
    this.cache.delete(id);
    this.persistAll();
  }

  stats(): QueueStats {
    let pending = 0, running = 0, completed = 0, failed = 0, cancelled = 0, stopped = 0;
    for (const j of this.cache.values()) {
      switch (j.status) {
        case "pending": pending++; break;
        case "running": running++; break;
        case "completed": completed++; break;
        case "failed": failed++; break;
        case "cancelled": cancelled++; break;
        case "stopped": stopped++; break;
      }
    }
    return { pending, running, completed, failed, cancelled, stopped, total: this.cache.size };
  }

  getNextPending(): Job | undefined {
    for (const j of this.cache.values()) {
      if (j.status === "pending") return j;
    }
    return undefined;
  }

  private persistOne(job: Job): void {
    const line = JSON.stringify(job) + "\n";
    writeFileSync(this.filePath, line, { flag: "a" });
  }

  private persistAll(): void {
    const jobs = Array.from(this.cache.values());
    const content = jobs.map((j) => JSON.stringify(j)).join("\n") + (jobs.length ? "\n" : "");
    const tmp = `${this.filePath}.${uuid().slice(0, 8)}.tmp`;
    writeFileSync(tmp, content);
    renameSync(tmp, this.filePath);
  }

  private writeMarkdown(job: Job): void {
    if (!job.projectId) return;
    const projectName = findProjectNameById(job.projectId);
    if (!projectName) return;

    const dir = promptsDir(projectName);
    const filename = safeFilenameWithId(job.title, job.id);
    const path = join(dir, filename);

    // Delete old markdown file if title changed
    try {
      for (const f of readdirSync(dir)) {
        if (f.endsWith(`-${job.id}.md`) && f !== filename) {
          unlinkSync(join(dir, f));
        }
      }
    } catch { /* ignore */ }

    const md = serializePromptMd(job.id, {
      title: job.title,
      model: job.model || "default",
      projectId: job.projectId,
      sessionId: job.sessionId,
      sessionMode: job.sessionMode,
      executionMode: job.executionMode,
      tags: job.tags,
      status: job.status,
      attempt: job.attempt,
      maxRetries: job.maxRetries,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      exitCode: job.exitCode,
    }, job.prompt || "");
    writeFileSync(path, md);
  }

  private deleteMarkdown(job: Job): void {
    if (!job.projectId) return;
    const projectName = findProjectNameById(job.projectId);
    if (!projectName) return;
    try {
      const dir = promptsDir(projectName);
      if (!existsSync(dir)) return;
      for (const f of readdirSync(dir)) {
        if (f.endsWith(`-${job.id}.md`)) {
          unlinkSync(join(dir, f));
        }
      }
    } catch { /* ignore */ }
  }
}
