// ── SARAB Frontend — Projects view ──────────────────────────────

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
        <label>Source</label>
        <select id="f-project-source" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;font-family:var(--font)">
          <option value="local">Local Directory</option>
          <option value="github">GitHub Repository</option>
        </select>
      </div>
      <div id="f-local-fields">
        <div class="form-group">
          <label>Root Path</label>
          <input id="f-project-path" type="text" placeholder="e.g. /home/user/projects/my-app" required>
          <div class="hint">Claude commands will run from this directory.</div>
        </div>
      </div>
      <div id="f-github-fields" class="hidden">
        <div class="form-group">
          <label>GitHub URL</label>
          <input id="f-project-repo" type="text" placeholder="https://github.com/user/repo.git" required>
          <div class="hint">The repo will be cloned automatically. Local path is auto-generated.</div>
        </div>
        <div class="form-group">
          <label>Local Path (optional)</label>
          <input id="f-project-path-gh" type="text" placeholder="Leave blank for auto: /srv/dev/sarab/repos/[repo-name]">
          <div class="hint">Override the auto-generated clone destination.</div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary btn-sm" id="btn-create-project">Create</button>
        <button class="btn btn-sm" id="btn-cancel-project">Cancel</button>
      </div>
    </div>`;

  modal.classList.remove("hidden");

  // Toggle between local and GitHub modes
  document.getElementById("f-project-source")?.addEventListener("change", (e) => {
    const isGithub = e.target.value === "github";
    document.getElementById("f-local-fields").classList.toggle("hidden", isGithub);
    document.getElementById("f-github-fields").classList.toggle("hidden", !isGithub);
  });

  document.getElementById("btn-create-project")?.addEventListener("click", async () => {
    const name = document.getElementById("f-project-name").value.trim();
    if (!name) { showToast("Name is required", "error"); return; }
    const source = document.getElementById("f-project-source").value;
    const body = { name };

    if (source === "github") {
      body.repoUrl = document.getElementById("f-project-repo").value.trim();
      if (!body.repoUrl) { showToast("GitHub URL is required", "error"); return; }
      const ghPath = document.getElementById("f-project-path-gh").value.trim();
      if (ghPath) body.rootPath = ghPath;
    } else {
      body.rootPath = document.getElementById("f-project-path").value.trim();
      if (!body.rootPath) { showToast("Root path is required", "error"); return; }
    }

    try {
      showToast("Creating project...", "success");
      await api("POST", "/api/projects", body);
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
