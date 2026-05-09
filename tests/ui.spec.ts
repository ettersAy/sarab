import { test, expect } from "@playwright/test";

// ── Navigation ───────────────────────────────────────────────
test("Dashboard is the default view", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".stats-grid")).toBeVisible();
  await expect(page.locator(".recent-jobs").first()).toBeVisible();
});

test("Queue view loads via navigation", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="queue"]');
  await expect(page.locator(".queue-filter")).toBeVisible();
  // Table or empty state should be present
  const table = page.locator(".job-table");
  const empty = page.locator(".empty-state");
  await expect(table.or(empty).first()).toBeVisible();
});

test("Submit form loads via navigation", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="submit"]');
  await expect(page.locator("#submit-form")).toBeVisible();
  await expect(page.locator("#f-title")).toBeVisible();
  await expect(page.locator("#f-prompt")).toBeVisible();
});

test("Navigation buttons highlight active view", async ({ page }) => {
  await page.goto("/");
  const dashBtn = page.locator('button[data-view="dashboard"]');
  const queueBtn = page.locator('button[data-view="queue"]');

  await expect(dashBtn).toHaveClass(/active/);
  await queueBtn.click();
  await expect(queueBtn).toHaveClass(/active/);
  await expect(dashBtn).not.toHaveClass(/active/);
});

// ── Dashboard ────────────────────────────────────────────────
test("Dashboard shows stats cards", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator(".stat-card");
  await expect(cards).toHaveCount(7);
  const labels = ["pending", "running", "completed", "failed", "cancelled", "stopped", "total"];
  for (const label of labels) {
    await expect(page.locator(`.stat-card.${label}`)).toBeVisible();
  }
});

test("Dashboard shows refresh button", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#btn-refresh")).toBeVisible();
});

// ── Submit form ──────────────────────────────────────────────
test("Submit form has all fields", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="submit"]');
  await expect(page.locator("#f-title")).toBeVisible();
  await expect(page.locator("#f-prompt")).toBeVisible();
  await expect(page.locator("#f-model")).toBeVisible();
  await expect(page.locator("#f-tags")).toBeVisible();
  await expect(page.locator("#f-timeout")).toBeVisible();
  await expect(page.locator("#f-retries")).toBeVisible();
  await expect(page.locator("#btn-submit")).toBeVisible();
});

test("Submit form creates a job and navigates to queue", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="submit"]');
  await page.fill("#f-title", "UI Test Job");
  await page.fill("#f-prompt", "Echo hello from UI test");
  await page.fill("#f-tags", "test, ui");
  await page.click("#btn-submit");

  // Should navigate to queue after submission
  await expect(page.locator(".queue-filter")).toBeVisible();
  // Toast should appear
  await expect(page.locator(".toast.success")).toBeVisible();
});

test("Submit form validates required title", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="submit"]');
  await page.fill("#f-title", "");
  await page.fill("#f-prompt", "");
  // HTML5 validation should prevent submission
  const isInvalid = await page.evaluate(() => {
    const el = document.getElementById("f-title") as HTMLInputElement;
    return !el?.checkValidity();
  });
  expect(isInvalid).toBe(true);
});

// ── Queue ────────────────────────────────────────────────────
test("Queue has filter buttons", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="queue"]');
  const filters = ["all", "pending", "running", "completed", "failed", "cancelled", "stopped"];
  for (const f of filters) {
    await expect(page.locator(`.filter-btn[data-filter="${f}"]`)).toBeVisible();
  }
});

test("Queue shows pause button", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="queue"]');
  await expect(page.locator("#btn-pause")).toBeVisible();
});

test("Queue filter changes active state on click", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="queue"]');
  const pendingBtn = page.locator('.filter-btn[data-filter="pending"]');
  await pendingBtn.click();
  await expect(pendingBtn).toHaveClass(/active/);
});

// ── Log modal ────────────────────────────────────────────────
test("Log modal is hidden initially", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#log-modal")).toHaveClass(/hidden/);
});

// ── SSE connection ───────────────────────────────────────────
test("Topbar shows worker indicator", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#queue-indicator")).toBeVisible();
  await expect(page.locator("#queue-label")).toBeVisible();
  // SSE should connect and show state
  await expect(page.locator("#queue-label")).toContainText(/Worker|Disconnected/);
});

// ── Queue renders job table or empty state ───────────────────
test("Queue renders table or empty state after navigation", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="queue"]');
  // Either a job table or empty state should be visible
  const table = page.locator(".job-table");
  const empty = page.locator(".empty-state");
  await expect(table.or(empty).first()).toBeVisible();
});

