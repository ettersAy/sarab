// ── SARAB Frontend SPA ──────────────────────────────────────────────

const MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-4-20250501",
];

// ── State ───────────────────────────────────────────────────────────
let currentView = "dashboard";
let jobs = [];
let projects = [];
let currentProjectId = null;
let stats = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0, total: 0 };
let queueFilter = "all";
let queueSearch = "";
let queueRunning = true;

// ── DOM refs ────────────────────────────────────────────────────────
const $main = document.getElementById("main");
const $indicator = document.getElementById("queue-indicator");
const $label = document.getElementById("queue-label");

// ── SSE ─────────────────────────────────────────────────────────────
let sseConnected = false;

function initSSE() {
  const es = new EventSource("/api/events");
  es.onopen = () => {
    sseConnected = true;
    updateIndicator();
  };
  es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleSSE(msg);
    } catch (_) { /* ignore malformed */ }
  };
  es.onerror = () => {
    sseConnected = false;
    updateIndicator();
    // EventSource auto-reconnects
  };
}

function handleSSE(msg) {
  switch (msg.type) {
    case "stats":
      stats = msg.payload;
      updateIndicator();
      if (currentView === "dashboard") renderDashboard();
      break;
    case "job-started":
    case "job-completed":
    case "job-failed":
    case "job-cancelled":
    case "job-retrying":
      replaceJob(msg.payload);
      updateView();
      break;
  }
}

function replaceJob(job) {
  const idx = jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) jobs[idx] = job;
  else jobs.unshift(job);
}

function updateIndicator() {
  if (!sseConnected) {
    $indicator.className = "indicator stopped";
    $label.textContent = "Disconnected";
    return;
  }
  const running = stats.running > 0;
  $indicator.className = "indicator " + (running ? "running" : "stopped");
  $label.textContent = running ? "Worker active" : "Worker idle";
}

// ── Navigation ──────────────────────────────────────────────────────
document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-btn");
  if (!btn) return;
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  switchView(btn.dataset.view);
});

function switchView(view) {
  currentView = view;
  renderView();
}

function updateView() {
  if (currentView === "dashboard") renderDashboard();
  else if (currentView === "queue") renderQueue();
}

function renderView() {
  if (currentView === "dashboard") renderDashboard();
  else if (currentView === "projects") renderProjects();
  else if (currentView === "project-detail") renderProjectDetail();
  else if (currentView === "queue") renderQueue();
  else if (currentView === "submit") renderSubmit();
}

// ── Dashboard ───────────────────────────────────────────────────────
function renderDashboard() {
  const statuses = ["pending", "running", "completed", "failed", "cancelled", "total"];
  const cards = statuses
    .map(
      (s) => `
    <div class="stat-card ${s}">
      <div class="stat-value">${stats[s] ?? 0}</div>
      <div class="stat-label">${s}</div>
    </div>`
    )
    .join("");

  const recent = jobs.slice(0, 10);

  $main.innerHTML = `
    <div class="view active" id="view-dashboard">
      <div class="stats-grid">${cards}</div>
      <div class="recent-jobs">
        <div class="section-header">
          <h2>Recent Jobs</h2>
          <button class="btn btn-sm" id="btn-refresh">Refresh</button>
        </div>
        ${renderJobTable(recent)}
      </div>
    </div>`;

  document.getElementById("btn-refresh")?.addEventListener("click", loadJobs);
  bindJobActions();
}

// ── Projects ────────────────────────────────────────────────────────
async function loadProjects() {
  try { projects = await api("GET", "/api/projects"); }
  catch (err) { showToast("Failed to load projects: " + err.message, "error"); }
}

