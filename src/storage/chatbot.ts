import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { ChatConversation, ChatMessage } from "../queue/types.js";
import { v4 as uuid } from "uuid";
import { logger } from "../logger.js";
import { NotFoundError } from "../errors.js";

export class ChatStore {
  private convPath: string;
  private msgPath: string;
  private convCache = new Map<string, ChatConversation>();
  private msgCache = new Map<string, ChatMessage[]>();

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.convPath = join(dataDir, "chat-conversations.jsonl");
    this.msgPath = join(dataDir, "chat-messages.jsonl");
    this.loadCache();
  }

  private loadCache(): void {
    // Load conversations
    if (existsSync(this.convPath)) {
      const raw = readFileSync(this.convPath, "utf-8").trim();
      if (raw) {
        for (const line of raw.split("\n")) {
          try { const c = JSON.parse(line) as ChatConversation; this.convCache.set(c.id, c); }
          catch { /* skip */ }
        }
      }
    }
    // Load messages
    if (existsSync(this.msgPath)) {
      const raw = readFileSync(this.msgPath, "utf-8").trim();
      if (raw) {
        for (const line of raw.split("\n")) {
          try {
            const m = JSON.parse(line) as ChatMessage;
            const arr = this.msgCache.get(m.conversationId) || [];
            arr.push(m);
            this.msgCache.set(m.conversationId, arr);
          } catch { /* skip */ }
        }
      }
    }
  }

  // ── Conversations ──────────────────────────────────────────

  listConversations(projectId: string): ChatConversation[] {
    return Array.from(this.convCache.values())
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  getConversation(id: string): ChatConversation | undefined {
    return this.convCache.get(id);
  }

  createConversation(projectId: string, title: string, model: string): ChatConversation {
    const now = new Date().toISOString();
    const conv: ChatConversation = {
      id: uuid().slice(0, 8),
      projectId,
      title,
      model,
      createdAt: now,
      updatedAt: now,
    };
    this.convCache.set(conv.id, conv);
    this.persistConv(conv);
    logger.debug(`Chat conversation created: ${conv.id}`);
    return conv;
  }

  updateConversation(id: string): void {
    const conv = this.convCache.get(id);
    if (!conv) return;
    conv.updatedAt = new Date().toISOString();
    this.persistAllConvs();
  }

  deleteConversation(id: string): void {
    this.convCache.delete(id);
    this.msgCache.delete(id);
    this.persistAllConvs();
    this.persistAllMsgs();
  }

  // ── Messages ───────────────────────────────────────────────

  getMessages(conversationId: string): ChatMessage[] {
    return this.msgCache.get(conversationId) || [];
  }

  addMessage(msg: Omit<ChatMessage, "id" | "createdAt">): ChatMessage {
    const message: ChatMessage = {
      id: uuid().slice(0, 8),
      ...msg,
      createdAt: new Date().toISOString(),
    };
    const arr = this.msgCache.get(msg.conversationId) || [];
    arr.push(message);
    this.msgCache.set(msg.conversationId, arr);
    this.persistMsg(message);
    return message;
  }

  // ── Persistence ────────────────────────────────────────────

  private persistConv(conv: ChatConversation): void {
    writeFileSync(this.convPath, JSON.stringify(conv) + "\n", { flag: "a" });
  }

  private persistAllConvs(): void {
    const convs = Array.from(this.convCache.values());
    const content = convs.map((c) => JSON.stringify(c)).join("\n") + (convs.length ? "\n" : "");
    const tmp = `${this.convPath}.${uuid().slice(0, 8)}.tmp`;
    writeFileSync(tmp, content);
    renameSync(tmp, this.convPath);
  }

  private persistMsg(msg: ChatMessage): void {
    writeFileSync(this.msgPath, JSON.stringify(msg) + "\n", { flag: "a" });
  }

  private persistAllMsgs(): void {
    const msgs: ChatMessage[] = [];
    for (const arr of this.msgCache.values()) msgs.push(...arr);
    const content = msgs.map((m) => JSON.stringify(m)).join("\n") + (msgs.length ? "\n" : "");
    const tmp = `${this.msgPath}.${uuid().slice(0, 8)}.tmp`;
    writeFileSync(tmp, content);
    renameSync(tmp, this.msgPath);
  }
}
