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
let tickets = [];
let currentProjectId = null;
let kanbanProjectId = null;
let stats = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0, total: 0 };
let queueFilter = "all";
let queueSearch = "";
let queueRunning = true;
let queuePage = 0;
const PAGE_SIZE = 25;
const KANBAN_COLUMNS = ["backlog", "ready", "in-progress", "paused", "testing", "done"];

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
  else if (currentView === "kanban") renderKanban();
  else if (currentView === "settings") renderSettings();
}

// ── Dashboard ───────────────────────────────────────────────────────
function renderDashboard() {
  const statuses = ["pending", "running", "completed", "failed", "cancelled", "stopped", "total"];
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
      <div class="kanban-overview" style="margin-top:24px">
        <div class="section-header">
          <h2>Kanban Overview</h2>
        </div>
        <div class="kanban-summary">
          ${KANBAN_COLUMNS.map((col) => {
            const count = tickets.filter((t) => t.column === col).length;
            return `<div class="kanban-summary-item" onclick="document.querySelector('[data-view=kanban]').click()" style="cursor:pointer">
              <div class="stat-value" style="font-size:22px">${count}</div>
              <div class="stat-label">${col}</div>
            </div>`;
          }).join("")}
        </div>
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
          <button class="btn btn-sm" data-action="edit-project" data-id="${p.id}">Edit</button>
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
  document.querySelectorAll("[data-action=edit-project]").forEach((btn) => {
    btn.addEventListener("click", () => showEditProjectForm(btn.dataset.id));
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
  const modal = document.getElementById("project-modal");
  document.getElementById("project-modal-title").textContent = "New Project";
  document.getElementById("project-modal-body").innerHTML = `
    <div class="form-container">
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

  modal.classList.remove("hidden");

  document.getElementById("btn-create-project")?.addEventListener("click", async () => {
    const name = document.getElementById("f-project-name").value.trim();
    const rootPath = document.getElementById("f-project-path").value.trim();
    if (!name || !rootPath) { showToast("Name and root path are required", "error"); return; }
    try {
      await api("POST", "/api/projects", { name, rootPath });
      await loadProjects();
      renderProjects();
      modal.classList.add("hidden");
      showToast("Project created", "success");
    } catch (err) { showToast(err.message, "error"); }
  });
  document.getElementById("btn-cancel-project")?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });
}

function showEditProjectForm(id) {
  const p = projects.find((x) => x.id === id);
  if (!p) { showToast("Project not found", "error"); return; }
  const modal = document.getElementById("project-modal");
  document.getElementById("project-modal-title").textContent = "Edit Project";
  document.getElementById("project-modal-body").innerHTML = `
    <div class="form-container">
      <div class="form-group">
        <label>Project Name</label>
        <input id="f-edit-project-name" type="text" value="${h(p.name)}" required maxlength="100">
      </div>
      <div class="form-group">
        <label>Root Path</label>
        <input id="f-edit-project-path" type="text" value="${h(p.rootPath)}" required>
      </div>
      <div class="form-group">
        <label>Default Model</label>
        <input id="fe-model" type="text" value="${h(p.settings?.defaultModel || '')}" placeholder="e.g. claude-sonnet-4-6">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Default Execution Mode</label>
          <select id="fe-exmode">
            <option value="">Default</option>
            <option value="api" ${p.settings?.defaultExecutionMode === "api" ? "selected" : ""}>API</option>
            <option value="terminal" ${p.settings?.defaultExecutionMode === "terminal" ? "selected" : ""}>Terminal</option>
          </select>
        </div>
        <div class="form-group">
          <label>Default Session Mode</label>
          <select id="fe-sessmode">
            <option value="">Default</option>
            <option value="new" ${p.settings?.defaultSessionMode === "new" ? "selected" : ""}>New</option>
            <option value="latest" ${p.settings?.defaultSessionMode === "latest" ? "selected" : ""}>Latest</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary btn-sm" id="btn-save-edit-project">Save</button>
        <button class="btn btn-sm" id="btn-cancel-edit-project">Cancel</button>
      </div>
    </div>`;

  modal.classList.remove("hidden");

  document.getElementById("btn-save-edit-project")?.addEventListener("click", async () => {
    const name = document.getElementById("f-edit-project-name").value.trim();
    const rootPath = document.getElementById("f-edit-project-path").value.trim();
    if (!name || !rootPath) { showToast("Name and root path are required", "error"); return; }
    const defExMode = document.getElementById("fe-exmode").value;
    const defSessMode = document.getElementById("fe-sessmode").value;
    try {
      await api("PUT", `/api/projects/${id}`, {
        name,
        rootPath,
        settings: {
          defaultModel: document.getElementById("fe-model").value.trim() || undefined,
          defaultExecutionMode: defExMode || undefined,
          defaultSessionMode: defSessMode || undefined,
        },
      });
      await loadProjects();
      renderProjects();
      modal.classList.add("hidden");
      showToast("Project updated", "success");
    } catch (err) { showToast(err.message, "error"); }
  });
  document.getElementById("btn-cancel-edit-project")?.addEventListener("click", () => {
    modal.classList.add("hidden");
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
      <div id="project-sessions" style="margin-top:24px"><em style="color:var(--text-dim)">Loading sessions...</em></div>
    </div>`;

  // Load sessions for this project
  (async () => {
    try {
      const projSessions = await api("GET", `/api/projects/${p.id}/sessions`);
      const el = document.getElementById("project-sessions");
      if (el) {
        el.innerHTML = projSessions.length
          ? `<h3 style="margin-bottom:8px">Sessions (${projSessions.length})</h3>
             <div style="font-size:12px;font-family:var(--mono)">${projSessions.map((s) => `<div style="margin-bottom:4px;color:var(--text-dim)">${h(s.sessionId)} &middot; ${fmtTime(s.createdAt)}</div>`).join("")}</div>`
          : `<h3 style="margin-bottom:8px">Sessions (0)</h3><p style="color:var(--text-dim);font-size:12px">No sessions recorded yet.</p>`;
      }
    } catch (_) {}
  })();

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

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  if (queuePage >= totalPages) queuePage = Math.max(0, totalPages - 1);
  const paged = filtered.slice(queuePage * PAGE_SIZE, (queuePage + 1) * PAGE_SIZE);

  const filterBtns = ["all", "pending", "running", "completed", "failed", "cancelled", "stopped"]
    .map(
      (f) =>
        `<button class="filter-btn${queueFilter === f ? " active" : ""}" data-filter="${f}">${f}</button>`
    )
    .join("");

  const paginationHtml = filtered.length > PAGE_SIZE ? `
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;font-size:12px;color:var(--text-dim)">
      <button class="btn btn-sm" id="btn-prev-page" ${queuePage === 0 ? "disabled" : ""}>Prev</button>
      <span>Page ${queuePage + 1} of ${totalPages} (${filtered.length} jobs)</span>
      <button class="btn btn-sm" id="btn-next-page" ${queuePage >= totalPages - 1 ? "disabled" : ""}>Next</button>
    </div>` : "";

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
      ${renderJobTable(paged)}
      ${paginationHtml}
    </div>`;

  document.getElementById("btn-refresh")?.addEventListener("click", loadJobs);
  document.getElementById("btn-pause")?.addEventListener("click", toggleQueue);
  document.getElementById("queue-search")?.addEventListener("input", (e) => {
    queueSearch = e.target.value;
    queuePage = 0;
    renderQueue();
  });
  document.getElementById("btn-prev-page")?.addEventListener("click", () => {
    if (queuePage > 0) { queuePage--; renderQueue(); }
  });
  document.getElementById("btn-next-page")?.addEventListener("click", () => {
    if (queuePage < totalPages - 1) { queuePage++; renderQueue(); }
  });
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      queueFilter = btn.dataset.filter;
      queuePage = 0;
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
      <td><span class="status-badge ${h(j.status)}">${h(j.status)}</span></td>
      <td>${(j.attempt ?? 0) + 1}</td>
      <td class="job-time">${time}</td>
      <td>
        <div class="btn-group">
          <button class="btn btn-sm" data-action="detail" data-id="${j.id}">View</button>
          ${j.status === "running" || j.status === "retrying" ? `<button class="btn btn-danger btn-sm" data-action="stop" data-id="${j.id}">Stop</button>` : ""}
          ${j.status === "stopped" ? `<button class="btn btn-sm" data-action="resume" data-id="${j.id}">Resume</button>` : ""}
          ${j.status === "pending" ? `<button class="btn btn-danger btn-sm" data-action="cancel" data-id="${j.id}">Cancel</button>` : ""}
          ${j.status === "completed" || j.status === "failed" ? `<button class="btn btn-sm" data-action="retry" data-id="${j.id}">Retry</button>` : ""}
          ${j.status === "completed" || j.status === "failed" ? `<button class="btn btn-sm" data-action="log" data-id="${j.id}">Log</button>` : ""}
          ${j.status !== "running" && j.status !== "retrying" ? `<button class="btn btn-sm" data-action="edit" data-id="${j.id}">Edit</button>` : ""}
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
      if (action === "stop") { stopJob(id); return; }
      if (action === "resume") { resumeJob(id); return; }
      if (action === "edit") { showEditJobForm(id); return; }

      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "...";
      try {
        if (action === "cancel") await cancelJob(id);
        else if (action === "retry") await retryJob(id);
        else if (action === "delete") await deleteJob(id);
      } catch (err) {
        if (err.message !== "Cancelled") showToast(err.message, "error");
      } finally {
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
              <label for="f-execution-mode">Execution Mode</label>
              <select id="f-execution-mode">
                <option value="api">API (one-shot)</option>
                <option value="terminal">Terminal (project root)</option>
              </select>
              <div class="hint">API: standard execution. Terminal: run from project root, supports stop/resume.</div>
            </div>
            <div class="form-group">
              <label for="f-project">Project</label>
              <select id="f-project"><option value="">None (standalone)</option>${projectOpts}</select>
              <div class="hint">Link this prompt to a project for root-path execution.</div>
            </div>
          </div>
          <div class="form-row">
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

  // Load sessions for current project (or standalone)
  loadSessionsForProject(currentProjectId);
}

async function loadSessionsForProject(projectId) {
  const sel = document.getElementById("f-session-id");
  if (!sel) return;
  const qs = projectId ? `?projectId=${projectId}` : "";
  try {
    sessions = await api("GET", `/api/sessions${qs}`);
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
      executionMode: document.getElementById("f-execution-mode")?.value || undefined,
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
  await loadJobs();
  updateView();
}

async function retryJob(id) {
  await api("POST", `/api/jobs/${id}/retry`);
  await loadJobs();
  updateView();
}

async function stopJob(id) {
  if (!confirm("Stop job " + id + "?")) return;
  try {
    await api("POST", `/api/jobs/${id}/stop`);
    await loadJobs();
    updateView();
  } catch (err) { showToast(err.message, "error"); }
}

async function resumeJob(id) {
  try {
    await api("POST", `/api/jobs/${id}/resume`);
    showToast(`Job ${id} resumed`, "success");
    await loadJobs();
    updateView();
  } catch (err) { showToast(err.message, "error"); }
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
    <strong>Attempt:</strong> ${(job.attempt ?? 0) + 1} / ${(job.maxRetries ?? 0) + 1}
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

function showEditJobForm(id) {
  const job = jobs.find((j) => j.id === id);
  if (!job) { showToast("Job not found", "error"); return; }
  const modelOpts = MODELS.map((m) => `<option value="${m}" ${job.model === m ? "selected" : ""}>${m}</option>`).join("");

  $main.innerHTML = `
    <div class="view active" id="view-edit-job">
      <div class="form-container">
        <h2>Edit Prompt — ${h(job.id)}</h2>
        <div class="form-group">
          <label>Title</label>
          <input id="e-title" type="text" value="${h(job.title)}" maxlength="200">
        </div>
        <div class="form-group">
          <label>Prompt</label>
          <textarea id="e-prompt" style="min-height:160px;font-family:var(--mono);font-size:12px">${h(job.prompt)}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Model</label>
            <select id="e-model"><option value="">Default</option>${modelOpts}</select>
          </div>
          <div class="form-group">
            <label>Tags</label>
            <input id="e-tags" type="text" value="${h((job.tags || []).join(", "))}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Timeout (ms)</label>
            <input id="e-timeout" type="number" value="${job.timeoutMs}" min="10000" step="10000">
          </div>
          <div class="form-group">
            <label>Max Retries</label>
            <input id="e-retries" type="number" value="${job.maxRetries}" min="0" max="10">
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary btn-sm" id="btn-save-edit">Save</button>
          <button class="btn btn-sm" id="btn-cancel-edit">Cancel</button>
        </div>
      </div>
    </div>`;

  document.getElementById("btn-save-edit")?.addEventListener("click", async () => {
    try {
      const tags = document.getElementById("e-tags").value.split(",").map((t) => t.trim()).filter(Boolean);
      await api("PATCH", `/api/jobs/${id}`, {
        title: document.getElementById("e-title").value.trim(),
        prompt: document.getElementById("e-prompt").value.trim(),
        model: document.getElementById("e-model").value || undefined,
        tags,
        timeoutMs: parseInt(document.getElementById("e-timeout").value),
        maxRetries: parseInt(document.getElementById("e-retries").value),
      });
      showToast("Saved", "success");
      await loadJobs();
      updateView();
    } catch (err) { showToast(err.message, "error"); }
  });
  document.getElementById("btn-cancel-edit")?.addEventListener("click", () => updateView());
}

// ── Modal close handlers ──────────────────────────────────────────────
document.getElementById("log-close")?.addEventListener("click", () => {
  document.getElementById("log-modal")?.classList.add("hidden");
});
document.getElementById("log-modal")?.querySelector(".modal-overlay")?.addEventListener("click", () => {
  document.getElementById("log-modal")?.classList.add("hidden");
});
// Ticket, project, provider modals — close buttons use class selectors
document.querySelectorAll(".ticket-modal-close, .project-modal-close, .provider-modal-close").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest(".modal")?.classList.add("hidden"));
});
// Overlay click for form modals
document.querySelectorAll("#ticket-modal .modal-overlay, #project-modal .modal-overlay, #provider-modal .modal-overlay").forEach((ov) => {
  ov.addEventListener("click", () => ov.closest(".modal")?.classList.add("hidden"));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal").forEach((m) => m.classList.add("hidden"));
  }
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
  if (isNaN(d.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Kanban Board ───────────────────────────────────────────────────
async function loadTickets() {
  try {
    const qs = kanbanProjectId ? `?projectId=${kanbanProjectId}` : "";
    tickets = await api("GET", `/api/tickets${qs}`);
  } catch (err) { showToast("Failed to load tickets: " + err.message, "error"); }
}

function renderKanban() {
  const cols = {};
  KANBAN_COLUMNS.forEach((c) => { cols[c] = tickets.filter((t) => t.column === c); });

  const projectOpts = `<option value="">All Projects</option>` +
    projects.map((p) => `<option value="${p.id}" ${kanbanProjectId === p.id ? "selected" : ""}>${h(p.name)}</option>`).join("");

  const columnHtml = KANBAN_COLUMNS.map((col) => `
    <div class="kanban-column">
      <div class="kanban-column-header">
        <span class="kanban-col-title">${col}</span>
        <span class="kanban-col-count">${(cols[col] || []).length}</span>
      </div>
      <div class="kanban-cards" data-column="${col}">
        ${(cols[col] || []).map(renderTicketCard).join("")}
      </div>
    </div>`).join("");

  $main.innerHTML = `
    <div class="view active" id="view-kanban">
      <div class="section-header">
        <h2>Kanban Board</h2>
        <div class="queue-controls">
          <select id="kanban-project-filter" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:4px 8px;color:var(--text);font-size:12px">${projectOpts}</select>
          <button class="btn btn-sm" id="btn-refresh-kanban">Refresh</button>
          <button class="btn btn-primary btn-sm" id="btn-new-ticket">New Ticket</button>
        </div>
      </div>
      <div class="kanban-board">${columnHtml}</div>

    </div>`;

  document.getElementById("btn-refresh-kanban")?.addEventListener("click", async () => {
    await loadTickets();
    renderKanban();
  });
  document.getElementById("kanban-project-filter")?.addEventListener("change", async (e) => {
    kanbanProjectId = e.target.value || null;
    await loadTickets();
    renderKanban();
  });
  document.getElementById("btn-new-ticket")?.addEventListener("click", showTicketForm);
  bindTicketActions();
  bindKanbanDrag();
}

function renderTicketCard(t) {
  const prioClass = `prio-${t.priority}`;
  return `
    <div class="kanban-card ${prioClass}" data-id="${t.id}" draggable="true">
      <div class="kanban-card-title">${h(t.title)}</div>
      ${t.description ? `<div class="kanban-card-desc">${h(t.description.slice(0, 100))}${t.description.length > 100 ? "..." : ""}</div>` : ""}
      <div class="kanban-card-meta">
        ${t.tags?.length ? t.tags.map((tag) => `<span class="tag">${h(tag)}</span>`).join("") : ""}
        ${t.jobId ? `<span class="tag" style="background:var(--accent-dim);color:white">Job: ${t.jobId}</span>` : ""}
      </div>
      <div class="kanban-card-actions">
        <button class="btn btn-sm" data-action="move-ticket" data-id="${t.id}">Move</button>
        <button class="btn btn-sm" data-action="edit-ticket" data-id="${t.id}">Edit</button>
        <button class="btn btn-sm" data-action="run-ticket" data-id="${t.id}">Run</button>
        <button class="btn btn-danger btn-sm" data-action="delete-ticket" data-id="${t.id}">Del</button>
      </div>
    </div>`;
}

function bindTicketActions() {
  document.querySelectorAll("[data-action=move-ticket]").forEach((btn) => {
    btn.addEventListener("click", () => showMoveTicketForm(btn.dataset.id));
  });
  document.querySelectorAll("[data-action=edit-ticket]").forEach((btn) => {
    btn.addEventListener("click", () => showEditTicketForm(btn.dataset.id));
  });
  document.querySelectorAll("[data-action=run-ticket]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const t = tickets.find((x) => x.id === btn.dataset.id);
      if (!t) return;
      try {
        const job = await api("POST", "/api/jobs", {
          title: t.title,
          prompt: t.description || t.title,
          projectId: t.projectId,
          tags: [...t.tags, "kanban"],
        });
        await api("PATCH", `/api/tickets/${t.id}`, { jobId: job.id });
        showToast(`Job ${job.id} created`, "success");
        await loadTickets();
        renderKanban();
      } catch (err) { showToast(err.message, "error"); }
    });
  });
  document.querySelectorAll("[data-action=delete-ticket]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete ticket " + btn.dataset.id + "?")) return;
      try { await api("DELETE", `/api/tickets/${btn.dataset.id}`); await loadTickets(); renderKanban(); }
      catch (err) { showToast(err.message, "error"); }
    });
  });
}

function showTicketForm() {
  const modal = document.getElementById("ticket-modal");
  document.getElementById("ticket-modal-title").textContent = "New Ticket";
  document.getElementById("ticket-modal-body").innerHTML = `
    <div class="form-container">
      <div class="form-group">
        <label>Title</label>
        <input id="t-title" type="text" placeholder="Ticket title" required maxlength="200">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="t-desc" placeholder="Optional description" style="min-height:80px;font-family:var(--mono);font-size:12px"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Column</label>
          <select id="t-column">${KANBAN_COLUMNS.map((c) => `<option value="${c}">${c}</option>`).join("")}</select>
        </div>
        <div class="form-group">
          <label>Priority</label>
          <select id="t-priority">
            <option value="medium">medium</option>
            <option value="low">low</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Tags</label>
        <input id="t-tags" type="text" placeholder="e.g. bug, feature">
      </div>
      <div class="form-actions">
        <button class="btn btn-primary btn-sm" id="btn-create-ticket">Create</button>
        <button class="btn btn-sm" id="btn-cancel-ticket">Cancel</button>
      </div>
    </div>`;

  modal.classList.remove("hidden");

  document.getElementById("btn-create-ticket")?.addEventListener("click", async () => {
    const title = document.getElementById("t-title").value.trim();
    if (!title) { showToast("Title is required", "error"); return; }
    const tags = document.getElementById("t-tags").value.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      await api("POST", "/api/tickets", {
        title,
        description: document.getElementById("t-desc").value.trim(),
        column: document.getElementById("t-column").value,
        priority: document.getElementById("t-priority").value,
        projectId: kanbanProjectId || undefined,
        tags,
      });
      await loadTickets();
      renderKanban();
      modal.classList.add("hidden");
      showToast("Ticket created", "success");
    } catch (err) { showToast(err.message, "error"); }
  });
  document.getElementById("btn-cancel-ticket")?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });
}

function showMoveTicketForm(id) {
  const t = tickets.find((x) => x.id === id);
  if (!t) return;
  const modal = document.getElementById("ticket-modal");
  document.getElementById("ticket-modal-title").textContent = "Move Ticket — " + t.title;
  document.getElementById("ticket-modal-body").innerHTML = `
    <div class="form-container">
      <div class="form-group">
        <label>Move to Column</label>
        <select id="move-column">${KANBAN_COLUMNS.map((c) => `<option value="${c}" ${t.column === c ? "selected" : ""}>${c}</option>`).join("")}</select>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary btn-sm" id="btn-move-ticket">Move</button>
        <button class="btn btn-sm" id="btn-cancel-move">Cancel</button>
      </div>
    </div>`;

  modal.classList.remove("hidden");

  document.getElementById("btn-move-ticket")?.addEventListener("click", async () => {
    try {
      await api("POST", `/api/tickets/${id}/move`, { column: document.getElementById("move-column").value });
      await loadTickets();
      renderKanban();
      modal.classList.add("hidden");
      showToast("Ticket moved", "success");
    } catch (err) { showToast(err.message, "error"); }
  });
  document.getElementById("btn-cancel-move")?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });
}

function showEditTicketForm(id) {
  const t = tickets.find((x) => x.id === id);
  if (!t) return;
  const modal = document.getElementById("ticket-modal");
  document.getElementById("ticket-modal-title").textContent = "Edit Ticket — " + t.id;
  document.getElementById("ticket-modal-body").innerHTML = `
    <div class="form-container">
      <div class="form-group">
        <label>Title</label>
        <input id="et-title" type="text" value="${h(t.title)}" required maxlength="200">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="et-desc" style="min-height:80px;font-family:var(--mono);font-size:12px">${h(t.description || "")}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Priority</label>
          <select id="et-priority">
            ${["low","medium","high","critical"].map((p) => `<option value="${p}" ${t.priority === p ? "selected" : ""}>${p}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Tags</label>
          <input id="et-tags" type="text" value="${h((t.tags || []).join(", "))}">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary btn-sm" id="btn-save-ticket">Save</button>
        <button class="btn btn-sm" id="btn-cancel-edit-ticket">Cancel</button>
      </div>
    </div>`;

  modal.classList.remove("hidden");

  document.getElementById("btn-save-ticket")?.addEventListener("click", async () => {
    const tags = document.getElementById("et-tags").value.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      await api("PATCH", `/api/tickets/${id}`, {
        title: document.getElementById("et-title").value.trim(),
        description: document.getElementById("et-desc").value.trim(),
        priority: document.getElementById("et-priority").value,
        tags,
      });
      await loadTickets();
      renderKanban();
      modal.classList.add("hidden");
      showToast("Ticket saved", "success");
    } catch (err) { showToast(err.message, "error"); }
  });
  document.getElementById("btn-cancel-edit-ticket")?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });
}

// ── Settings ────────────────────────────────────────────────────────
async function loadSettings() {
  try { return await api("GET", "/api/settings"); }
  catch (_) { return null; }
}

async function renderSettings() {
  const s = await loadSettings();
  if (!s) { $main.innerHTML = "<p>Failed to load settings</p>"; return; }

  const providerCards = s.providers.map((p) => `
    <div class="project-card">
      <div class="project-card-header">
        <h3>${h(p.name)} ${p.isDefault ? '<span class="badge">Default</span>' : ""} ${!p.enabled ? '<span class="badge" style="background:var(--red)">Disabled</span>' : ""}</h3>
        <span class="project-card-path">${h(p.type)} &middot; ${h(p.defaultModel)} &middot; ${h(p.apiKeyEnvVar)}</span>
      </div>
      <div class="project-card-actions">
        <button class="btn btn-sm" data-action="edit-provider" data-id="${p.id}">Edit</button>
        <button class="btn btn-sm" data-action="toggle-provider" data-id="${p.id}">${p.enabled !== false ? "Disable" : "Enable"}</button>
        ${!p.isDefault ? `<button class="btn btn-sm" data-action="set-default-provider" data-id="${p.id}">Set Default</button>` : ""}
        ${!p.isDefault ? `<button class="btn btn-danger btn-sm" data-action="delete-provider" data-id="${p.id}">Delete</button>` : ""}
      </div>
    </div>`).join("");

  $main.innerHTML = `
    <div class="view active" id="view-settings">
      <div class="section-header">
        <h2>Settings</h2>
        <button class="btn btn-sm" id="btn-refresh-settings">Refresh</button>
      </div>

      <h3 style="margin:20px 0 8px">AI Providers</h3>
      ${providerCards || '<p style="color:var(--text-dim)">No providers configured.</p>'}


      <button class="btn btn-primary btn-sm" id="btn-add-provider" style="margin-top:12px">Add Provider</button>

      <h3 style="margin:24px 0 8px">Execution Defaults</h3>
      <div class="form-container" style="max-width:400px">
        <div class="form-row">
          <div class="form-group">
            <label>Timeout (ms)</label>
            <input id="s-timeout" type="number" value="${s.executionDefaults.timeoutMs}" min="10000" step="10000">
          </div>
          <div class="form-group">
            <label>Max Retries</label>
            <input id="s-retries" type="number" value="${s.executionDefaults.maxRetries}" min="0" max="10">
          </div>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-save-defaults">Save Defaults</button>
      </div>

      <h3 style="margin:24px 0 8px">Prompt Improvement</h3>
      <div class="form-container" style="max-width:400px">
        <div class="form-group">
          <label>Provider</label>
          <select id="s-pi-provider">${s.providers.map((p) => `<option value="${p.id}" ${s.promptImprovement?.providerId === p.id ? "selected" : ""}>${h(p.name)}</option>`).join("")}</select>
        </div>
        <div class="form-group">
          <label>Model</label>
          <input id="s-pi-model" type="text" value="${h(s.promptImprovement?.model || "")}" placeholder="e.g. deepseek-chat">
        </div>
        <button class="btn btn-primary btn-sm" id="btn-save-prompt-improvement">Save</button>
      </div>
    </div>`;

  document.getElementById("btn-refresh-settings")?.addEventListener("click", () => renderSettings());
  document.getElementById("btn-add-provider")?.addEventListener("click", showAddProviderForm);
  document.getElementById("btn-save-defaults")?.addEventListener("click", async () => {
    s.executionDefaults.timeoutMs = parseInt(document.getElementById("s-timeout").value);
    s.executionDefaults.maxRetries = parseInt(document.getElementById("s-retries").value);
    try { await api("PUT", "/api/settings", s); showToast("Saved", "success"); }
    catch (err) { showToast(err.message, "error"); }
  });
  document.getElementById("btn-save-prompt-improvement")?.addEventListener("click", async () => {
    s.promptImprovement = {
      providerId: document.getElementById("s-pi-provider").value,
      model: document.getElementById("s-pi-model").value.trim(),
    };
    try { await api("PUT", "/api/settings", s); showToast("Saved", "success"); }
    catch (err) { showToast(err.message, "error"); }
  });
  document.querySelectorAll("[data-action=set-default-provider]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try { await api("POST", `/api/settings/providers/${btn.dataset.id}/default`); renderSettings(); }
      catch (err) { showToast(err.message, "error"); }
    });
  });
  document.querySelectorAll("[data-action=edit-provider]").forEach((btn) => {
    btn.addEventListener("click", () => showEditProviderForm(btn.dataset.id, s));
  });
  document.querySelectorAll("[data-action=toggle-provider]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const prov = s.providers.find((x) => x.id === btn.dataset.id);
      if (!prov) return;
      try {
        await api("PUT", `/api/settings/providers/${btn.dataset.id}`, { enabled: prov.enabled === false ? true : false });
        renderSettings();
      } catch (err) { showToast(err.message, "error"); }
    });
  });
  document.querySelectorAll("[data-action=delete-provider]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete provider?")) return;
      try { await api("DELETE", `/api/settings/providers/${btn.dataset.id}`); renderSettings(); }
      catch (err) { showToast(err.message, "error"); }
    });
  });
}

