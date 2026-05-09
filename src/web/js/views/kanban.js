// ── SARAB Frontend — Kanban view ───────────────────────────────

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

function bindKanbanDrag() {
  let dragOverCounter = {};

  document.querySelectorAll(".kanban-card[draggable]").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", card.dataset.id);
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });
  });

  document.querySelectorAll(".kanban-cards").forEach((col) => {
    const colName = col.dataset.column;
    dragOverCounter[colName] = 0;

    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });

    col.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragOverCounter[colName] = (dragOverCounter[colName] || 0) + 1;
      col.classList.add("drag-over");
    });

    col.addEventListener("dragleave", () => {
      dragOverCounter[colName] = Math.max(0, (dragOverCounter[colName] || 0) - 1);
      if (dragOverCounter[colName] === 0) {
        col.classList.remove("drag-over");
      }
    });

    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      dragOverCounter[colName] = 0;
      col.classList.remove("drag-over");

      const ticketId = e.dataTransfer.getData("text/plain");
      const targetColumn = col.dataset.column;
      const ticket = tickets.find((t) => t.id === ticketId);
      if (!ticket || ticket.column === targetColumn) return;

      try {
        await api("POST", `/api/tickets/${ticketId}/move`, { column: targetColumn });
        await loadTickets();
        renderKanban();
        showToast(`Moved to ${targetColumn}`, "success");
      } catch (err) { showToast(err.message, "error"); }
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
