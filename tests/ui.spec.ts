import { test, expect } from "@playwright/test";

// ── Navigation ───────────────────────────────────────────────
test("Dashboard is the default view", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".stats-grid")).toBeVisible();
  await expect(page.locator(".recent-jobs")).toBeVisible();
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
  await expect(cards).toHaveCount(6);
  const labels = ["pending", "running", "completed", "failed", "cancelled", "total"];
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
  const filters = ["all", "pending", "running", "completed", "failed", "cancelled"];
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
