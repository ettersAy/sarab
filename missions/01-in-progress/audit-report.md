# SARAB Audit Report — 2026-05-08

## Architecture

### Strengths
- Clean separation of concerns: storage, executor, queue, API, web layers
- EventEmitter pattern decouples queue from SSE broadcasting
- JSONL storage is simple, portable, and human-readable
- Executor interface (`ExecutorInput/Output`) allows swapping Claude CLI for another implementation
- Single-threaded queue is appropriate for sequential Claude CLI execution

### Issues

**A1. No startup recovery (HIGH)**
Jobs stuck in "running" status after a server restart remain "running" forever. The queue should mark them as "failed" on boot, or offer a "stale" detection mechanism.

**A2. JSONL reads entire file per operation (MEDIUM)**
`JobStore.list()` reads and parses the full file for every get/list/stats call. Acceptable for <1000 jobs; degrades linearly beyond that. An in-memory index or SQLite would scale better.

**A3. Single-threaded execution (LOW)**
Only one job runs at a time. For independent jobs this is unnecessarily slow. A concurrency config (e.g., `SARAB_CONCURRENCY=4`) would help.

**A4. No persistent logging (MEDIUM)**
`logger.ts` writes to console only. Server logs are lost on restart. Should write to a log file.

---

## Code Quality

### Strengths
- TypeScript strict mode enabled
- Consistent module structure (one concern per file)
- Error hierarchy (`AppError` → `NotFoundError`, `ValidationError`, `ConflictError`)
- Config centralized in `loadConfig()` with env vars

### Issues

**C1. Dead code: `constants.ts` (HIGH)**
Defines `PORT`, `DATA_DIR`, `CLAUDE_CMD`, `VALID_MODELS` etc. but is **imported nowhere**. `config.ts` serves the same purpose. Delete it or merge it.

**C2. Duplicate default values (MEDIUM)**
Default timeout (600_000ms) and max retries (2) are defined in both `config.ts` and hardcoded in `JobStore.create()`. If config changes, the store's defaults won't reflect it.

**C3. Mixed error types (MEDIUM)**
`errors.ts` defines `AppError` classes, but `queue/manager.ts` and `storage/jobs.ts` throw raw `new Error(...)`. The API error handler catches `AppError` and formats them; raw Errors become 500s with "Internal server error" — not helpful.

**C4. SSEManager constructor oddity (LOW)**
`queueManager` is a constructor parameter used only in the body (not stored), while `jobStore` is `private readonly`. A caller reading the signature might assume both are stored. Minor but inconsistent.

**C5. VALID_MODELS never used (MEDIUM)**
The `constants.ts` list of valid models is not checked during job creation. Any string is accepted as a model name.

**C6. Missing TypeScript return types (LOW)**
Several functions omit explicit return type annotations (e.g., `createApiRouter`, queue manager methods). Not a bug but reduces self-documentation.

---

## UX

### Strengths
- Clean dark theme, GitHub-inspired
- Real-time SSE updates (no manual refresh needed)
- Three clear views: Dashboard, Queue, Submit
- Log viewer modal

### Issues

**U1. No loading states (MEDIUM)**
Buttons don't show loading indicators during API calls. The submit button changes text to "Submitting..." but other actions (cancel, retry, delete, pause) have no feedback.

**U2. No pagination (MEDIUM)**
All jobs are loaded in one request. With 100+ jobs the UI will slow down and the table becomes hard to navigate.

**U3. Tags not displayed (MEDIUM)**
Tags are stored (and visible in API response) but the job table doesn't render them.

**U4. No text search/filter (LOW)**
Can only filter by status. No search by title or tags.

**U5. No responsive design (LOW)**
Layout breaks on narrow viewports.

**U6. SSE disconnect not indicated (LOW)**
If the SSE connection drops, the user sees no warning and data goes stale.

**U7. No dark/light toggle (LOW)**
Dark theme only; some users prefer light.

---

## Security

### Issues

**S1. No request body size limit (HIGH)**
`express.json()` has no `limit` option. A huge prompt payload could crash the server (memory exhaustion).

**S2. No rate limiting (MEDIUM)**
No protection against rapid job submission.

**S3. Claude CLI permissions (INFO)**
Uses `--dangerously-skip-permissions` — mirrors the original scripts. This is by design but should be documented as a security consideration.

**S4. No CORS headers (LOW)**
Fine for same-origin now, but if frontend is ever served separately, cross-origin requests will fail.

---

## Testing

- **Zero tests**: No unit, integration, or E2E tests
- **No Playwright tests** (referenced in package.json `"test": "npx playwright test"` but no test files exist)
- **Smoke test script**: Only existence test, covers 16 API checks

---

## Missing Features (beyond MVP)

1. Job priority/ordering
2. Concurrent job execution
3. Job editing (modify a pending job's prompt)
4. Bulk operations (cancel/delete multiple)
5. Export jobs/logs
6. Dark/light theme toggle
7. CI/CD pipeline
8. Docker containerization
9. ESLint/Prettier config
10. Health check for Claude CLI availability
