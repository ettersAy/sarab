// ── SARAB Frontend — Job actions ────────────────────────────────

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
