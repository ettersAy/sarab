// ── SARAB Frontend — Modal close handlers ───────────────────────

document.getElementById("log-close")?.addEventListener("click", () => {
  document.getElementById("log-modal")?.classList.add("hidden");
});
document.getElementById("log-modal")?.querySelector(".modal-overlay")?.addEventListener("click", () => {
  document.getElementById("log-modal")?.classList.add("hidden");
});

document.querySelectorAll(".ticket-modal-close, .project-modal-close, .provider-modal-close").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest(".modal")?.classList.add("hidden"));
});

document.querySelectorAll("#ticket-modal .modal-overlay, #project-modal .modal-overlay, #provider-modal .modal-overlay").forEach((ov) => {
  ov.addEventListener("click", () => ov.closest(".modal")?.classList.add("hidden"));
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal").forEach((m) => m.classList.add("hidden"));
  }
});
