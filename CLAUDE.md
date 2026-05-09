# SARAB — Smart AI Request Automation Bot

Web UI for queuing and executing Claude CLI prompts with real-time SSE monitoring.

## Commands

```bash
npm run dev          # Start dev server (port 3457, or $PORT)
npm run build        # TypeScript → dist/
npm run check        # tsc --noEmit
npm test             # Playwright (auto-starts server on port 3469)
./scripts/smoke-test.sh [PORT]  # Quick API smoke check (16 tests)
./scripts/run-all-tests.sh      # Smoke + Playwright
```

## Architecture

```
Browser (SSE) → Express server → QueueManager (poll loop) → ClaudeExecutor (spawn claude CLI)
                              → JobStore (JSONL) + LogStore (files)
```

- **`src/server.ts`** — entry point, wires DI, Express setup
- **`src/config.ts`** — all env-based config, single source of truth
- **`src/queue/manager.ts`** — poll loop, processes one job at a time, retry/backoff, EventEmitter
- **`src/executor/claude.ts`** — spawns `claude -p "prompt"`, timeout support
- **`src/storage/jobs.ts`** — JSONL append + atomic uuid-tmp rewrite
- **`src/storage/logs.ts`** — per-job `.log` files
- **`src/api/jobs.ts`** — job CRUD, cancel, retry, log
- **`src/api/prompt.ts`** — AI prompt improvement (reformulate/improve/correct/shorten/expand)
- **`src/web/app.js`** — vanilla JS SPA (no framework)

## Where to change code

| Feature | Files |
|---------|-------|
| Job lifecycle | `queue/manager.ts`, `executor/claude.ts` |
| API endpoints | `api/router.ts` + `api/jobs.ts` or `api/queue.ts` or `api/prompt.ts` |
| Storage format | `storage/jobs.ts`, `queue/types.ts` |
| Frontend UI | `web/app.js`, `web/styles.css`, `web/index.html` |
| Config/env | `config.ts` |
| Error handling | `errors.ts` |
| Logging | `logger.ts` |
| SSE events | `queue/sse.ts`, `queue/manager.ts` |

## Known pitfalls

- **JSONL storage**: `JobStore.list()` reads entire file per call — fine for <1000 jobs, degrades linearly. No DB.
- **Single-threaded queue**: Only one Claude invocation at a time.
- **Port in tests**: Smoke tests must pass PORT via env: `env PORT=XXXX npx tsx src/server.ts`. The config reads `process.env.PORT`, not CLI args.
- **SSE curl hangs**: Always use `--max-time N` when curling SSE endpoints.
- **Job cancel race**: Queue may pick up a job before you cancel it. Pause queue first in tests.
- **Playwright parallel workers**: Two workers can conflict on JSONL writes. The uuid-based tmp file naming prevents this.
- **Claude CLI**: Uses `--dangerously-skip-permissions`. Ensure `claude` is in PATH.
- **No framework**: Frontend is vanilla JS. No React, no bundler, no TypeScript on the client.

## Testing workflow

1. `npx tsc --noEmit` — type check
2. `./scripts/smoke-test.sh` — 16 API checks (~10s)
3. `npx playwright test` — 35 browser+API tests (~6s with 2 workers)
4. Or run both: `./scripts/run-all-tests.sh`

Tests auto-start the dev server via Playwright's `webServer` config (port 3469).
Smoke tests start their own server on a specified port.

## Project structure conventions

- One concern per file
- AppError hierarchy for all thrown errors (no raw `new Error`)
- Config defaults flow from `config.ts` → constructors (not hardcoded twice)
- Frontend state: `currentView`, `jobs[]`, `stats{}`, `queueFilter`, `queueSearch`
- SSE events: `job-started`, `job-completed`, `job-failed`, `job-cancelled`, `job-retrying`, `stats`
