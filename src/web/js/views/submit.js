// ── SARAB Frontend — Submit view ────────────────────────────────

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
              <label for="f-timeout">Hard Timeout (ms, 0 = none)</label>
              <input id="f-timeout" type="number" value="0" min="0" step="60000">
              <div class="hint">Hard deadline. 0 = run indefinitely until naturally done or idle timeout.</div>
            </div>
            <div class="form-group">
              <label for="f-idle-timeout">Idle Timeout (ms, 0 = none)</label>
              <input id="f-idle-timeout" type="number" value="1800000" min="0" step="60000">
              <div class="hint">Kill if no output for this long. Default 30 min.</div>
            </div>
          </div>
          <div class="form-row">
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

  const allBtns = document.querySelectorAll(".action-btn");
  allBtns.forEach((b) => { b.disabled = true; });
  btn.classList.add("loading");
  btn.textContent = actionLabels[action] + "...";

  try {
    const data = await api("POST", "/api/prompt/improve", { prompt, action });
    textarea.value = data.result;
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
      timeoutMs: parseInt(document.getElementById("f-timeout").value) || 0,
      idleTimeoutMs: parseInt(document.getElementById("f-idle-timeout").value) || 0,
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
