// ── Markdown serialization for tickets ──────────────────────────

export interface TicketMdMeta {
  title: string;
  column: string;
  priority: string;
  projectId?: string;
  parentId?: string;
  jobId?: string;
  sessionId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  pausedAt: string | null;
  doneAt: string | null;
}

export function serializeTicketMd(id: string, meta: TicketMdMeta, description: string): string {
  const lines = [
    `Title: ${meta.title}`,
    `Kanban Status: ${meta.column}`,
    `Priority: ${meta.priority}`,
    `Project: ${meta.projectId || ""}`,
    `Parent: ${meta.parentId || ""}`,
    `Job: ${meta.jobId || ""}`,
    `Session: ${meta.sessionId || ""}`,
    `Tags: ${meta.tags.join(", ")}`,
    `Created: ${meta.createdAt}`,
    `Updated: ${meta.updatedAt}`,
    `Started: ${meta.startedAt || ""}`,
    `Paused: ${meta.pausedAt || ""}`,
    `Done: ${meta.doneAt || ""}`,
    `Ticket ID: ${id}`,
    `========================================`,
    `Content:`,
    description || "",
  ];
  return lines.join("\n") + "\n";
}

export function deserializeTicketMd(content: string): { meta: TicketMdMeta; description: string } | null {
  try {
    const lines = content.split("\n");
    const meta: Record<string, string> = {};
    let dividerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("========================================")) {
        dividerIdx = i;
        break;
      }
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      meta[key] = value;
    }
    if (dividerIdx === -1) return null;

    let description = "";
    const contentIdx = lines.indexOf("Content:", dividerIdx);
    if (contentIdx !== -1 && contentIdx < lines.length - 1) {
      description = lines.slice(contentIdx + 1).join("\n").trim();
    }

    return {
      meta: {
        title: meta["Title"] || "Untitled",
        column: meta["Kanban Status"] || "backlog",
        priority: meta["Priority"] || "medium",
        projectId: meta["Project"] || undefined,
        parentId: meta["Parent"] || undefined,
        jobId: meta["Job"] || undefined,
        sessionId: meta["Session"] || undefined,
        tags: meta["Tags"] ? meta["Tags"].split(",").map((s) => s.trim()).filter(Boolean) : [],
        createdAt: meta["Created"] || new Date().toISOString(),
        updatedAt: meta["Updated"] || new Date().toISOString(),
        startedAt: meta["Started"] || null,
        pausedAt: meta["Paused"] || null,
        doneAt: meta["Done"] || null,
      },
      description,
    };
  } catch {
    return null;
  }
}

// ── Markdown serialization for prompts ──────────────────────────

export interface PromptMdMeta {
  title: string;
  model: string;
  projectId?: string;
  sessionId?: string;
  sessionMode?: string;
  executionMode?: string;
  tags: string[];
  status: string;
  attempt: number;
  maxRetries: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  exitCode: number | null;
}

export function serializePromptMd(id: string, meta: PromptMdMeta, content: string): string {
  const lines = [
    `Title: ${meta.title}`,
    `Model: ${meta.model || "default"}`,
    `Project: ${meta.projectId || ""}`,
    `Session: ${meta.sessionId || ""}`,
    `Session Mode: ${meta.sessionMode || ""}`,
    `Execution Mode: ${meta.executionMode || "api"}`,
    `Tags: ${meta.tags.join(", ")}`,
    `Status: ${meta.status}`,
    `Attempt: ${meta.attempt} / ${meta.maxRetries}`,
    `Created: ${meta.createdAt}`,
    `Started: ${meta.startedAt || ""}`,
    `Completed: ${meta.completedAt || ""}`,
    `Error: ${meta.error || "none"}`,
    `Exit Code: ${meta.exitCode ?? ""}`,
    `Job ID: ${id}`,
    `========================================`,
    `Content:`,
    content || "",
  ];
  return lines.join("\n") + "\n";
}

export function deserializePromptMd(content: string): { meta: PromptMdMeta; content: string } | null {
  try {
    const lines = content.split("\n");
    const meta: Record<string, string> = {};
    let dividerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("========================================")) {
        dividerIdx = i;
        break;
      }
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      meta[key] = value;
    }
    if (dividerIdx === -1) return null;

    let promptContent = "";
    const contentIdx = lines.indexOf("Content:", dividerIdx);
    if (contentIdx !== -1 && contentIdx < lines.length - 1) {
      promptContent = lines.slice(contentIdx + 1).join("\n").trim();
    }

    return {
      meta: {
        title: meta["Title"] || "Untitled",
        model: meta["Model"] || "",
        projectId: meta["Project"] || undefined,
        sessionId: meta["Session"] || undefined,
        sessionMode: meta["Session Mode"] || undefined,
        executionMode: meta["Execution Mode"] || undefined,
        tags: meta["Tags"] ? meta["Tags"].split(",").map((s) => s.trim()).filter(Boolean) : [],
        status: meta["Status"] || "pending",
        attempt: parseInt(meta["Attempt"]) || 0,
        maxRetries: parseInt(meta["Max Retries"]) || 2,
        createdAt: meta["Created"] || new Date().toISOString(),
        startedAt: meta["Started"] || null,
        completedAt: meta["Completed"] || null,
        error: meta["Error"] === "none" || !meta["Error"] ? null : meta["Error"],
        exitCode: meta["Exit Code"] ? parseInt(meta["Exit Code"]) : null,
      },
      content: promptContent,
    };
  } catch {
    return null;
  }
}
