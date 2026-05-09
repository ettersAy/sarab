import { describe, it } from "node:test";
import assert from "node:assert";
import { serializeTicketMd, deserializeTicketMd, serializePromptMd, deserializePromptMd } from "../../src/storage/md-serializer.js";

const ticketMeta = {
  title: "Fix login button",
  column: "in-progress",
  priority: "high",
  projectId: "abc12345",
  parentId: "def67890",
  jobId: "job001",
  sessionId: "cls_xyz",
  tags: ["bug", "ui"],
  createdAt: "2026-05-09T12:00:00.000Z",
  updatedAt: "2026-05-09T12:30:00.000Z",
  startedAt: "2026-05-09T12:10:00.000Z",
  pausedAt: null,
  doneAt: null,
};

describe("serializeTicketMd", () => {
  it("includes all metadata fields", () => {
    const md = serializeTicketMd("ticket1", ticketMeta, "The button is broken");
    assert.ok(md.includes("Title: Fix login button"));
    assert.ok(md.includes("Kanban Status: in-progress"));
    assert.ok(md.includes("Parent: def67890"));
    assert.ok(md.includes("Ticket ID: ticket1"));
    assert.ok(md.includes("The button is broken"));
  });

  it("handles empty description", () => {
    const md = serializeTicketMd("t1", { ...ticketMeta, tags: [] }, "");
    assert.ok(md.includes("Content:\n"));
  });
});

describe("deserializeTicketMd", () => {
  it("roundtrips correctly", () => {
    const md = serializeTicketMd("ticket1", ticketMeta, "Test description");
    const parsed = deserializeTicketMd(md);
    assert.ok(parsed !== null);
    if (parsed) {
      assert.strictEqual(parsed.meta.title, "Fix login button");
      assert.strictEqual(parsed.meta.column, "in-progress");
      assert.strictEqual(parsed.meta.parentId, "def67890");
      assert.deepStrictEqual(parsed.meta.tags, ["bug", "ui"]);
      assert.strictEqual(parsed.description, "Test description");
    }
  });

  it("returns null for malformed input", () => {
    assert.strictEqual(deserializeTicketMd("not valid"), null);
    assert.strictEqual(deserializeTicketMd(""), null);
  });

  it("uses defaults for missing fields", () => {
    const md = `Title: Test
Kanban Status: backlog
Priority: medium
========================================
Content:
hello`;
    const parsed = deserializeTicketMd(md);
    assert.ok(parsed !== null);
    if (parsed) {
      assert.strictEqual(parsed.meta.title, "Test");
      assert.strictEqual(parsed.meta.column, "backlog");
      assert.deepStrictEqual(parsed.meta.tags, []);
    }
  });
});

describe("serializePromptMd / deserializePromptMd", () => {
  const promptMeta = {
    title: "Upgrade deps",
    model: "claude-sonnet-4-6",
    projectId: "proj1",
    sessionId: "cls_abc",
    sessionMode: "resume",
    executionMode: "api",
    tags: ["refactor"],
    status: "completed",
    attempt: 1,
    maxRetries: 3,
    createdAt: "2026-05-09T09:00:00.000Z",
    startedAt: "2026-05-09T09:01:00.000Z",
    completedAt: "2026-05-09T09:15:00.000Z",
    error: null,
    exitCode: 0,
  };

  it("roundtrips prompt correctly", () => {
    const md = serializePromptMd("job1", promptMeta, "Upgrade all deps");
    const parsed = deserializePromptMd(md);
    assert.ok(parsed !== null);
    if (parsed) {
      assert.strictEqual(parsed.meta.title, "Upgrade deps");
      assert.strictEqual(parsed.meta.status, "completed");
      assert.strictEqual(parsed.meta.exitCode, 0);
      assert.strictEqual(parsed.content, "Upgrade all deps");
    }
  });

  it("handles error field", () => {
    const md = serializePromptMd("j1", { ...promptMeta, error: "timeout", exitCode: 124 }, "");
    const parsed = deserializePromptMd(md);
    assert.ok(parsed !== null);
    if (parsed) {
      assert.strictEqual(parsed.meta.error, "timeout");
      assert.strictEqual(parsed.meta.exitCode, 124);
    }
  });
});