function showAddProviderForm() {
  const modal = document.getElementById("provider-modal");
  document.getElementById("provider-modal-title").textContent = "Add Provider";
  document.getElementById("provider-modal-body").innerHTML = `
    <div class="form-container">
      <div class="form-row">
        <div class="form-group">
          <label>Name</label>
          <input id="p-name" type="text" placeholder="e.g. My Claude" required>
        </div>
        <div class="form-group">
          <label>Type</label>
          <select id="p-type"><option value="claude-cli">Claude CLI</option><option value="openai-compatible">OpenAI Compatible</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>API Key Env Var</label>
          <input id="p-key" type="text" placeholder="e.g. ANTHROPIC_AUTH_TOKEN" required>
        </div>
        <div class="form-group">
          <label>Default Model</label>
          <input id="p-model" type="text" placeholder="e.g. claude-sonnet-4-6" required>
        </div>
      </div>
      <div id="p-claude-fields">
        <div class="form-row">
          <div class="form-group">
            <label>Claude CLI Command</label>
            <input id="p-claude-cmd" type="text" value="claude">
          </div>
          <div class="form-group">
            <label>Claude CLI Flags</label>
            <input id="p-claude-flags" type="text" value="--dangerously-skip-permissions">
          </div>
        </div>
      </div>
      <div id="p-openai-fields" class="hidden">
        <div class="form-group">
          <label>Base URL</label>
          <input id="p-base-url" type="text" placeholder="e.g. https://api.deepseek.com/v1">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary btn-sm" id="btn-create-provider">Create</button>
        <button class="btn btn-sm" id="btn-cancel-provider">Cancel</button>
      </div>
    </div>`;

  modal.classList.remove("hidden");

  document.getElementById("p-type")?.addEventListener("change", (e) => {
    const isCLI = e.target.value === "claude-cli";
    document.getElementById("p-claude-fields").classList.toggle("hidden", !isCLI);
    document.getElementById("p-openai-fields").classList.toggle("hidden", isCLI);
  });
  document.getElementById("btn-create-provider")?.addEventListener("click", async () => {
    const name = document.getElementById("p-name").value.trim();
    const type = document.getElementById("p-type").value;
    const apiKeyEnvVar = document.getElementById("p-key").value.trim();
    const defaultModel = document.getElementById("p-model").value.trim();
    if (!name || !apiKeyEnvVar || !defaultModel) { showToast("Name, API key env var, and model are required", "error"); return; }
    const body = { name, type, apiKeyEnvVar, defaultModel };
    if (type === "claude-cli") {
      body.claudeCmd = document.getElementById("p-claude-cmd").value.trim();
      body.claudeFlags = document.getElementById("p-claude-flags").value.trim();
    } else {
      body.baseUrl = document.getElementById("p-base-url").value.trim() || undefined;
    }
    try { await api("POST", "/api/settings/providers", body); renderSettings(); modal.classList.add("hidden"); showToast("Provider added", "success"); }
    catch (err) { showToast(err.message, "error"); }
  });
  document.getElementById("btn-cancel-provider")?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });
}

