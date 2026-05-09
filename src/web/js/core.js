// ── SARAB Frontend — Core (state, routing, SSE, helpers) ──────

const MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-4-20250501",
];

// ── State ───────────────────────────────────────────────────────
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

// ── DOM refs ────────────────────────────────────────────────────
const $main = document.getElementById("main");
const $indicator = document.getElementById("queue-indicator");
const $label = document.getElementById("queue-label");

// ── SSE ─────────────────────────────────────────────────────────
let sseConnected = false;
let sseWasDisconnected = false;

function initSSE() {
  const es = new EventSource("/api/events");
  es.onopen = () => {
    sseConnected = true;
    updateIndicator();
    if (sseWasDisconnected) {
      sseWasDisconnected = false;
      loadJobs().catch(() => {});
      loadTickets().catch(() => {});
    }
  };
  es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleSSE(msg);
    } catch (_) { /* ignore malformed */ }
  };
  es.onerror = () => {
    sseConnected = false;
    sseWasDisconnected = true;
    updateIndicator();
  };
}

let heartbeats = {};

function handleSSE(msg) {
  switch (msg.type) {
    case "stats":
      stats = msg.payload;
      updateIndicator();
      if (currentView === "dashboard") renderDashboard();
      break;
    case "job-heartbeat":
      heartbeats[msg.payload.jobId] = msg.payload.at;
      if (currentView === "queue") updateHeartbeatDisplay();
      break;
    case "job-started":
      heartbeats[msg.payload.id] = new Date().toISOString();
      replaceJob(msg.payload);
      updateView();
      break;
    case "job-completed":
    case "job-failed":
    case "job-cancelled":
      delete heartbeats[msg.payload.id];
      replaceJob(msg.payload);
      updateView();
      break;
    case "job-retrying":
      replaceJob(msg.payload);
      updateView();
      break;
  }
}

function updateHeartbeatDisplay() {
  document.querySelectorAll(".job-last-activity").forEach((el) => {
    const jobId = el.dataset.jobId;
    const at = heartbeats[jobId];
    if (at) {
      const secs = Math.round((Date.now() - new Date(at).getTime()) / 1000);
      el.textContent = secs < 60 ? `active ${secs}s ago` : `active ${Math.floor(secs/60)}m ago`;
      el.style.color = secs < 120 ? "var(--green)" : "var(--yellow)";
    }
  });
}

// Update heartbeat display every 10 seconds
setInterval(updateHeartbeatDisplay, 10000);

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

// ── Navigation ──────────────────────────────────────────────────
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
  else if (currentView === "chatbot") renderChatbot();
  else if (currentView === "settings") renderSettings();
}

// ── API helpers ─────────────────────────────────────────────────
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

// ── Toast ───────────────────────────────────────────────────────
function showToast(msg, type) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = "toast " + type;
  setTimeout(() => toast.classList.add("hidden"), 3500);
}

// ── Helpers ─────────────────────────────────────────────────────
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

// ── Error boundary ──────────────────────────────────────────────
window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
  console.error("Unhandled rejection:", msg);
  showToast("Something went wrong: " + msg, "error");
});

// ── Init ────────────────────────────────────────────────────────
async function init() {
  initSSE();
  try {
    await Promise.all([loadJobs(), loadProjects(), loadTickets()]);
  } catch (err) {
    showToast("Failed to load initial data: " + (err.message || err), "error");
  }
  try {
    renderView();
  } catch (err) {
    $main.innerHTML = `<div class="empty-state"><p style="color:var(--red)">Failed to render view. Check console for details.</p></div>`;
    console.error("renderView error:", err);
  }
}

document.addEventListener("DOMContentLoaded", init);