function renderProjects() {
  const cards = projects.length
    ? projects.map((p) => `
      <div class="project-card" data-id="${p.id}">
        <div class="project-card-header">
          <h3>${h(p.name)}</h3>
          <span class="project-card-path">${h(p.rootPath)}</span>
        </div>
        <div class="project-card-actions">
          <button class="btn btn-sm" data-action="view-project" data-id="${p.id}">View</button>
          <button class="btn btn-danger btn-sm" data-action="delete-project" data-id="${p.id}">Delete</button>
        </div>
      </div>`).join("")
    : `<div class="empty-state"><div class="empty-icon">&#128193;</div><p>No projects yet.</p></div>`;

  $main.innerHTML = `
    <div class="view active" id="view-projects">
      <div class="section-header">
        <h2>Projects</h2>
        <div class="queue-controls">
          <button class="btn btn-sm" id="btn-refresh">Refresh</button>
          <button class="btn btn-primary btn-sm" id="btn-new-project">New Project</button>
        </div>
      </div>
      ${cards}
      <div id="project-form" class="hidden" style="margin-top:20px"></div>
    </div>`;

  document.getElementById("btn-refresh")?.addEventListener("click", async () => {
    await loadProjects();
    renderProjects();
  });
  document.getElementById("btn-new-project")?.addEventListener("click", showProjectForm);
  document.querySelectorAll("[data-action=view-project]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentProjectId = btn.dataset.id;
      currentView = "project-detail";
      renderView();
    });
  });
  document.querySelectorAll("[data-action=delete-project]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete project " + btn.dataset.id + "?")) return;
      try { await api("DELETE", `/api/projects/${btn.dataset.id}`); await loadProjects(); renderProjects(); }
      catch (err) { showToast(err.message, "error"); }
    });
  });
}

function showProjectForm() {
  const form = document.getElementById("project-form");
  form.classList.remove("hidden");
  form.innerHTML = `
    <div class="form-container">
      <h3>New Project</h3>
      <div class="form-group">
        <label>Project Name</label>
        <input id="f-project-name" type="text" placeholder="e.g. my-app" required maxlength="100">
      </div>
      <div class="form-group">
        <label>Root Path</label>
        <input id="f-project-path" type="text" placeholder="e.g. /home/user/projects/my-app" required>
        <div class="hint">Claude commands will run from this directory.</div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary btn-sm" id="btn-create-project">Create</button>
        <button class="btn btn-sm" id="btn-cancel-project">Cancel</button>
      </div>
    </div>`;

  document.getElementById("btn-create-project")?.addEventListener("click", async () => {
    const name = document.getElementById("f-project-name").value.trim();
    const rootPath = document.getElementById("f-project-path").value.trim();
    if (!name || !rootPath) { showToast("Name and root path are required", "error"); return; }
    try {
      await api("POST", "/api/projects", { name, rootPath });
      await loadProjects();
      renderProjects();
      showToast("Project created", "success");
    } catch (err) { showToast(err.message, "error"); }
  });
  document.getElementById("btn-cancel-project")?.addEventListener("click", () => {
    form.classList.add("hidden");
  });
}

function renderProjectDetail() {
  const p = projects.find((x) => x.id === currentProjectId);
  if (!p) { $main.innerHTML = "<p>Project not found</p>"; return; }

  const projectJobs = jobs.filter((j) => j.projectId === p.id);

  $main.innerHTML = `
    <div class="view active" id="view-project-detail">
      <div class="section-header">
        <h2>${h(p.name)}</h2>
        <div class="queue-controls">
          <button class="btn btn-sm" id="btn-back-projects">Back</button>
          <button class="btn btn-sm" id="btn-new-project-job">New Prompt</button>
          <button class="btn btn-danger btn-sm" id="btn-delete-proj">Delete Project</button>
        </div>
      </div>
      <div class="project-meta" style="margin-bottom:16px;color:var(--text-dim);font-size:12px">
        Root: ${h(p.rootPath)} &middot; Created: ${fmtTime(p.createdAt)}
      </div>
      <h3 style="margin-bottom:8px">Prompts (${projectJobs.length})</h3>
      ${renderJobTable(projectJobs)}
    </div>`;

  document.getElementById("btn-back-projects")?.addEventListener("click", () => {
    currentView = "projects";
    renderView();
  });
  document.getElementById("btn-new-project-job")?.addEventListener("click", () => {
    currentView = "submit";
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-view="submit"]')?.classList.add("active");
    renderView();
  });
  document.getElementById("btn-delete-proj")?.addEventListener("click", async () => {
    if (!confirm("Delete project '" + p.name + "'?")) return;
    try { await api("DELETE", `/api/projects/${p.id}`); await loadProjects(); currentView = "projects"; renderView(); }
    catch (err) { showToast(err.message, "error"); }
  });
  bindJobActions();
}