function showEditProviderForm(id, s) {
  const p = s.providers.find((x) => x.id === id);
  if (!p) { showToast("Provider not found", "error"); return; }
  const modal = document.getElementById("provider-modal");
  document.getElementById("provider-modal-title").textContent = "Edit Provider";
  document.getElementById("provider-modal-body").innerHTML = `
    <div class="form-container">
      <div class="form-row">
        <div class="form-group">
          <label>Name</label>
          <input id="pe-name" type="text" value="${h(p.name)}" required>
        </div>
        <div class="form-group">
          <label>API Key Env Var</label>
          <input id="pe-key" type="text" value="${h(p.apiKeyEnvVar)}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Default Model</label>
          <input id="pe-model" type="text" value="${h(p.defaultModel)}" required>
        </div>
        <div class="form-group">
          <label>Base URL</label>
          <input id="pe-base-url" type="text" value="${h(p.baseUrl || '')}" placeholder="For OpenAI-compatible providers">
        </div>
      </div>
      ${p.type === "claude-cli" ? `
      <div class="form-row">
        <div class="form-group">
          <label>Claude Command</label>
          <input id="pe-claude-cmd" type="text" value="${h(p.claudeCmd || 'claude')}">
        </div>
        <div class="form-group">
          <label>Claude Flags</label>
          <input id="pe-claude-flags" type="text" value="${h(p.claudeFlags || '--dangerously-skip-permissions')}">
        </div>
      </div>` : ""}
      <div class="form-actions">
        <button class="btn btn-primary btn-sm" id="btn-save-edit-provider">Save</button>
        <button class="btn btn-sm" id="btn-cancel-edit-provider">Cancel</button>
      </div>
    </div>`;

  modal.classList.remove("hidden");

  document.getElementById("btn-save-edit-provider")?.addEventListener("click", async () => {
    const patch = {
      name: document.getElementById("pe-name").value.trim(),
      apiKeyEnvVar: document.getElementById("pe-key").value.trim(),
      defaultModel: document.getElementById("pe-model").value.trim(),
      baseUrl: document.getElementById("pe-base-url").value.trim() || undefined,
    };
    if (p.type === "claude-cli") {
      patch.claudeCmd = document.getElementById("pe-claude-cmd").value.trim();
      patch.claudeFlags = document.getElementById("pe-claude-flags").value.trim();
    }
    try { await api("PUT", `/api/settings/providers/${id}`, patch); renderSettings(); modal.classList.add("hidden"); showToast("Provider updated", "success"); }
    catch (err) { showToast(err.message, "error"); }
  });
  document.getElementById("btn-cancel-edit-provider")?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });
}

// ── Init ────────────────────────────────────────────────────────────
async function init() {
  initSSE();
  await Promise.all([loadJobs(), loadProjects(), loadTickets()]);
  renderView();
}

document.addEventListener("DOMContentLoaded", init);
