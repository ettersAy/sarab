import type { Job } from "./types.js";
import type { JobStore } from "../storage/jobs.js";
import type { LogStore } from "../storage/logs.js";
import type { SessionStore } from "../storage/sessions.js";
import type { ProjectStore } from "../storage/projects.js";
import type { Executor } from "../executor/types.js";
import { logger } from "../logger.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { EventEmitter } from "node:events";

export type QueueEvent =
  | { type: "job-started"; job: Job }
  | { type: "job-completed"; job: Job }
  | { type: "job-failed"; job: Job }
  | { type: "job-cancelled"; job: Job }
  | { type: "job-retrying"; job: Job }
  | { type: "queue-tick" };

export class QueueManager extends EventEmitter {
  private running = false;
  private abortController: AbortController | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly jobStore: JobStore,
    private readonly logStore: LogStore,
    private readonly executor: Executor,
    private readonly pollIntervalMs: number = 5000,
    private readonly sessionStore?: SessionStore,
    private readonly projectStore?: ProjectStore,
  ) {
    super();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.abortController = new AbortController();
    this.recoverStaleJobs();
    logger.info("Queue manager started");
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.abortController?.abort();
    logger.info("Queue manager stopped");
  }

  get isRunning(): boolean {
    return this.running;
  }

  cancelJob(jobId: string): Job {
    const job = this.jobStore.get(jobId);
    if (!job) throw new NotFoundError("Job", jobId);
    if (job.status !== "pending") throw new ValidationError(`Cannot cancel job in '${job.status}' status`);
    const updated = this.jobStore.update(jobId, { status: "cancelled", completedAt: new Date().toISOString() });
    this.emit("job-cancelled", { type: "job-cancelled", job: updated });
    return updated;
  }

  retryJob(jobId: string): Job {
    const job = this.jobStore.get(jobId);
    if (!job) throw new NotFoundError("Job", jobId);
    if (job.status !== "failed" && job.status !== "cancelled") {
      throw new ValidationError(`Cannot retry job in '${job.status}' status`);
    }
    const updated = this.jobStore.update(jobId, {
      status: "pending",
      attempt: 0,
      exitCode: null,
      error: null,
      startedAt: null,
      completedAt: null,
      logFile: null,
    });
    return updated;
  }

  private recoverStaleJobs(): void {
    const stale = this.jobStore.list().filter(
      (j) => j.status === "running" || j.status === "retrying"
    );
    for (const job of stale) {
      this.jobStore.update(job.id, {
        status: "failed",
        error: "Server restarted — job was in progress",
        completedAt: new Date().toISOString(),
      });
      logger.warn(`Recovered stale job ${job.id} (was ${job.status})`);
    }
    if (stale.length > 0) {
      logger.info(`Recovered ${stale.length} stale job(s)`);
    }
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => this.tick(), this.pollIntervalMs);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    this.emit("queue-tick", { type: "queue-tick" });

    const job = this.jobStore.getNextPending();
    if (!job) {
      this.scheduleNext();
      return;
    }

    await this.processJob(job);
    this.scheduleNext();
  }

  private async processJob(job: Job): Promise<void> {
    this.jobStore.update(job.id, { status: "running", startedAt: new Date().toISOString() });
    const runningJob = this.jobStore.get(job.id)!;
    this.emit("job-started", { type: "job-started", job: runningJob });

    const logHeader = [
      `=== SARAB Job Execution ===`,
      `ID:      ${job.id}`,
      `Title:   ${job.title}`,
      `Model:   ${job.model || "default"}`,
      `Timeout: ${job.timeoutMs}ms`,
      `Retries: ${job.maxRetries}`,
      `Started: ${new Date().toISOString()}`,
      `========================================`,
      "",
    ].join("\n");
    this.logStore.write(job.id, logHeader);

    let lastOutput = "";
    const maxAttempts = job.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 60_000);
        logger.warn(`Retry ${attempt}/${job.maxRetries} for job ${job.id} (delay ${delay}ms)`);
        this.jobStore.update(job.id, { status: "retrying", attempt });
        this.emit("job-retrying", { type: "job-retrying", job: this.jobStore.get(job.id)! });
        await sleep(delay);
      }

      const attemptHeader = [
        `--- Attempt ${attempt + 1}/${maxAttempts} ---`,
        `Started: ${new Date().toISOString()}`,
        "",
      ].join("\n");
      this.logStore.write(job.id, attemptHeader);

      const execInput: Parameters<Executor["execute"]>[0] = {
        prompt: job.prompt,
        model: job.model,
        timeoutMs: job.timeoutMs,
      };

      // Resolve project cwd
      if (job.projectId && this.projectStore) {
        const project = this.projectStore.get(job.projectId);
        if (project) {
          execInput.cwd = project.rootPath;
          logger.debug(`Running from project root: ${project.rootPath}`);
        }
      }

      // Resolve session
      if (this.sessionStore) {
        if (job.sessionMode === "resume" && job.sessionId) {
          execInput.sessionId = job.sessionId;
          logger.debug(`Resuming session: ${job.sessionId}`);
        } else if (job.sessionMode === "latest" || (job.sessionMode === "resume" && !job.sessionId)) {
          const latest = this.sessionStore.getLatestForProject(job.projectId ?? null);
          if (latest) {
            execInput.sessionId = latest.sessionId;
            logger.debug(`Resuming latest session: ${latest.sessionId}`);
          }
        }
      }

      const result = await this.executor.execute(execInput);

      lastOutput = result.stdout + (result.stderr ? "\n[STDERR]\n" + result.stderr : "");

      const attemptFooter = [
        "",
        `Exit code: ${result.exitCode}`,
        `Timed out: ${result.timedOut}`,
        `Finished: ${new Date().toISOString()}`,
        "",
      ].join("\n");
      this.logStore.write(job.id, result.stdout + "\n" + attemptFooter);

      if (result.exitCode === 0) {
        const logFooter = [
          "========================================",
          `Completed: ${new Date().toISOString()}`,
          `Exit code: 0`,
        ].join("\n");
        this.logStore.write(job.id, logFooter);

        this.jobStore.update(job.id, {
          status: "completed",
          exitCode: 0,
          error: null,
          attempt,
          completedAt: new Date().toISOString(),
          logFile: this.logStore.getPath(job.id),
        });
        // Save captured session
        if (result.capturedSessionId && this.sessionStore) {
          this.sessionStore.create({
            sessionId: result.capturedSessionId,
            projectId: job.projectId ?? null,
            jobId: job.id,
            model: job.model ?? null,
          });
        }

        const completedJob = this.jobStore.get(job.id)!;
        this.emit("job-completed", { type: "job-completed", job: completedJob });
        logger.info(`Job ${job.id} completed`);
        return;
      }

      this.logStore.write(job.id, attemptFooter);

      if (!this.running) {
        this.jobStore.update(job.id, { status: "failed", error: "Queue stopped", exitCode: -1, completedAt: new Date().toISOString(), logFile: this.logStore.getPath(job.id) });
        return;
      }
    }

    this.jobStore.update(job.id, {
      status: "failed",
      exitCode: -1,
      error: `Failed after ${maxAttempts} attempts. Last output: ${lastOutput.slice(0, 500)}`,
      attempt: job.maxRetries,
      completedAt: new Date().toISOString(),
      logFile: this.logStore.getPath(job.id),
    });
    const failedJob = this.jobStore.get(job.id)!;
    this.emit("job-failed", { type: "job-failed", job: failedJob });
    logger.error(`Job ${job.id} failed after ${maxAttempts} attempts`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