// ── Project persistence ─────────────────────────────────────────
test("Projects view renders with create button", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="projects"]');
  await expect(page.locator("#view-projects")).toBeVisible();
  await expect(page.locator("#btn-new-project")).toBeVisible();
});

test("Create project form has required fields", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="projects"]');
  await page.click("#btn-new-project");
  await expect(page.locator("#project-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#f-project-name")).toBeVisible();
  await expect(page.locator("#f-project-path")).toBeVisible();
  await expect(page.locator("#btn-create-project")).toBeVisible();
  await expect(page.locator("#btn-cancel-project")).toBeVisible();
});

test("Create project and verify it appears in list", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="projects"]');
  await page.click("#btn-new-project");

  const projectName = "UI-Project-" + Date.now();
  await page.fill("#f-project-name", projectName);
  await page.fill("#f-project-path", "/tmp");
  await page.click("#btn-create-project");

  // Should show success toast and project should appear
  await expect(page.locator(".toast.success")).toBeVisible();
  // Modal should close
  await expect(page.locator("#project-modal")).toHaveClass(/hidden/);
  // Project card should appear
  await expect(page.locator(`.project-card:has-text("${projectName}")`)).toBeVisible();
});

// ── Kanban ticket persistence ───────────────────────────────────
test("Kanban renders with column headers", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="kanban"]');
  const cols = ["backlog", "ready", "in-progress", "paused", "testing", "done"];
  for (const col of cols) {
    await expect(page.locator(`.kanban-column:has-text("${col}")`)).toBeVisible();
  }
});

test("New ticket form opens from kanban", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="kanban"]');
  await page.click("#btn-new-ticket");
  await expect(page.locator("#ticket-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#t-title")).toBeVisible();
  await expect(page.locator("#btn-create-ticket")).toBeVisible();
});

test("Create ticket and verify it appears in backlog", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="kanban"]');
  await page.click("#btn-new-ticket");

  const ticketTitle = "UI-Ticket-" + Date.now();
  await page.fill("#t-title", ticketTitle);
  await page.selectOption("#t-column", "backlog");
  await page.click("#btn-create-ticket");

  // Should see success toast
  await expect(page.locator(".toast.success")).toBeVisible();
  // Modal should close
  await expect(page.locator("#ticket-modal")).toHaveClass(/hidden/);
  // Ticket should appear in the backlog column's card list
  await expect(page.locator(`.kanban-card:has-text("${ticketTitle}")`)).toBeVisible();
});

// ── Prompt submission ───────────────────────────────────────────
test("Submit prompt navigates to queue with success toast", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="submit"]');
  await page.fill("#f-title", "UI Persist Prompt");
  await page.fill("#f-prompt", "This is a UI persistence test prompt");
  await page.click("#btn-submit");

  // Should navigate to queue
  await expect(page.locator(".queue-filter")).toBeVisible();
  // Toast should show
  await expect(page.locator(".toast.success")).toBeVisible();
});

// ── Chatbot ──────────────────────────────────────────────────────
test("Chatbot view loads via navigation", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="chatbot"]');
  await expect(page.locator("#view-chatbot")).toBeVisible();
  await expect(page.locator("#chat-input")).toBeVisible();
  await expect(page.locator("#btn-chat-send")).toBeVisible();
});

test("Chatbot shows project selector", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="chatbot"]');
  await expect(page.locator("#chat-project")).toBeVisible();
});

test("Chatbot has quick action buttons", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="chatbot"]');
  const quickBtns = page.locator(".quick-btn");
  await expect(quickBtns.first()).toBeVisible();
  expect(await quickBtns.count()).toBeGreaterThanOrEqual(4);
});

test("Chatbot shows empty state initially", async ({ page }) => {
  await page.goto("/");
  await page.click('button[data-view="chatbot"]');
  await expect(page.locator(".empty-state")).toBeVisible();
});

// ── Wiki ─────────────────────────────────────────────────────────
test("Wiki home page loads", async ({ page }) => {
  await page.goto("/wiki/");
  await expect(page.locator("h1")).toContainText("SARAB");
  await expect(page.locator(".feature-grid")).toBeVisible();
});

test("Wiki architecture page loads with nav", async ({ page }) => {
  await page.goto("/wiki/architecture.html");
  await expect(page.locator("h1")).toContainText("Architecture");
  await expect(page.locator("nav")).toBeVisible();
});

test("Wiki nav links to all pages", async ({ page }) => {
  await page.goto("/wiki/");
  const links = page.locator("nav a[href^='/wiki/']");
  await expect(links.first()).toBeVisible();
  expect(await links.count()).toBeGreaterThanOrEqual(8);
});
