# SARAB — Smart AI Request Automation Bot

Web UI for queuing and executing Claude CLI prompts with real-time SSE monitoring.

## Commands

```bash
npm run dev          # Start dev server (port 3457, or $PORT)
npm run build        # TypeScript → dist/
npm run check        # tsc --noEmit
npm test             # Playwright (auto-starts server on port 3469)
./scripts/smoke-test.sh [PORT]  # Quick API smoke check (16 tests)
./scripts/run-all-tests.sh      # Smoke + Playwright (74 tests)
```

## Architecture

```
Browser (SSE) → Express server → QueueManager (poll loop) → ClaudeExecutor (spawn claude CLI)
                              → JobStore + ProjectStore + SessionStore (JSONL)
                              → LogStore (files) + SettingsStore (JSON)
                              → DeepSeekExecutor (HTTP) for prompt improvement
```

- **`src/server.ts`** — entry point, wires DI, Express setup
- **`src/config.ts`** — all env-based config, single source of truth
- **`src/queue/manager.ts`** — poll loop, processes one job at a time, retry/backoff, session resolution, cwd from project
- **`src/executor/claude.ts`** — spawns `claude -p "prompt"` with `--resume`, `cwd`, session capture from stderr
- **`src/executor/deepseek.ts`** — HTTP-based executor for DeepSeek/OpenAI-compatible APIs
- **`src/executor/factory.ts`** — creates executor from AIProvider config
- **`src/storage/jobs.ts`** — JSONL append + atomic uuid-tmp rewrite
- **`src/storage/projects.ts`** — JSONL project CRUD (name + rootPath)
- **`src/storage/sessions.ts`** — JSONL session store (getLatestForProject, listForProject)
- **`src/storage/settings.ts`** — JSON settings file with defaults
- **`src/storage/logs.ts`** — per-job `.log` files
- **`src/api/jobs.ts`** — job CRUD, cancel, retry, edit (PATCH), duplicate, detail
- **`src/api/projects.ts`** — project CRUD, list project jobs/sessions
- **`src/api/sessions.ts`** — list sessions, get latest per project
- **`src/api/settings.ts`** — provider CRUD, defaults
- **`src/api/prompt.ts`** — AI prompt improvement (reformulate/improve/correct/shorten/expand)
- **`src/web/app.js`** — vanilla JS SPA (no framework)

## Where to change code

| Feature | Files |
|---------|-------|
| Job lifecycle | `queue/manager.ts`, `executor/claude.ts` |
| Projects & sessions | `storage/projects.ts`, `storage/sessions.ts`, `api/projects.ts`, `api/sessions.ts` |
| Settings & providers | `storage/settings.ts`, `api/settings.ts`, `executor/factory.ts` |
| API endpoints | `api/router.ts` + `api/jobs.ts` or `api/queue.ts` or `api/prompt.ts` |
| Storage format | `storage/jobs.ts`, `queue/types.ts` |
| Frontend UI | `web/app.js` (state + views), `web/styles.css`, `web/index.html` |
| Config/env | `config.ts` |
| Error handling | `errors.ts` |
| Logging | `logger.ts` |
| SSE events | `queue/sse.ts`, `queue/manager.ts` |

## Execution modes

Two execution modes via `executionMode` field on Job:

| Mode | Behavior |
|------|----------|
| `"api"` (default) | One-shot Claude CLI execution via `-p "prompt"` |
| `"terminal"` | Runs from project root, supports stop/resume, live log streaming |

Stop/Resume: `POST /api/jobs/:id/stop` (kills process, SIGTERM→SIGKILL), `POST /api/jobs/:id/resume` (re-queues as pending).
JobStatus includes `"stopped"` (orange, between cancelled and failed).

## Session execution modes

5 modes supported via `sessionMode` field on Job:

| sessionMode | sessionId | Behavior |
|------------|-----------|----------|
| (unset) | — | Fresh session, no resume |
| `"new"` | — | Explicit fresh session |
| `"resume"` | set | Resume specific session via `--resume` |
| `"resume"` | unset | Resume latest session for project |
| `"latest"` | — | Resume latest session for project |

Sessions are captured from Claude CLI stderr via regex: `Session ID: (cls_\w+)`.
When `projectId` is set, the executor runs with `cwd = project.rootPath`.

## Known pitfalls

- **JSONL storage**: `JobStore.list()` reads entire file per call — fine for <1000 jobs, degrades linearly. No DB.
- **Single-threaded queue**: Only one Claude invocation at a time.
- **Port in tests**: Smoke tests must pass PORT via env: `env PORT=XXXX npx tsx src/server.ts`. The config reads `process.env.PORT`, not CLI args.
- **SSE curl hangs**: Always use `--max-time N` when curling SSE endpoints.
- **Job cancel race**: Queue may pick up a job before you cancel it. Pause queue first in tests.
- **Playwright parallel workers**: Two workers can conflict on JSONL writes. The uuid-based tmp file naming prevents this.
- **Claude CLI**: Uses `--dangerously-skip-permissions`. Ensure `claude` is in PATH.
- **No framework**: Frontend is vanilla JS. No React, no bundler, no TypeScript on the client.
- **TS syntax in JS**: Do NOT use `: any` or other TypeScript annotations in `web/app.js`. It's plain JS served as static file.
- **Settings**: Default provider cannot be deleted. At least one provider must exist (defaults created on first load).

## Testing workflow

1. `npx tsc --noEmit` — type check
2. `./scripts/smoke-test.sh` — 16 API checks (~10s)
3. `npx playwright test` — 53 fast + 5 slow browser+API tests (~5s + 19s)
4. Or run both: `./scripts/run-all-tests.sh`

Tests auto-start the dev server via Playwright's `webServer` config (port 3469).
Smoke tests start their own server on a specified port.

## Project structure conventions

- One concern per file
- AppError hierarchy for all thrown errors (no raw `new Error`)
- Config defaults flow from `config.ts` → constructors (not hardcoded twice)
- Storage: JSONL per entity (jobs, projects, sessions), JSON for settings
- Frontend state: `currentView`, `jobs[]`, `projects[]`, `currentProjectId`, `stats{}`, `queueFilter`, `queueSearch`, `sessions[]`, `sessionMode`
- SSE events: `job-started`, `job-completed`, `job-failed`, `job-cancelled`, `job-retrying`, `stats`
- API convention: factory functions `createXxxRouter(dep1, dep2)` returning Express Router
- DI: manual linear wiring in `server.ts`, no container needed
