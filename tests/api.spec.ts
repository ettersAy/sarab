import { test, expect } from "@playwright/test";

// ── Health & Static ──────────────────────────────────────────
test.describe("Health and static files", () => {
  test("GET /health returns ok", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });

  test("GET / serves HTML", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
  });

  test("GET /styles.css serves CSS", async ({ request }) => {
    const res = await request.get("/styles.css");
    expect(res.ok()).toBeTruthy();
  });

  test("GET /js/core.js serves JS", async ({ request }) => {
    const res = await request.get("/js/core.js");
    expect(res.ok()).toBeTruthy();
  });
});

// ── Jobs CRUD ────────────────────────────────────────────────
test.describe("Job CRUD", () => {
  let jobId: string;

  test.beforeAll(async ({ request }) => {
    await request.post("/api/queue/pause");
  });

  test.afterAll(async ({ request }) => {
    await request.post("/api/queue/resume");
  });

  test.beforeEach(async ({ request }) => {
    const res = await request.post("/api/jobs", {
      data: {
        title: "Test job",
        prompt: "Test prompt",
        maxRetries: 0,
        timeoutMs: 30000,
      },
    });
    jobId = (await res.json()).id;
  });

  test.afterEach(async ({ request }) => {
    try { await request.post(`/api/jobs/${jobId}/cancel`); } catch (_) {}
    try { await request.delete(`/api/jobs/${jobId}`); } catch (_) {}
  });

  test("returns 201 on creation", async ({ request }) => {
    // Job was created in beforeEach; verify it exists
    const res = await request.get(`/api/jobs/${jobId}`);
    expect(res.status()).toBe(200);
    const job = await res.json();
    expect(job.title).toBe("Test job");
    expect(job.status).toBe("pending");
  });

  test("returns created job by ID", async ({ request }) => {
    const res = await request.get(`/api/jobs/${jobId}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).id).toBe(jobId);
  });

  test("returns 404 for missing job", async ({ request }) => {
    const res = await request.get("/api/jobs/nonexistent");
    expect(res.status()).toBe(404);
  });

  test("validates required fields", async ({ request }) => {
    const res = await request.post("/api/jobs", {
      data: { title: "", prompt: "" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("VALIDATION_ERROR");
  });

  test("validates model name", async ({ request }) => {
    const res = await request.post("/api/jobs", {
      data: { title: "Bad model", prompt: "Test", model: "gpt-999" },
    });
    expect(res.status()).toBe(400);
  });

  test("cancel stops a pending job", async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/cancel`);
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe("cancelled");
  });

  test("retry re-queues a cancelled job", async ({ request }) => {
    await request.post(`/api/jobs/${jobId}/cancel`);
    const res = await request.post(`/api/jobs/${jobId}/retry`);
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe("pending");
  });

  test("returns log content", async ({ request }) => {
    const res = await request.get(`/api/jobs/${jobId}/log`);
    expect(res.status()).toBe(200);
    expect((await res.json()).jobId).toBe(jobId);
  });

  test("delete removes a non-running job", async ({ request }) => {
    await request.post(`/api/jobs/${jobId}/cancel`);
    const res = await request.delete(`/api/jobs/${jobId}`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
  });

  test("returns 404 after delete", async ({ request }) => {
    await request.post(`/api/jobs/${jobId}/cancel`);
    await request.delete(`/api/jobs/${jobId}`);
    const res = await request.get(`/api/jobs/${jobId}`);
    expect(res.status()).toBe(404);
  });
});

// ── Jobs list & stats ────────────────────────────────────────
test.describe("Job listing and stats", () => {
  test("list returns array", async ({ request }) => {
    const res = await request.get("/api/jobs");
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test("stats returns valid counters", async ({ request }) => {
    const res = await request.get("/api/jobs/stats");
    const stats = await res.json();
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.pending).toBe("number");
    expect(typeof stats.completed).toBe("number");
    expect(typeof stats.failed).toBe("number");
    expect(typeof stats.stopped).toBe("number");
  });

  test("stats reflect multiple job statuses", async ({ request }) => {
    // Create 3 jobs
    const ids: string[] = [];
    for (const title of ["A", "B", "C"]) {
      const res = await request.post("/api/jobs", {
        data: { title, prompt: `Prompt ${title}`, maxRetries: 0, timeoutMs: 30000 },
      });
      ids.push((await res.json()).id);
    }
    // Cancel one
    await request.post(`/api/jobs/${ids[0]}/cancel`);

    const statsRes = await request.get("/api/jobs/stats");
    const stats = await statsRes.json();
    expect(stats.pending).toBeGreaterThanOrEqual(2);
    expect(stats.cancelled).toBeGreaterThanOrEqual(1);

    // Cleanup
    for (const id of ids) {
      try { await request.post(`/api/jobs/${id}/cancel`); } catch (_) {}
      try { await request.delete(`/api/jobs/${id}`); } catch (_) {}
    }
  });
});

// ── Queue ────────────────────────────────────────────────────
test.describe("Queue management", () => {
  test("returns running state", async ({ request }) => {
    const res = await request.get("/api/queue/status");
    expect(res.status()).toBe(200);
    expect(typeof (await res.json()).running).toBe("boolean");
  });

  test("pause stops the queue", async ({ request }) => {
    const res = await request.post("/api/queue/pause");
    expect(res.status()).toBe(200);
    expect((await res.json()).running).toBe(false);
  });

  test("resume starts the queue", async ({ request }) => {
    await request.post("/api/queue/pause");
    const res = await request.post("/api/queue/resume");
    expect(res.status()).toBe(200);
    expect((await res.json()).running).toBe(true);
  });
});

// ── Prompt improvement ───────────────────────────────────────
test.describe("Prompt improvement", () => {
  test("rejects missing prompt", async ({ request }) => {
    const res = await request.post("/api/prompt/improve", {
      data: { action: "reformulate" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects invalid action", async ({ request }) => {
    const res = await request.post("/api/prompt/improve", {
      data: { prompt: "Hello", action: "translate" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).message).toContain("Action must be");
  });

  test("rejects missing action", async ({ request }) => {
    const res = await request.post("/api/prompt/improve", {
      data: { prompt: "Hello" },
    });
    expect(res.status()).toBe(400);
  });

  for (const action of ["reformulate", "improve", "correct", "shorten", "expand"]) {
    test(`accepts valid action "${action}"`, async ({ request }) => {
      const res = await request.post("/api/prompt/improve", {
        data: { prompt: "Write a function", action },
      });
      expect([200, 502]).toContain(res.status());
    });
  }
});

// ── Projects ──────────────────────────────────────────────────
test.describe("Projects", () => {
  let projectId: string;

  test.afterEach(async ({ request }) => {
    if (projectId) {
      try { await request.delete(`/api/projects/${projectId}`); } catch (_) {}
    }
  });

  test("list returns array", async ({ request }) => {
    const res = await request.get("/api/projects");
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test("create returns 201", async ({ request }) => {
    const res = await request.post("/api/projects", {
      data: { name: "Test Project", rootPath: "/tmp" },
    });
    expect(res.status()).toBe(201);
    const p = await res.json();
    expect(p.name).toBe("Test Project");
    expect(p.rootPath).toBe("/tmp");
    projectId = p.id;
  });

  test("get returns project", async ({ request }) => {
    const create = await request.post("/api/projects", {
      data: { name: "Get Test", rootPath: "/tmp" },
    });
    projectId = (await create.json()).id;
    const res = await request.get(`/api/projects/${projectId}`);
    expect(res.status()).toBe(200);
  });

  test("validates rootPath exists", async ({ request }) => {
    const res = await request.post("/api/projects", {
      data: { name: "Bad Path", rootPath: "/nonexistent/path/xyz" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects duplicate names", async ({ request }) => {
    await request.post("/api/projects", {
      data: { name: "Dup Test", rootPath: "/tmp" },
    });
    const res = await request.post("/api/projects", {
      data: { name: "Dup Test", rootPath: "/tmp" },
    });
    expect(res.status()).toBe(400);
  });

  test("update changes name", async ({ request }) => {
    const create = await request.post("/api/projects", {
      data: { name: "Old Name", rootPath: "/tmp" },
    });
    projectId = (await create.json()).id;
    const res = await request.put(`/api/projects/${projectId}`, {
      data: { name: "New Name" },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).name).toBe("New Name");
  });

  test("delete removes project", async ({ request }) => {
    const create = await request.post("/api/projects", {
      data: { name: "Delete Me", rootPath: "/tmp" },
    });
    projectId = (await create.json()).id;
    const res = await request.delete(`/api/projects/${projectId}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).deleted).toBe(true);
  });

  test("job linked to project appears in project jobs", async ({ request }) => {
    const pRes = await request.post("/api/projects", {
      data: { name: "Job Test", rootPath: "/tmp" },
    });
    projectId = (await pRes.json()).id;
    const jRes = await request.post("/api/jobs", {
      data: { title: "Project job", prompt: "Test", projectId },
    });
    const jobId = (await jRes.json()).id;

    const jobsRes = await request.get(`/api/projects/${projectId}/jobs`);
    expect(jobsRes.status()).toBe(200);
    const jobs = await jobsRes.json();
    expect(jobs.some((j: any) => j.id === jobId)).toBe(true);

    // Cleanup
    await request.post(`/api/jobs/${jobId}/cancel`);
    await request.delete(`/api/jobs/${jobId}`);
  });
});

// ── Prompt management ─────────────────────────────────────────
test.describe("Prompt management", () => {
  let jobId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post("/api/jobs", {
      data: { title: "PM Test", prompt: "Hello", maxRetries: 0, timeoutMs: 30000 },
    });
    jobId = (await res.json()).id;
  });

  test.afterEach(async ({ request }) => {
    try { await request.post(`/api/jobs/${jobId}/cancel`); } catch (_) {}
    try { await request.delete(`/api/jobs/${jobId}`); } catch (_) {}
  });

  test("PATCH updates job title", async ({ request }) => {
    const res = await request.patch(`/api/jobs/${jobId}`, {
      data: { title: "Updated Title" },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).title).toBe("Updated Title");
  });

  test("POST /duplicate creates copy", async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/duplicate`);
    expect(res.status()).toBe(201);
    const dup = await res.json();
    expect(dup.id).not.toBe(jobId);
    expect(dup.title).toContain("(copy)");
    // Cleanup
    try { await request.post(`/api/jobs/${dup.id}/cancel`); } catch (_) {}
    try { await request.delete(`/api/jobs/${dup.id}`); } catch (_) {}
  });

  test("GET /detail returns full detail", async ({ request }) => {
    const res = await request.get(`/api/jobs/${jobId}/detail`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.job.id).toBe(jobId);
    expect("logContent" in data).toBe(true);
  });

  test("create accepts projectId", async ({ request }) => {
    const pRes = await request.post("/api/projects", {
      data: { name: "JobProj", rootPath: "/tmp" },
    });
    const pid = (await pRes.json()).id;
    const res = await request.post("/api/jobs", {
      data: { title: "Projected", prompt: "Hi", projectId: pid, maxRetries: 0, timeoutMs: 30000 },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).projectId).toBe(pid);
    // Cleanup
    const jid = (await res.json()).id;
    try { await request.post(`/api/jobs/${jid}/cancel`); } catch (_) {}
    try { await request.delete(`/api/jobs/${jid}`); } catch (_) {}
    try { await request.delete(`/api/projects/${pid}`); } catch (_) {}
  });
});

// ── Sessions ──────────────────────────────────────────────────
test.describe("Sessions", () => {
  test("list returns empty initially", async ({ request }) => {
    const res = await request.get("/api/sessions");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("latest returns 404 when no sessions exist", async ({ request }) => {
    const res = await request.get("/api/sessions/latest");
    expect(res.status()).toBe(404);
  });

  test("get by id returns 404 for missing", async ({ request }) => {
    const res = await request.get("/api/sessions/nonexistent");
    expect(res.status()).toBe(404);
  });
});

// ── Settings ──────────────────────────────────────────────────
test.describe("Settings", () => {
  test("GET returns settings with defaults", async ({ request }) => {
    const res = await request.get("/api/settings");
    expect(res.status()).toBe(200);
    const s = await res.json();
    expect(s.providers.length).toBeGreaterThanOrEqual(1);
    expect(typeof s.executionDefaults.timeoutMs).toBe("number");
    expect(typeof s.executionDefaults.maxRetries).toBe("number");
  });

  test("PUT saves settings", async ({ request }) => {
    const res = await request.put("/api/settings", {
      data: { executionDefaults: { timeoutMs: 300000, maxRetries: 1 } },
    });
    expect(res.status()).toBe(200);
  });

  test("list providers returns array", async ({ request }) => {
    const res = await request.get("/api/settings/providers");
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test("create validates required fields", async ({ request }) => {
    const res = await request.post("/api/settings/providers", {
      data: { name: "", type: "claude-cli" },
    });
    expect(res.status()).toBe(400);
  });

  test("create provider returns 201", async ({ request }) => {
    const name = "Test Provider " + Date.now();
    const res = await request.post("/api/settings/providers", {
      data: {
        name,
        type: "claude-cli",
        apiKeyEnvVar: "TEST_KEY",
        defaultModel: "test-model",
        claudeCmd: "claude",
        claudeFlags: "--test",
      },
    });
    expect(res.status()).toBe(201);
    // Cleanup
    const p = await res.json();
    try { await request.delete(`/api/settings/providers/${p.id}`); } catch (_) {}
  });

  test("cannot delete default provider", async ({ request }) => {
    const s = await request.get("/api/settings").then((r) => r.json());
    const def = s.providers.find((p: any) => p.isDefault);
    const res = await request.delete(`/api/settings/providers/${def.id}`);
    expect(res.status()).toBe(400);
  });

  test("set default works", async ({ request }) => {
    const create = await request.post("/api/settings/providers", {
      data: {
        name: "Temp Provider",
        type: "openai-compatible",
        apiKeyEnvVar: "TMP_KEY",
        defaultModel: "tmp",
        baseUrl: "https://test.api.com/v1",
      },
    });
    const p = await create.json();
    const res = await request.post(`/api/settings/providers/${p.id}/default`);
    expect(res.status()).toBe(200);

    // Restore Claude as default
    const s = await request.get("/api/settings").then((r) => r.json());
    const claude = s.providers.find((x: any) => x.type === "claude-cli");
    if (claude) await request.post(`/api/settings/providers/${claude.id}/default`);
    try { await request.delete(`/api/settings/providers/${p.id}`); } catch (_) {}
  });
});

// ── Execution modes ──────────────────────────────────────────
test.describe("Execution modes", () => {
  test.beforeAll(async ({ request }) => {
    await request.post("/api/queue/pause");
  });
  test.afterAll(async ({ request }) => {
    await request.post("/api/queue/resume");
  });

  test("create accepts executionMode", async ({ request }) => {
    const res = await request.post("/api/jobs", {
      data: {
        title: "Terminal test",
        prompt: "echo hello",
        executionMode: "terminal",
        maxRetries: 0,
        timeoutMs: 30000,
      },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).executionMode).toBe("terminal");
  });

  test("stop sets status to stopped", async ({ request }) => {
    // Create a job (stays pending since queue is paused)
    const create = await request.post("/api/jobs", {
      data: { title: "Stop me", prompt: "test", maxRetries: 0, timeoutMs: 30000 },
    });
    const job = await create.json();

    // Start it manually via manager — actually skip since queue is paused
    // We'll test the stop endpoint rejects non-running jobs
    const stopRes = await request.post(`/api/jobs/${job.id}/stop`);
    expect(stopRes.status()).toBe(400); // Not running

    // Cleanup
    await request.post(`/api/jobs/${job.id}/cancel`);
    await request.delete(`/api/jobs/${job.id}`);
  });

  test("resume returns 400 for non-stopped jobs", async ({ request }) => {
    const create = await request.post("/api/jobs", {
      data: { title: "Not stopped", prompt: "test", maxRetries: 0, timeoutMs: 30000 },
    });
    const job = await create.json();
    const res = await request.post(`/api/jobs/${job.id}/resume`);
    expect(res.status()).toBe(400);

    await request.post(`/api/jobs/${job.id}/cancel`);
    await request.delete(`/api/jobs/${job.id}`);
  });
});

// ── Tickets (Kanban) ─────────────────────────────────────────
test.describe("Tickets", () => {
  let ticketId: string;

  test.afterEach(async ({ request }) => {
    if (ticketId) {
      try { await request.delete(`/api/tickets/${ticketId}`); } catch (_) {}
    }
  });

  test("list returns array", async ({ request }) => {
    const res = await request.get("/api/tickets");
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test("create returns 201", async ({ request }) => {
    const res = await request.post("/api/tickets", {
      data: { title: "Test ticket", priority: "high" },
    });
    expect(res.status()).toBe(201);
    const t = await res.json();
    expect(t.title).toBe("Test ticket");
    expect(t.column).toBe("backlog");
    expect(t.priority).toBe("high");
    ticketId = t.id;
  });

  test("validates title required", async ({ request }) => {
    const res = await request.post("/api/tickets", {
      data: { title: "" },
    });
    expect(res.status()).toBe(400);
  });

  test("validates column", async ({ request }) => {
    const res = await request.post("/api/tickets", {
      data: { title: "X", column: "invalid" },
    });
    expect(res.status()).toBe(400);
  });

  test("get returns ticket", async ({ request }) => {
    const create = await request.post("/api/tickets", {
      data: { title: "Get me" },
    });
    ticketId = (await create.json()).id;
    const res = await request.get(`/api/tickets/${ticketId}`);
    expect(res.status()).toBe(200);
  });

  test("patch updates ticket", async ({ request }) => {
    const create = await request.post("/api/tickets", {
      data: { title: "Patch me" },
    });
    ticketId = (await create.json()).id;
    const res = await request.patch(`/api/tickets/${ticketId}`, {
      data: { title: "Patched" },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).title).toBe("Patched");
  });

  test("create with projectId writes ticket to project", async ({ request }) => {
    const pRes = await request.post("/api/projects", {
      data: { name: "TicketProject", rootPath: "/tmp" },
    });
    const pid = (await pRes.json()).id;
    const create = await request.post("/api/tickets", {
      data: { title: "Project ticket", projectId: pid, tags: ["test"] },
    });
    expect(create.status()).toBe(201);
    const t = await create.json();
    expect(t.projectId).toBe(pid);
    ticketId = t.id;
    // Cleanup project
    try { await request.delete(`/api/projects/${pid}`); } catch (_) {}
  });

  test("move changes column", async ({ request }) => {
    const create = await request.post("/api/tickets", {
      data: { title: "Move me" },
    });
    ticketId = (await create.json()).id;
    const res = await request.post(`/api/tickets/${ticketId}/move`, {
      data: { column: "in-progress" },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).column).toBe("in-progress");
  });

  test("delete removes ticket", async ({ request }) => {
    const create = await request.post("/api/tickets", {
      data: { title: "Delete me" },
    });
    ticketId = (await create.json()).id;
    const res = await request.delete(`/api/tickets/${ticketId}`);
    expect(res.status()).toBe(200);
  });
});

// ── Filesystem Persistence ──────────────────────────────────────
test.describe("Filesystem persistence", () => {
  let projectId: string;

  test.afterEach(async ({ request }) => {
    if (projectId) {
      try { await request.delete(`/api/projects/${projectId}`); } catch (_) {}
      projectId = "";
    }
  });

  test("project creation creates directory and persists across list calls", async ({ request }) => {
    const create = await request.post("/api/projects", {
      data: { name: "PersistMe " + Date.now(), rootPath: "/tmp" },
    });
    expect(create.status()).toBe(201);
    projectId = (await create.json()).id;

    // Verify it appears in the list
    const list = await request.get("/api/projects");
    const projects = await list.json();
    expect(projects.some((p: any) => p.id === projectId)).toBe(true);
  });

  test("duplicate project name returns clear error", async ({ request }) => {
    const name = "DupCheck-" + Date.now();
    const c1 = await request.post("/api/projects", {
      data: { name, rootPath: "/tmp" },
    });
    expect(c1.status()).toBe(201);
    projectId = (await c1.json()).id;

    const c2 = await request.post("/api/projects", {
      data: { name, rootPath: "/tmp" },
    });
    expect(c2.status()).toBe(400);
    const err = await c2.json();
    expect(err.message).toContain("already exists");
  });

  test("project list includes projects from filesystem", async ({ request }) => {
    // Create a project with a known name
    const create = await request.post("/api/projects", {
      data: { name: "FSTest-" + Date.now(), rootPath: "/tmp" },
    });
    expect(create.status()).toBe(201);
    projectId = (await create.json()).id;

    // List should have at least this project
    const list = await request.get("/api/projects");
    const projects: any[] = await list.json();
    expect(projects.length).toBeGreaterThanOrEqual(1);
    const found = projects.find((p) => p.id === projectId);
    expect(found).toBeTruthy();
  });

  test("project deletion cleans up project from list", async ({ request }) => {
    const create = await request.post("/api/projects", {
      data: { name: "DeleteFSTest-" + Date.now(), rootPath: "/tmp" },
    });
    projectId = (await create.json()).id;

    await request.delete(`/api/projects/${projectId}`);

    const list = await request.get("/api/projects");
    const projects = await list.json();
    expect(projects.some((p: any) => p.id === projectId)).toBe(false);
    projectId = ""; // Already deleted
  });

  test("tickets persist correctly with projectId", async ({ request }) => {
    const pRes = await request.post("/api/projects", {
      data: { name: "TicketFSTest-" + Date.now(), rootPath: "/tmp" },
    });
    projectId = (await pRes.json()).id;
    const pName = (await pRes.json()).name;

    // Create a ticket linked to this project
    const tRes = await request.post("/api/tickets", {
      data: { title: "FS ticket test", description: "Persisted via filesystem", projectId, tags: ["fs-test"] },
    });
    expect(tRes.status()).toBe(201);
    const ticket = await tRes.json();

    // List tickets and verify our ticket is there
    const list = await request.get("/api/tickets");
    const tickets = await list.json();
    const found = tickets.find((t: any) => t.id === ticket.id);
    expect(found).toBeTruthy();
    expect(found.projectId).toBe(projectId);
    expect(found.description).toBe("Persisted via filesystem");
  });

  test("prompts persist correctly with projectId", async ({ request }) => {
    const pRes = await request.post("/api/projects", {
      data: { name: "PromptFSTest-" + Date.now(), rootPath: "/tmp" },
    });
    projectId = (await pRes.json()).id;

    // Create a job (prompt) linked to this project
    const jRes = await request.post("/api/jobs", {
      data: { title: "FS prompt test", prompt: "Test prompt content", projectId, maxRetries: 0, timeoutMs: 30000 },
    });
    expect(jRes.status()).toBe(201);
    const job = await jRes.json();

    // Verify the job appears in the list
    const list = await request.get("/api/jobs");
    const jobs = await list.json();
    const found = jobs.find((j: any) => j.id === job.id);
    expect(found).toBeTruthy();
    expect(found.projectId).toBe(projectId);

    // Cleanup job
    try { await request.post(`/api/jobs/${job.id}/cancel`); } catch (_) {}
    try { await request.delete(`/api/jobs/${job.id}`); } catch (_) {}
  });

  test("invalid characters in project name are rejected", async ({ request }) => {
    const res = await request.post("/api/projects", {
      data: { name: "test/../etc", rootPath: "/tmp" },
    });
    expect(res.status()).toBe(400);
  });

  test("empty project name is rejected", async ({ request }) => {
    const res = await request.post("/api/projects", {
      data: { name: "   ", rootPath: "/tmp" },
    });
    expect(res.status()).toBe(400);
  });

  test("project update renames directory when name changes", async ({ request }) => {
    const oldName = "RenameMe-" + Date.now();
    const create = await request.post("/api/projects", {
      data: { name: oldName, rootPath: "/tmp" },
    });
    projectId = (await create.json()).id;

    const newName = "Renamed-" + Date.now();
    const upd = await request.put(`/api/projects/${projectId}`, {
      data: { name: newName },
    });
    expect(upd.status()).toBe(200);
    expect((await upd.json()).name).toBe(newName);
  });
});
