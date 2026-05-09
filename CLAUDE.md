# SARAB — Smart AI Request Automation Bot

Web UI for queuing and executing Claude CLI prompts with real-time SSE monitoring.

## Commands

```bash
npm run dev          # Start dev server (port 3457, or $PORT)
npm run build        # TypeScript → dist/
npm run check        # tsc --noEmit
npm test             # Playwright (auto-starts server on port 3469)
./scripts/smoke-test.sh [PORT]  # Quick API smoke check (16 tests)
./scripts/run-all-tests.sh      # Smoke + Playwright (93 tests)
```

## Architecture

```
Browser (SSE) → Express server → QueueManager (poll loop) → ClaudeExecutor (spawn claude CLI)
                              → JobStore + ProjectStore + TicketStore + SessionStore (JSONL + filesystem)
                              → LogStore (files) + SettingsStore (JSON)
                              → DeepSeekExecutor (HTTP) for prompt improvement
```

- **`src/server.ts`** — entry point, wires DI, Express setup
- **`src/config.ts`** — all env-based config, single source of truth
- **`src/queue/manager.ts`** — poll loop, processes one job at a time, retry/backoff, session resolution, cwd from project
- **`src/executor/claude.ts`** — spawns `claude -p "prompt"` with heartbeat-based idle timeout, `--resume`, `cwd`, session capture from stderr
- **`src/executor/deepseek.ts`** — HTTP-based executor for DeepSeek/OpenAI-compatible APIs
- **`src/executor/factory.ts`** — creates executor from AIProvider config
- **`src/storage/jobs.ts`** — JSONL append + atomic uuid-tmp rewrite
- **`src/storage/projects.ts`** — filesystem-backed project CRUD (dirs under `/srv/dev/sarab/projects/`)
- **`src/storage/sessions.ts`** — JSONL session store (getLatestForProject, listForProject)
- **`src/storage/settings.ts`** — JSON settings file with defaults
- **`src/storage/logs.ts`** — per-job `.log` files
- **`src/storage/fs-utils.ts`** — filesystem helpers (slugify, safe filenames, project dir scan, `project.json`)
- **`src/storage/md-serializer.ts`** — markdown serialize/deserialize for tickets and prompts
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
| Projects & sessions | `storage/projects.ts`, `storage/sessions.ts`, `api/projects.ts`, `api/sessions.ts`, `storage/fs-utils.ts` |
| Settings & providers | `storage/settings.ts`, `api/settings.ts`, `executor/factory.ts` |
| Tickets & Kanban | `storage/tickets.ts`, `api/tickets.ts`, `storage/md-serializer.ts` |
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

## Timeout model (heartbeat-based)

Hard timeouts are replaced with idle detection:

| Field | Default | Behavior |
|-------|---------|----------|
| `timeoutMs` | `0` (none) | Hard deadline. `0` = run indefinitely until naturally done. |
| `idleTimeoutMs` | `1800000` (30 min) | Kill if **no stdout output** for this duration. Resets on every output chunk. `0` = disabled. |

- **Heartbeat**: Every stdout chunk from Claude resets the idle timer. A process producing output is alive.
- **Exit codes**: `124` = hard timeout, `125` = idle timeout (stuck), `143` = killed by user.
- In the UI, timeout fields accept `0` for unlimited. The idle timeout defaults to 30 minutes.
- Long-running missions (hours) work because the idle clock resets continuously as Claude produces output.

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

- **Filesystem persistence**: Projects are stored as directories under `/srv/dev/sarab/projects/[slug]/` with `project.json` metadata. Tickets and prompts persist as markdown files in each project's subdirectories. JSONL files in `data/` provide secondary caching. See [Persistence Architecture](#persistence-architecture) below.
- **JSONL storage**: `JobStore.list()` reads entire file per call — fine for <1000 jobs, degrades linearly. No DB.
- **Heartbeat timeout**: Default is no hard timeout (0). Processes run indefinitely as long as they produce stdout. Idle timeout (30 min) catches stuck processes. Set via `idleTimeoutMs`.
- **Single-threaded queue**: Only one Claude invocation at a time.
- **Port in tests**: Smoke tests must pass PORT via env: `env PORT=XXXX npx tsx src/server.ts`. The config reads `process.env.PORT`, not CLI args.
- **SSE curl hangs**: Always use `--max-time N` when curling SSE endpoints.
- **Job cancel race**: Queue may pick up a job before you cancel it. Pause queue first in tests.
- **Playwright parallel workers**: Two workers can conflict on JSONL writes. The uuid-based tmp file naming prevents this.
- **Claude CLI**: Uses `--dangerously-skip-permissions`. Ensure `claude` is in PATH.
- **No framework**: Frontend is vanilla JS. No React, no bundler, no TypeScript on the client.
- **TS syntax in JS**: Do NOT use `: any` or other TypeScript annotations in `web/app.js`. It's plain JS served as static file.
- **Settings**: Default provider cannot be deleted. At least one provider must exist (defaults created on first load).

