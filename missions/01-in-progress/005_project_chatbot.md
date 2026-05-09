# Self-Reflection: All SARAB Missions (001-004)

## Executive Summary

5 missions executed across ~10 hours. 92 tests, 0 failures. 9 git commits. Primary architecture debt: monolithic frontend (1488 lines).

---

## Mission-by-Mission Analysis

### Mission 001 — MVP Build
- **What worked**: Backend architecture is solid. JSONL pattern, AppError hierarchy, factory-function DI all held up well.
- **What failed**: Frontend was entirely missing (`app.js` didn't exist). Smoke test needed 3 iterations to fix (port env var, SSE timeout, cancel timing).
- **Root cause**: No initial audit of what existed vs. what was needed. Should have checked `index.html` script references first.
- **Lesson**: Always check `<script>` tags in HTML against actual files on disk.

### Mission 002 — Projects, Sessions & Settings
- **What worked**: Data model extensions were clean. Session capture from stderr is elegant. DeepSeek executor was a good addition.
- **What failed**: 
  - `: any` in JS file crashed frontend (happened TWICE in this mission alone)
  - Settings system was decorative — `createExecutor()` was never called until self-reflection fixed it
  - Missing `.hidden` CSS class broken toggle/hide everywhere
  - Duplicate function body left in app.js created syntax error
- **Root cause**: Building too fast without syntax-checking JS file after each change. Settings were wired in types but not in server.ts.
- **Lesson**: Run `node -c app.js` after EVERY JS edit. Always verify new code is actually CALLED, not just defined.

### Mission 003 — Execution Modes
- **What worked**: Stop/Resume was straightforward. Live log streaming via onOutput callback clean.
- **What failed**: Minor — stat card count changed (6→7) breaking UI test. Filter button count also broke.
- **Root cause**: State-dependent UI tests that assert exact counts.
- **Lesson**: UI tests should use `.toBeGreaterThanOrEqual()` instead of `.toHaveCount(N)` for dynamic UI elements.

### Mission 004 — Kanban Board
- **What worked**: TicketStore pattern (copied from JobStore) was fast to implement. 8 tests added quickly.
- **What failed**: `.recent-jobs` class duplicate broke dashboard test (2 elements matched). Kanban board is not mobile-optimized.
- **Root cause**: Reusing CSS class names across different sections. No UI tests for Kanban board.
- **Lesson**: Never reuse generic CSS classes for different semantic sections. Add UI tests for every new view.

---

## Patterns of Repeated Mistakes

### 1. TypeScript syntax in plain JS files (3 occurrences)
- Mission 002: `const body: any = {...}` (twice)
- Mission 004: `const body: any = {...}` (once)
- **Fix needed**: Add pre-commit hook or lint step that catches `: any` in .js files

### 2. Forgotten CSS class definitions (2 occurrences)
- Mission 002: `.hidden` was only defined for `.modal.hidden` and `.toast.hidden`
- Mission 004: `.recent-jobs` duplicated for different semantic sections
- **Fix needed**: Audit CSS after each UI change, use unique class names

### 3. Monolithic app.js growth
- Started at ~500 lines (Mission 001)
- Now at 1488 lines (Mission 004)
- Every feature adds 100-300 lines
- **Fix needed**: Split into ES modules BEFORE it hits 1000 lines (already past)

### 4. Settings/config wiring gap
- Mission 002: Settings stored but never read at runtime
- Mission 004: Project settings stored but templates never used
- **Fix needed**: When adding a storage layer, ALWAYS add the runtime integration in the same commit

### 5. Test assumptions about empty/mutable state
- Missions 001-004: Tests that expected empty jobs list, empty projects list, exact stat card counts broke repeatedly
- **Fix needed**: Tests should never assume global state emptiness in integration tests

---

## Architecture Assessment

### Strengths
- **Backend**: Clean separation. Each storage type is self-contained. API routes follow consistent factory pattern. Executor interface is well-abstracted.
- **Error handling**: AppError hierarchy consistently used throughout backend.
- **DI**: Manual wiring in server.ts is simple and traceable.
- **Testing**: 72 tests with 0 failures. Playwright config is solid.

### Weaknesses
- **Frontend**: Single 1488-line JS file is unmaintainable. No module system.
- **CSS**: Growing organically without organization.
- **No input validation library**: Manual checks in every route are repetitive.
- **JSONL scaling**: Still fine at current scale but no migration path.
- **No authentication**: All API routes are open.

---

## What Should Change

### Immediate
1. Split app.js into 4-5 module files loaded via `<script>` tags
2. Add `node -c` check to test runner
3. Add Kanban UI tests
4. Fix any remaining `: any` in tests

### Short-term
5. Add ESLint with `no-restricted-syntax` rule for TypeScript-in-JS
6. Add input validation middleware (zod or express-validator)
7. Add authentication layer

### Long-term
8. Migrate JSONL to SQLite
9. Consider React/Vue for frontend if app.js exceeds 5000 lines
10. Add CI/CD pipeline

---

## Action Plan (this session)

1. Split `app.js` into modules:
   - `js/core.js` — state, routing, SSE, helpers (h, fmtTime, api, showToast)
   - `js/views/dashboard.js` — renderDashboard
   - `js/views/queue.js` — renderQueue, renderJobTable, renderJobRow, bindJobActions
   - `js/views/submit.js` — renderSubmit, handleSubmit, handlePromptAction, session loading
   - `js/views/projects.js` — renderProjects, renderProjectDetail, project forms
   - `js/views/kanban.js` — renderKanban, ticket functions
   - `js/views/settings.js` — renderSettings, provider forms
   - `js/actions.js` — cancelJob, retryJob, deleteJob, stopJob, resumeJob, duplicateJob, viewLog, viewDetail, editJob

2. Add `node -c` check to `run-all-tests.sh`

3. Update index.html with new script tags

4. Add Kanban UI test

5. Verify all 72 tests pass
