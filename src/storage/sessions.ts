import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Session } from "../queue/types.js";
import { v4 as uuid } from "uuid";
import { logger } from "../logger.js";

export class SessionStore {
  private filePath: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, "sessions.jsonl");
  }

  list(): Session[] {
    if (!existsSync(this.filePath)) return [];
    const raw = readFileSync(this.filePath, "utf-8").trim();
    if (!raw) return [];
    return raw.split("\n").map((line) => JSON.parse(line) as Session);
  }

  get(id: string): Session | undefined {
    return this.list().find((s) => s.id === id);
  }

  create(session: Omit<Session, "id" | "createdAt">): Session {
    const s: Session = {
      id: uuid().slice(0, 8),
      ...session,
      createdAt: new Date().toISOString(),
    };
    const line = JSON.stringify(s) + "\n";
    writeFileSync(this.filePath, line, { flag: "a" });
    logger.debug(`Session saved: ${s.sessionId} (job ${s.jobId})`);
    return s;
  }

  listForProject(projectId: string): Session[] {
    return this.list().filter((s) => s.projectId === projectId);
  }

  getLatestForProject(projectId: string | null): Session | undefined {
    const sessions = projectId ? this.listForProject(projectId) : this.list().filter((s) => s.projectId === null);
    if (sessions.length === 0) return undefined;
    return sessions.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
  }
}
