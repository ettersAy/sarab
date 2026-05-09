import type { Response } from "express";
import type { QueueManager } from "./manager.js";
import type { Job } from "./types.js";
import type { JobStore } from "../storage/jobs.js";

interface SSEClient {
  id: string;
  res: Response;
}

export class SSEManager {
  private clients = new Map<string, SSEClient>();
  private clientCounter = 0;

  constructor(
    queueManager: QueueManager,
    private readonly jobStore: JobStore,
  ) {
    queueManager.on("job-started", (e) => this.broadcast("job-started", e.job));
    queueManager.on("job-completed", (e) => this.broadcast("job-completed", e.job));
    queueManager.on("job-failed", (e) => this.broadcast("job-failed", e.job));
    queueManager.on("job-cancelled", (e) => this.broadcast("job-cancelled", e.job));
    queueManager.on("job-retrying", (e) => this.broadcast("job-retrying", e.job));
    queueManager.on("queue-tick", () => this.broadcast("stats", this.jobStore.stats()));
  }

  addClient(res: Response): string {
    const id = String(++this.clientCounter);
    this.clients.set(id, { id, res });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(":connected\n\n");

    // Send initial stats
    const stats = this.jobStore.stats();
    res.write(`data: ${JSON.stringify({ type: "stats", payload: stats })}\n\n`);

    res.on("close", () => {
      this.clients.delete(id);
    });

    return id;
  }

  removeClient(id: string): void {
    this.clients.delete(id);
  }

  private broadcast(type: string, payload: unknown): void {
    const data = JSON.stringify({ type, payload });
    for (const client of this.clients.values()) {
      client.res.write(`data: ${data}\n\n`);
    }
  }
}
