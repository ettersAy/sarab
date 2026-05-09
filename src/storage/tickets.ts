import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import type { Ticket, TicketCreateInput, TicketColumn } from "../queue/types.js";
import { v4 as uuid } from "uuid";
import { logger } from "../logger.js";
import { NotFoundError } from "../errors.js";
import { ticketsDir, safeFilenameWithId, getProjectsRoot, findProjectNameById } from "./fs-utils.js";
import { serializeTicketMd, deserializeTicketMd } from "./md-serializer.js";

export class TicketStore {
  private filePath: string;
  private cache = new Map<string, Ticket>();

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, "tickets.jsonl");
    this.loadCache();
    // Also try loading from markdown files
    this.loadFromMarkdown();
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

  private loadFromMarkdown(): void {
    const root = getProjectsRoot();
    if (!existsSync(root)) return;
    try {
      for (const entry of readdirSync(root)) {
        const backlogDir = join(root, entry, "tickets", "backlog");
        if (!existsSync(backlogDir)) continue;
        for (const file of readdirSync(backlogDir)) {
          if (!file.endsWith(".md")) continue;
          try {
            const content = readFileSync(join(backlogDir, file), "utf-8");
            const parsed = deserializeTicketMd(content);
            if (!parsed) continue;
            // Extract ID from filename: safe-title-XXXXXXXX.md
            const idMatch = basename(file, ".md").match(/-([a-z0-9]{8})$/);
            const id = idMatch ? idMatch[1] : uuid().slice(0, 8);

            if (!this.cache.has(id)) {
              const ticket: Ticket = {
                id,
                title: parsed.meta.title,
                description: parsed.description,
                column: parsed.meta.column as TicketColumn,
                priority: parsed.meta.priority as Ticket["priority"],
                projectId: parsed.meta.projectId,
                jobId: parsed.meta.jobId,
                sessionId: parsed.meta.sessionId,
                tags: parsed.meta.tags,
                createdAt: parsed.meta.createdAt,
                updatedAt: parsed.meta.updatedAt,
                startedAt: parsed.meta.startedAt,
                pausedAt: parsed.meta.pausedAt,
                doneAt: parsed.meta.doneAt,
                parentId: undefined,
              };
              this.cache.set(ticket.id, ticket);
            }
          } catch (err) {
            logger.warn(`Skipping malformed ticket file: ${join(backlogDir, file)} — ${String(err)}`);
          }
        }
      }
    } catch {
      // No projects directory yet, that's OK
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
    this.writeMarkdown(ticket);
    logger.info(`Ticket created: ${ticket.id} — "${ticket.title}"`);
    return ticket;
  }

  update(id: string, patch: Partial<Ticket>): Ticket {
    const existing = this.cache.get(id);
    if (!existing) throw new NotFoundError("Ticket", id);
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
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

  private writeMarkdown(ticket: Ticket): void {
    if (!ticket.projectId) return;
    const projectName = findProjectNameById(ticket.projectId);
    if (!projectName) return;

    const dir = ticketsDir(projectName);
    const filename = safeFilenameWithId(ticket.title, ticket.id);
    const path = join(dir, filename);

    // Delete old markdown file if title changed
    try {
      for (const f of readdirSync(dir)) {
        if (f.endsWith(`-${ticket.id}.md`) && f !== filename) {
          unlinkSync(join(dir, f));
        }
      }
    } catch { /* ignore */ }

    const md = serializeTicketMd(ticket.id, {
      title: ticket.title,
      column: ticket.column,
      priority: ticket.priority,
      projectId: ticket.projectId,
      jobId: ticket.jobId,
      sessionId: ticket.sessionId,
      tags: ticket.tags,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      startedAt: ticket.startedAt,
      pausedAt: ticket.pausedAt,
      doneAt: ticket.doneAt,
    }, ticket.description || "");
    writeFileSync(path, md);
  }

  private deleteMarkdown(ticket: Ticket): void {
    if (!ticket.projectId) return;
    const projectName = findProjectNameById(ticket.projectId);
    if (!projectName) return;
    try {
      const dir = ticketsDir(projectName);
      if (!existsSync(dir)) return;
      for (const f of readdirSync(dir)) {
        if (f.endsWith(`-${ticket.id}.md`)) {
          unlinkSync(join(dir, f));
        }
      }
    } catch { /* ignore */ }
  }
}
