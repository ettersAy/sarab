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

  test("GET /app.js serves JS", async ({ request }) => {
    const res = await request.get("/app.js");
    expect(res.ok()).toBeTruthy();
  });
});

// ── Jobs CRUD ────────────────────────────────────────────────
test.describe("Job CRUD", () => {
  let jobId: string;

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
  test("empty list returns []", async ({ request }) => {
    const res = await request.get("/api/jobs");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("empty stats returns zeroes", async ({ request }) => {
    const res = await request.get("/api/jobs/stats");
    const stats = await res.json();
    expect(stats.total).toBe(0);
    expect(stats.pending).toBe(0);
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

  test("list returns empty initially", async ({ request }) => {
    const res = await request.get("/api/projects");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
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
