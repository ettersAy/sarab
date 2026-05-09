// ── SARAB Frontend — Dashboard view ────────────────────────────

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