// ── Queue ───────────────────────────────────────────────────────────
function renderQueue() {
  let filtered =
    queueFilter === "all" ? jobs : jobs.filter((j) => j.status === queueFilter);

  if (queueSearch.trim()) {
    const q = queueSearch.toLowerCase().trim();
    filtered = filtered.filter(
      (j) => j.title.toLowerCase().includes(q) || j.id.includes(q)
    );
  }

  const filterBtns = ["all", "pending", "running", "completed", "failed", "cancelled"]
    .map(
      (f) =>
        `<button class="filter-btn${queueFilter === f ? " active" : ""}" data-filter="${f}">${f}</button>`
    )
    .join("");

  $main.innerHTML = `
    <div class="view active" id="view-queue">
      <div class="section-header">
        <h2>All Jobs (${filtered.length})</h2>
        <div class="queue-controls">
          <button class="btn btn-sm" id="btn-refresh">Refresh</button>
          <button class="btn btn-sm" id="btn-pause">${queueRunning ? "Pause" : "Resume"} Queue</button>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <input type="text" id="queue-search" placeholder="Search by title or ID..." value="${h(queueSearch)}"
          style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;font-family:var(--font)">
      </div>
      <div class="queue-filter">${filterBtns}</div>
      ${renderJobTable(filtered)}
    </div>`;

  document.getElementById("btn-refresh")?.addEventListener("click", loadJobs);
  document.getElementById("btn-pause")?.addEventListener("click", toggleQueue);
  document.getElementById("queue-search")?.addEventListener("input", (e) => {
    queueSearch = e.target.value;
    renderQueue();
  });
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      queueFilter = btn.dataset.filter;
      renderQueue();
    });
  });
  bindJobActions();
}

