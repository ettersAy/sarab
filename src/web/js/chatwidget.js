// ── SARAB Frontend — Floating Chat Widget ───────────────────

let cwConversationId = null;
let cwMessages = [];
let cwLoading = false;
let cwVisible = false;
let cwModels = MODELS.slice();

document.addEventListener("DOMContentLoaded", () => {
  const fab = document.getElementById("chat-fab");
  const close = document.getElementById("chat-widget-close");
  const clear = document.getElementById("chat-widget-clear");
  const send = document.getElementById("cw-send");
  const input = document.getElementById("cw-input");
  const projectSel = document.getElementById("cw-project");

  fab.addEventListener("click", toggleChatWidget);
  close.addEventListener("click", () => { hideChatWidget(); });
  clear.addEventListener("click", startNewChat);
  send.addEventListener("click", sendCwMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCwMessage();
    }
  });
  projectSel.addEventListener("change", () => {
    currentProjectId = projectSel.value || null;
    startNewChat();
  });

  loadChatModels();
});

async function loadChatModels() {
  try {
    const settings = await api("GET", "/api/settings");
    const chatModel = settings.chatDefaults?.model;
    if (chatModel && !cwModels.includes(chatModel)) {
      cwModels.unshift(chatModel);
    }
    const sel = document.getElementById("cw-model");
    if (sel) {
      sel.innerHTML = cwModels.map((m) =>
        `<option value="${m}" ${m === chatModel ? "selected" : ""}>${m}</option>`
      ).join("");
    }
  } catch (_) { /* keep defaults */ }
}

function toggleChatWidget() {
  if (cwVisible) { hideChatWidget(); }
  else { showChatWidget(); }
}

function showChatWidget() {
  const widget = document.getElementById("chat-widget");
  widget.classList.remove("hidden");
  cwVisible = true;
  refreshProjectSelect();
  if (currentProjectId) {
    document.getElementById("cw-project").value = currentProjectId;
  }
  document.getElementById("cw-input").focus();
}

function hideChatWidget() {
  document.getElementById("chat-widget").classList.add("hidden");
  cwVisible = false;
}

function refreshProjectSelect() {
  const sel = document.getElementById("cw-project");
  if (!sel) return;
  sel.innerHTML = `<option value="">Select project...</option>` +
    projects.map((p) => `<option value="${p.id}" ${currentProjectId === p.id ? "selected" : ""}>${h(p.name)}</option>`).join("");
}

function startNewChat() {
  cwConversationId = null;
  cwMessages = [];
  renderCwMessages();
}

function renderCwMessages() {
  const el = document.getElementById("cw-messages");
  if (!el) return;
  if (cwMessages.length === 0) {
    el.innerHTML = `<div class="chat-widget-empty">Ask a question about your project.</div>`;
    return;
  }
  el.innerHTML = cwMessages.map(renderCwMessage).join("");
  el.scrollTop = el.scrollHeight;
}

function renderCwMessage(m) {
  const isUser = m.role === "user";
  let content = isUser ? h(m.content) : formatCwResponse(m.content);
  return `<div class="cw-msg ${isUser ? "cw-msg-user" : "cw-msg-assistant"}">
    <div>${content}</div>
    ${m.error ? `<div class="cw-msg-error">${h(m.error)}</div>` : ""}
    <div class="cw-msg-time">${fmtTime(m.createdAt)}</div>
  </div>`;
}

function formatCwResponse(text) {
  if (!text) return '<span style="color:var(--text-dim)">(empty)</span>';
  let out = h(text);
  out = out.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre>$2</pre>');
  out = out.replace(/\n/g, "<br>");
  return out;
}

async function sendCwMessage() {
  const input = document.getElementById("cw-input");
  const question = input.value.trim();
  if (!question || cwLoading) return;

  const projectId = document.getElementById("cw-project")?.value;
  if (!projectId) {
    showToast("Select a project first", "error");
    return;
  }
  currentProjectId = projectId;

  cwLoading = true;
  const sendBtn = document.getElementById("cw-send");
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "..."; }
  input.value = "";
  input.focus();

  cwMessages.push({ role: "user", content: question, createdAt: new Date().toISOString() });
  renderCwMessages();

  try {
    const model = document.getElementById("cw-model")?.value;
    const body = {
      projectId,
      question,
      conversationId: cwConversationId,
      model: model || undefined,
    };
    const data = await api("POST", "/api/chatbot/ask", body);
    cwConversationId = data.conversationId;
    cwMessages.push(data.message);
  } catch (err) {
    cwMessages.push({ role: "assistant", content: "", error: err.message, createdAt: new Date().toISOString() });
  } finally {
    cwLoading = false;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
    renderCwMessages();
  }
}
