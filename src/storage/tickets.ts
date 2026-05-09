import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { Ticket, TicketCreateInput, TicketColumn } from "../queue/types.js";
import { v4 as uuid } from "uuid";
import { logger } from "../logger.js";
import { NotFoundError } from "../errors.js";

export class TicketStore {
  private filePath: string;
  private cache = new Map<string, Ticket>();

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, "tickets.jsonl");
    this.loadCache();
  }

  private loadCache(): void {
    if (!existsSync(this.filePath)) return;
    const raw = readFileSync(this.filePath, "utf-8").trim();
    if (!raw) return;
    for (const line of raw.split("\n")) {
      try {
        const t = JSON.parse(line) as Ticket;
        this.cache.set(t.id, t);
      } catch { /* skip malformed */ }
    }
  }

  list(): Ticket[] {
    return Array.from(this.cache.values());
  }

  get(id: string): Ticket | undefined {
    return this.cache.get(id);
  }

  create(input: TicketCreateInput): Ticket {
    const now = new Date().toISOString();
    const ticket: Ticket = {
      id: uuid().slice(0, 8),
      title: input.title,
      description: input.description || "",
      column: input.column || "backlog",
      priority: input.priority || "medium",
      projectId: input.projectId,
      parentId: input.parentId,
      tags: input.tags || [],
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      pausedAt: null,
      doneAt: null,
    };
    this.cache.set(ticket.id, ticket);
    this.persistOne(ticket);
    logger.info(`Ticket created: ${ticket.id} — "${ticket.title}"`);
    return ticket;
  }

  update(id: string, patch: Partial<Ticket>): Ticket {
    const existing = this.cache.get(id);
    if (!existing) throw new NotFoundError("Ticket", id);
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.cache.set(id, updated);
    this.persistAll();
    return updated;
  }

  delete(id: string): void {
    this.cache.delete(id);
    this.persistAll();
  }

  moveToColumn(id: string, column: TicketColumn): Ticket {
    const existing = this.cache.get(id);
    if (!existing) throw new NotFoundError("Ticket", id);
    const now = new Date().toISOString();
    const patch: Partial<Ticket> = { column, updatedAt: now };
    if (column === "done") patch.doneAt = now;
    if (column === "paused") patch.pausedAt = now;
    if (column === "in-progress" && !existing.startedAt) patch.startedAt = now;
    return this.update(id, patch);
  }

  getSubtickets(parentId: string): Ticket[] {
    return this.list().filter((t) => t.parentId === parentId);
  }

  private persistOne(t: Ticket): void {
    writeFileSync(this.filePath, JSON.stringify(t) + "\n", { flag: "a" });
  }

  private persistAll(): void {
    const tickets = Array.from(this.cache.values());
    const content = tickets.map((t) => JSON.stringify(t)).join("\n") + (tickets.length ? "\n" : "");
    const tmp = `${this.filePath}.${uuid().slice(0, 8)}.tmp`;
    writeFileSync(tmp, content);
    renameSync(tmp, this.filePath);
  }
}