## Persistence architecture

### Project storage

Projects live as directories under `/srv/dev/sarab/projects/`:

```
/srv/dev/sarab/projects/
  ├── my-project/           # slugified project name
  │   ├── project.json      # { id, name, rootPath, createdAt, updatedAt, settings }
  │   ├── tickets/
  │   │   └── backlog/
  │   │       └── my-ticket-xxxxxxxx.md
  │   └── prompts/
  │       └── my-prompt-xxxxxxxx.md
  └── another-project/
      └── project.json
```

- **`ProjectStore`** scans `/srv/dev/sarab/projects/` on every `list()` — directories with valid `project.json` become projects. No volatile-only state.
- **`create()`** validates name (no path traversal, no empty), slugifies it, creates dir + `project.json`. Returns `400` with clear message on duplicate.
- **`update()`** renames directory if name changes (via `renameSync`).
- **`delete()`** recursively removes the project directory.

### Ticket markdown format

Stored under `projects/[slug]/tickets/backlog/[safe-title]-[8char-id].md`:

```md
Title: Fix login button
Kanban Status: backlog
Priority: high
Project: abc12345
Job: 
Session: 
Tags: bug, ui
Created: 2026-05-09T12:00:00.000Z
Updated: 2026-05-09T12:00:00.000Z
Started: 
Paused: 
Done: 
Ticket ID: abc12345
========================================
Content:
The login button doesn't work on mobile.
```

- **`TicketStore`** loads from both `data/tickets.jsonl` (cache) AND markdown files on startup (`loadFromMarkdown()`). Malformed files are skipped with a warning.
- On create/update, markdown is written immediately via `writeMarkdown()`.
- On delete, the corresponding markdown file is removed.

### Prompt markdown format

Stored under `projects/[slug]/prompts/[safe-title]-[8char-id].md`:

```md
Title: Upgrade all dependencies
Model: claude-sonnet-4-6
Project: abc12345
Session: cls_abc123
Session Mode: resume
Execution Mode: api
Tags: refactor, urgent
Status: completed
Attempt: 1 / 3
Created: 2026-05-09T09:00:00.000Z
Started: 2026-05-09T09:01:00.000Z
Completed: 2026-05-09T09:15:00.000Z
Error: none
Exit Code: 0
Job ID: xyz12345
========================================
Content:
Please upgrade all npm dependencies...
```

- **`JobStore`** loads from both `data/jobs.jsonl` (cache) AND markdown files on startup.
- Prompts only get markdown files when `projectId` is set (project-linked jobs).

### Key modules

| File | Responsibility |
|------|---------------|
| `storage/fs-utils.ts` | Filesystem ops: slugify, safe filenames, project dir scan, `project.json` read/write |
| `storage/md-serializer.ts` | Markdown serialization/deserialization for tickets and prompts |
| `storage/projects.ts` | Project CRUD backed by filesystem directories |
| `storage/tickets.ts` | Ticket CRUD backed by JSONL cache + markdown files |
| `storage/jobs.ts` | Job CRUD backed by JSONL cache + markdown files for prompts |

### Error handling rules

- Malformed markdown files → skipped with `logger.warn()`, never crash.
- Path traversal in project names → `ValidationError` (400), caught by `validateProjectName()`.
- Duplicate project directory → `ValidationError` with `"Project folder already exists: [slug]"`.
- Project name with only special chars → `ValidationError` from slugify producing empty result.

### Migration from old volatile state

- The old JSONL files (`data/projects.jsonl`, `data/tickets.jsonl`, `data/jobs.jsonl`) are kept as secondary cache.
- Projects created before this change that don't have a corresponding directory under `/srv/dev/sarab/projects/` are NOT visible — only filesystem-backed projects appear.
- To migrate existing projects: create the directory manually with a `project.json` file.

## Testing workflow

1. `npx tsc --noEmit` — type check
2. `./scripts/smoke-test.sh` — 16 API checks (~10s)
3. `npx playwright test` — 93 tests (~1.3min with 1 worker)
4. Or run both: `./scripts/run-all-tests.sh`

Tests auto-start the dev server via Playwright's `webServer` config (port 3469).
Smoke tests start their own server on a specified port.

## Project structure conventions

- One concern per file
- AppError hierarchy for all thrown errors (no raw `new Error`)
- Config defaults flow from `config.ts` → constructors (not hardcoded twice)
- Storage: JSONL per entity (jobs, projects, sessions), JSON for settings
- Frontend state: `currentView`, `jobs[]`, `projects[]`, `currentProjectId`, `stats{}`, `queueFilter`, `queueSearch`, `sessions[]`, `sessionMode`
- SSE events: `job-started`, `job-completed`, `job-failed`, `job-cancelled`, `job-retrying`, `job-heartbeat`, `stats`
- API convention: factory functions `createXxxRouter(dep1, dep2)` returning Express Router
- DI: manual linear wiring in `server.ts`, no container needed