function renderJobTable(list) {
  if (!list.length) {
    return `<div class="empty-state"><div class="empty-icon">&#128203;</div><p>No jobs yet. Submit a prompt to get started.</p></div>`;
  }
  const rows = list.map(renderJobRow).join("");
  return `
    <table class="job-table">
      <thead><tr>
        <th>ID</th><th>Title</th><th>Status</th><th>Attempt</th><th>Created</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderJobRow(j) {
  const time = fmtTime(j.createdAt);
  const tagsHtml = j.tags?.length
    ? j.tags.map((t) => `<span class="tag">${h(t)}</span>`).join("")
    : "";
  return `
    <tr>
      <td class="job-id">${h(j.id)}</td>
      <td class="job-title-cell" title="${h(j.title)}">
        ${h(j.title)}
        ${tagsHtml ? `<div style="margin-top:2px">${tagsHtml}</div>` : ""}
      </td>
      <td><span class="status-badge ${j.status}">${j.status}</span></td>
      <td>${j.attempt + 1}</td>
      <td class="job-time">${time}</td>
      <td>
        <div class="btn-group">
          <button class="btn btn-sm" data-action="detail" data-id="${j.id}">View</button>
          ${j.status === "pending" ? `<button class="btn btn-danger btn-sm" data-action="cancel" data-id="${j.id}">Cancel</button>` : ""}
          ${j.status === "completed" || j.status === "failed" ? `<button class="btn btn-sm" data-action="retry" data-id="${j.id}">Retry</button>` : ""}
          ${j.status === "completed" || j.status === "failed" ? `<button class="btn btn-sm" data-action="log" data-id="${j.id}">Log</button>` : ""}
          ${j.status !== "running" && j.status !== "retrying" ? `<button class="btn btn-sm" data-action="duplicate" data-id="${j.id}">Dup</button>` : ""}
          ${j.status !== "running" && j.status !== "retrying" ? `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${j.id}">Del</button>` : ""}
        </div>
      </td>
    </tr>`;
}

function bindJobActions() {
  $main.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === "log") { viewLog(id); return; }
      if (action === "detail") { viewDetail(id); return; }
      if (action === "duplicate") { duplicateJob(id); return; }

      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "...";
      try {
        if (action === "cancel") await cancelJob(id);
        else if (action === "retry") await retryJob(id);
        else if (action === "delete") await deleteJob(id);
      } catch (err) {
        if (err.message !== "Cancelled") showToast(err.message, "error");
        btn.disabled = false;
        btn.textContent = origText;
      }
    });
  });
}

// ── Submit form ─────────────────────────────────────────────────────
let sessions = [];
let sessionMode = "";

function renderSubmit() {
  const modelOpts = MODELS.map((m) => `<option value="${m}">${m}</option>`).join("");
  const projectOpts = projects.map((p) =>
    `<option value="${p.id}" ${currentProjectId === p.id ? "selected" : ""}>${h(p.name)}</option>`
  ).join("");
  const projectLabel = currentProjectId
    ? (projects.find((p) => p.id === currentProjectId)?.name || "Project")
    : "";

  $main.innerHTML = `
    <div class="view active" id="view-submit">
      <div class="form-container">
        <h2 style="margin-bottom:20px">New Prompt ${projectLabel ? `— ${h(projectLabel)}` : ""}</h2>
        <form id="submit-form">
          <div class="form-group">
            <label for="f-title">Title</label>
            <input id="f-title" type="text" placeholder="e.g. Upgrade dependencies" required maxlength="200">
          </div>
          <div class="form-group">
            <label for="f-prompt">Prompt</label>
            <textarea id="f-prompt" placeholder="Write your Claude prompt here..." required></textarea>
            <div class="hint">The prompt that will be sent to Claude CLI.</div>
          </div>
          <div class="form-group">
            <label class="action-label">Improve Prompt</label>
            <div class="action-bar" id="prompt-actions">
              <button type="button" class="action-btn" data-action="reformulate" data-label="Reformulate" title="Rewrite for clarity and structure">Reformulate</button>
              <button type="button" class="action-btn" data-action="improve" data-label="Improve" title="Add specificity and structure">Improve</button>
              <button type="button" class="action-btn" data-action="correct" data-label="Correct" title="Fix grammar and clarity">Correct</button>
              <button type="button" class="action-btn" data-action="shorten" data-label="Shorten" title="Condense while preserving intent">Shorten</button>
              <button type="button" class="action-btn" data-action="expand" data-label="Expand" title="Add more detail and context">Expand</button>
            </div>
            <div class="hint">Select an action to transform your prompt before submitting.</div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="f-model">Model</label>
              <select id="f-model"><option value="">Default</option>${modelOpts}</select>
            </div>
            <div class="form-group">
              <label for="f-tags">Tags</label>
              <input id="f-tags" type="text" placeholder="e.g. refactor, urgent">
              <div class="hint">Comma-separated.</div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="f-project">Project</label>
              <select id="f-project"><option value="">None (standalone)</option>${projectOpts}</select>
              <div class="hint">Link this prompt to a project for root-path execution and session tracking.</div>
            </div>
            <div class="form-group">
              <label for="f-session-mode">Session Mode</label>
              <select id="f-session-mode">
                <option value="">New Session</option>
                <option value="latest" ${sessionMode === "latest" ? "selected" : ""}>Resume Latest</option>
                <option value="resume" ${sessionMode === "resume" ? "selected" : ""}>Resume Specific</option>
              </select>
            </div>
          </div>
          <div id="session-selector-row" class="form-group ${sessionMode === "resume" ? "" : "hidden"}">
            <label for="f-session-id">Session to Resume</label>
            <select id="f-session-id"><option value="">Loading...</option></select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="f-timeout">Timeout (ms)</label>
              <input id="f-timeout" type="number" value="600000" min="10000" step="10000">
            </div>
            <div class="form-group">
              <label for="f-retries">Max Retries</label>
              <input id="f-retries" type="number" value="2" min="0" max="10">
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="btn-submit">Submit Prompt</button>
            <button type="reset" class="btn">Clear</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById("submit-form")?.addEventListener("submit", handleSubmit);
  document.getElementById("prompt-actions")?.addEventListener("click", handlePromptAction);

  document.getElementById("f-project")?.addEventListener("change", (e) => {
    currentProjectId = e.target.value || null;
    if (currentProjectId) loadSessionsForProject(currentProjectId);
  });

  document.getElementById("f-session-mode")?.addEventListener("change", async (e) => {
    sessionMode = e.target.value;
    const row = document.getElementById("session-selector-row");
    if (sessionMode === "resume") {
      row?.classList.remove("hidden");
      const pid = document.getElementById("f-project").value;
      if (pid) await loadSessionsForProject(pid);
    } else {
      row?.classList.add("hidden");
    }
  });

  // Load sessions if project is pre-selected
  if (currentProjectId) loadSessionsForProject(currentProjectId);
}

