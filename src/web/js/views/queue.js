// ── SARAB Frontend — Queue view ─────────────────────────────────

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
