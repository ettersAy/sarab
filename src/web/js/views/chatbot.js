// ── SARAB Frontend — Chatbot view ──────────────────────────────

let chatbotConversationId = null;
let chatbotMessages = [];
let chatbotLoading = false;

function renderChatbot() {
  const projectOpts = `<option value="">Select a project...</option>` +
    projects.map((p) => `<option value="${p.id}" ${currentProjectId === p.id ? "selected" : ""}>${h(p.name)}</option>`).join("");

  const messagesHtml = chatbotMessages.map(renderChatMessage).join("");

  $main.innerHTML = `
    <div class="view active" id="view-chatbot">
      <div class="chatbot-layout">
        <div class="chatbot-sidebar">
          <div class="form-group" style="margin-bottom:16px">
            <label>Project</label>
            <select id="chat-project">${projectOpts}</select>
          </div>
          <div class="form-group" style="margin-bottom:16px">
            <label>Model</label>
            <select id="chat-model">
              ${MODELS.map((m) => `<option value="${m}">${m}</option>`).join("")}
            </select>
          </div>
          <button class="btn btn-sm" id="btn-new-chat" style="width:100%;margin-bottom:8px">New Chat</button>
          <button class="btn btn-danger btn-sm" id="btn-clear-chat" style="width:100%">Clear Chat</button>
          <div id="chat-context-info" style="margin-top:16px;font-size:11px;color:var(--text-dim)"></div>
        </div>
        <div class="chatbot-main">
          <div class="chatbot-messages" id="chat-messages">
            ${messagesHtml || `<div class="empty-state"><div class="empty-icon">&#128172;</div><p>Select a project and ask a question.</p></div>`}
          </div>
          <div class="chatbot-input-area">
            <div style="display:flex;gap:8px">
              <input id="chat-input" type="text" placeholder="Ask about this project..." style="flex:1;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:10px 14px;color:var(--text);font-size:13px;font-family:var(--font)">
              <button class="btn btn-primary" id="btn-chat-send" ${chatbotLoading ? "disabled" : ""}>${chatbotLoading ? "..." : "Send"}</button>
            </div>
            <div class="chatbot-quick-actions" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-sm quick-btn" data-q="What is this project about?">About</button>
              <button class="btn btn-sm quick-btn" data-q="Summarize the project architecture">Architecture</button>
              <button class="btn btn-sm quick-btn" data-q="What are the main features?">Features</button>
              <button class="btn btn-sm quick-btn" data-q="How do I run this project?">How to run</button>
              <button class="btn btn-sm quick-btn" data-q="What are the key files?">Key files</button>
              <button class="btn btn-sm quick-btn" data-q="Explain the project structure">Structure</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById("chat-project")?.addEventListener("change", onChatProjectChange);
  document.getElementById("btn-new-chat")?.addEventListener("click", startNewChat);
  document.getElementById("btn-clear-chat")?.addEventListener("click", startNewChat);
  document.getElementById("btn-chat-send")?.addEventListener("click", sendChatMessage);
  document.getElementById("chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  document.querySelectorAll(".quick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("chat-input").value = btn.dataset.q;
      sendChatMessage();
    });
  });

  // Restore project selection
  if (currentProjectId) {
    const sel = document.getElementById("chat-project");
    if (sel) sel.value = currentProjectId;
  }
}

function onChatProjectChange(e) {
  currentProjectId = e.target.value || null;
  startNewChat();
}

function startNewChat() {
  chatbotConversationId = null;
  chatbotMessages = [];
  const msgEl = document.getElementById("chat-messages");
  if (msgEl) msgEl.innerHTML = `<div class="empty-state"><div class="empty-icon">&#128172;</div><p>Select a project and ask a question.</p></div>`;
}

function renderChatMessage(m) {
  const isUser = m.role === "user";
  return `<div class="chat-message ${isUser ? "chat-user" : "chat-assistant"}">
    <div class="chat-message-role">${isUser ? "You" : "AI"}</div>
    <div class="chat-message-content">${isUser ? h(m.content) : formatAIResponse(m.content)}</div>
    ${m.error ? `<div class="chat-message-error">Error: ${h(m.error)}</div>` : ""}
    ${!isUser && m.contextFiles?.length ? `<div class="chat-message-context">Context: ${m.contextFiles.map((f) => h(f)).join(", ")}</div>` : ""}
    <div class="chat-message-time">${fmtTime(m.createdAt)}</div>
  </div>`;
}

function formatAIResponse(text) {
  if (!text) return '<span style="color:var(--text-dim)">(empty response)</span>';
  // Basic markdown: code blocks and newlines
  let out = h(text);
  out = out.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre class="chat-code-block">$2</pre>');
  out = out.replace(/\n/g, "<br>");
  return out;
}

async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const question = input.value.trim();
  if (!question || chatbotLoading) return;

  const projectId = document.getElementById("chat-project")?.value;
  if (!projectId) {
    showToast("Select a project first", "error");
    return;
  }
  currentProjectId = projectId;

  chatbotLoading = true;
  const sendBtn = document.getElementById("btn-chat-send");
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "..."; }
  input.value = "";

  // Add user message immediately
  chatbotMessages.push({ role: "user", content: question, createdAt: new Date().toISOString() });
  renderMessages();

  try {
    const model = document.getElementById("chat-model")?.value;
    const body = {
      projectId,
      question,
      conversationId: chatbotConversationId,
      model: model || undefined,
    };
    const data = await api("POST", "/api/chatbot/ask", body);

    chatbotConversationId = data.conversationId;
    chatbotMessages.push({ ...data.message, createdAt: data.message.createdAt });

    // Show context info
    const ctxInfo = document.getElementById("chat-context-info");
    if (ctxInfo && data.contextUsed?.length) {
      ctxInfo.innerHTML = `<strong>Context used:</strong><br>${data.contextUsed.map((c) =>
        c.error
          ? `<span style="color:var(--red)">${h(c.path)}: ${h(c.error)}</span>`
          : `<span>${h(c.path)} (${(c.size / 1024).toFixed(1)} KB)</span>`
      ).join("<br>")}`;
    }
  } catch (err) {
    chatbotMessages.push({ role: "assistant", content: "", error: err.message, createdAt: new Date().toISOString() });
    showToast(err.message, "error");
  } finally {
    chatbotLoading = false;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
    renderMessages();
    input.focus();
  }
}

function renderMessages() {
  const msgEl = document.getElementById("chat-messages");
  if (!msgEl) return;
  msgEl.innerHTML = chatbotMessages.map(renderChatMessage).join("");
  msgEl.scrollTop = msgEl.scrollHeight;
}