async function loadSessionsForProject(projectId) {
  const sel = document.getElementById("f-session-id");
  if (!sel) return;
  try {
    sessions = await api("GET", `/api/sessions?projectId=${projectId}`);
    sel.innerHTML = sessions.length
      ? sessions.map((s) => `<option value="${s.sessionId}">${s.sessionId} (${fmtTime(s.createdAt)})</option>`).join("")
      : `<option value="">No sessions yet</option>`;
  } catch (_) {
    sel.innerHTML = `<option value="">Error loading sessions</option>`;
  }
}

async function handlePromptAction(e) {
  const btn = e.target.closest(".action-btn");
  if (!btn || btn.disabled) return;

  const textarea = document.getElementById("f-prompt");
  const prompt = textarea.value.trim();
  if (!prompt) {
    showToast("Write a prompt first before applying an action.", "error");
    textarea.focus();
    return;
  }

  const action = btn.dataset.action;
  const actionLabels = { reformulate: "Reformulating", improve: "Improving", correct: "Correcting", shorten: "Shortening", expand: "Expanding" };

  // Disable all action buttons and show loading state
  const allBtns = document.querySelectorAll(".action-btn");
  allBtns.forEach((b) => { b.disabled = true; });
  btn.classList.add("loading");
  btn.textContent = actionLabels[action] + "...";

  try {
    const data = await api("POST", "/api/prompt/improve", { prompt, action });
    textarea.value = data.result;
    // Auto-resize to fit content
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
    showToast(`Prompt ${action}ed successfully`, "success");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    allBtns.forEach((b) => {
      b.disabled = false;
      b.classList.remove("loading");
      b.textContent = b.dataset.label;
    });
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-submit");
  btn.disabled = true;
  btn.textContent = "Submitting...";

  const tagsRaw = document.getElementById("f-tags").value;
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

  try {
    const projectId = document.getElementById("f-project")?.value || currentProjectId || undefined;
    const body = {
      title: document.getElementById("f-title").value.trim(),
      prompt: document.getElementById("f-prompt").value.trim(),
      model: document.getElementById("f-model").value || undefined,
      timeoutMs: parseInt(document.getElementById("f-timeout").value),
      maxRetries: parseInt(document.getElementById("f-retries").value),
      tags,
      projectId,
      sessionMode: document.getElementById("f-session-mode")?.value || undefined,
    };
    if (body.sessionMode === "resume") {
      body.sessionId = document.getElementById("f-session-id")?.value || undefined;
    }

    const job = await api("POST", "/api/jobs", body);
    showToast(`Job ${job.id} created`, "success");
    document.getElementById("submit-form")?.reset();
    // Switch to queue to see the new job
    currentView = "queue";
    queueFilter = "all";
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-view="queue"]')?.classList.add("active");
    await loadJobs();
    renderView();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Prompt";
  }
}

// ── API helpers ─────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Request failed");
  return data;
}

async function loadJobs() {
  try {
    jobs = await api("GET", "/api/jobs");
    const s = await api("GET", "/api/jobs/stats");
    stats = s;
    updateIndicator();
    updateView();
  } catch (err) {
    showToast("Failed to load jobs: " + err.message, "error");
  }
}

