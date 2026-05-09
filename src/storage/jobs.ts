import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { Job, JobCreateInput, QueueStats } from "../queue/types.js";
import { v4 as uuid } from "uuid";
import { logger } from "../logger.js";
import { NotFoundError } from "../errors.js";

export class JobStore {
  private filePath: string;

  constructor(
    dataDir: string,
    private readonly defaultTimeoutMs: number = 600_000,
    private readonly defaultMaxRetries: number = 2,
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, "jobs.jsonl");
  }

  list(): Job[] {
    if (!existsSync(this.filePath)) return [];
    const raw = readFileSync(this.filePath, "utf-8").trim();
    if (!raw) return [];
    return raw.split("\n").map((line) => JSON.parse(line) as Job);
  }

  get(id: string): Job | undefined {
    return this.list().find((j) => j.id === id);
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
      logFile: null,
      tags: input.tags ?? [],
      projectId: input.projectId,
      sessionId: input.sessionId,
      sessionMode: input.sessionMode,
    };
    this.append(job);
    logger.info(`Job created: ${job.id} — "${job.title}"`);
    return job;
  }

  update(id: string, patch: Partial<Job>): Job {
    const jobs = this.list();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) throw new NotFoundError("Job", id);
    jobs[idx] = { ...jobs[idx], ...patch };
    this.writeAll(jobs);
    return jobs[idx];
  }

  delete(id: string): void {
    const jobs = this.list().filter((j) => j.id !== id);
    this.writeAll(jobs);
  }

  stats(): QueueStats {
    const jobs = this.list();
    return {
      pending: jobs.filter((j) => j.status === "pending").length,
      running: jobs.filter((j) => j.status === "running").length,
      completed: jobs.filter((j) => j.status === "completed").length,
      failed: jobs.filter((j) => j.status === "failed").length,
      cancelled: jobs.filter((j) => j.status === "cancelled").length,
      total: jobs.length,
    };
  }

  getNextPending(): Job | undefined {
    return this.list().find((j) => j.status === "pending");
  }

  private append(job: Job): void {
    const line = JSON.stringify(job) + "\n";
    writeFileSync(this.filePath, line, { flag: "a" });
  }

  private writeAll(jobs: Job[]): void {
    const content = jobs.map((j) => JSON.stringify(j)).join("\n") + (jobs.length ? "\n" : "");
    const tmp = `${this.filePath}.${uuid().slice(0, 8)}.tmp`;
    writeFileSync(tmp, content);
    renameSync(tmp, this.filePath);
  }
}
