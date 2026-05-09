// ── SARAB Frontend — Settings view ──────────────────────────────

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