async function cancelJob(id) {
  await api("POST", `/api/jobs/${id}/cancel`);
}

async function retryJob(id) {
  await api("POST", `/api/jobs/${id}/retry`);
}

async function deleteJob(id) {
  if (!confirm("Delete job " + id + "?")) throw new Error("Cancelled");
  await api("DELETE", `/api/jobs/${id}`);
  await loadJobs();
}

async function toggleQueue() {
  try {
    if (queueRunning) {
      await api("POST", "/api/queue/pause");
      queueRunning = false;
    } else {
      await api("POST", "/api/queue/resume");
      queueRunning = true;
    }
    renderQueue();
  } catch (err) { showToast(err.message, "error"); }
}

async function viewLog(id) {
  const titleEl = document.getElementById("log-title");
  const bodyEl = document.getElementById("log-body");
  const modal = document.getElementById("log-modal");

  titleEl.textContent = "Loading...";
  bodyEl.textContent = "";
  modal.classList.remove("hidden");

  try {
    const data = await api("GET", `/api/jobs/${id}/log`);
    titleEl.textContent = "Log — " + id;
    bodyEl.textContent = data.content || "(empty)";
  } catch (err) {
    bodyEl.textContent = "Error: " + err.message;
  }
}

async function viewDetail(id) {
  const job = jobs.find((j) => j.id === id);
  if (!job) { showToast("Job not found", "error"); return; }
  const project = job.projectId ? projects.find((p) => p.id === job.projectId) : null;

  const titleEl = document.getElementById("log-title");
  const bodyEl = document.getElementById("log-body");
  const modal = document.getElementById("log-modal");

  titleEl.textContent = `Prompt Detail — ${job.id}`;
  bodyEl.innerHTML = `
    <strong>Title:</strong> ${h(job.title)}
    <strong>Status:</strong> ${job.status}
    <strong>Model:</strong> ${job.model || "default"}
    <strong>Project:</strong> ${project ? h(project.name) : "none"}
    <strong>Session:</strong> ${job.sessionId || "none"} (${job.sessionMode || "new"})
    <strong>Attempt:</strong> ${job.attempt + 1} / ${job.maxRetries + 1}
    <strong>Tags:</strong> ${job.tags?.length ? job.tags.map((t) => h(t)).join(", ") : "none"}
    <strong>Created:</strong> ${fmtTime(job.createdAt)}
    <strong>Started:</strong> ${fmtTime(job.startedAt)}
    <strong>Completed:</strong> ${fmtTime(job.completedAt)}
    <strong>Error:</strong> ${job.error ? h(job.error) : "none"}
    <hr style="border-color:var(--border);margin:12px 0">
    <strong>Prompt:</strong>
    <pre style="white-space:pre-wrap;margin-top:4px;font-family:var(--mono);font-size:12px">${h(job.prompt)}</pre>
  `;
  modal.classList.remove("hidden");
}

async function duplicateJob(id) {
  try {
    const dup = await api("POST", `/api/jobs/${id}/duplicate`);
    showToast(`Duplicated as ${dup.id}`, "success");
    await loadJobs();
    updateView();
  } catch (err) { showToast(err.message, "error"); }
}

// ── Log modal ───────────────────────────────────────────────────────
document.getElementById("log-close")?.addEventListener("click", () => {
  document.getElementById("log-modal")?.classList.add("hidden");
});
document.getElementById("log-modal")?.querySelector(".modal-overlay")?.addEventListener("click", () => {
  document.getElementById("log-modal")?.classList.add("hidden");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.getElementById("log-modal")?.classList.add("hidden");
});

// ── Toast ───────────────────────────────────────────────────────────
function showToast(msg, type) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = "toast " + type;
  setTimeout(() => toast.classList.add("hidden"), 3500);
}

// ── Helpers ─────────────────────────────────────────────────────────
function h(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Init ────────────────────────────────────────────────────────────
async function init() {
  initSSE();
  await loadJobs();
  renderView();
}

document.addEventListener("DOMContentLoaded", init);
