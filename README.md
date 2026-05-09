# SARAB — Smart AI Request Automation Bot

A web UI for queuing, executing, and monitoring prompts through the Claude CLI (or any OpenAI-compatible API). SARAB runs as a local Express server with real-time SSE streaming, job management, and multi-project support.

## Features

- **Queue-based execution** — Submit prompts from a browser, and they execute one at a time with retry/backoff logic
- **Real-time monitoring** — Live SSE events stream job progress (started, completed, failed, retrying) to the dashboard
- **Session management** — Supports 5 session modes: fresh, explicit new, resume specific, resume latest, and auto-resume latest. Claude sessions are captured and reused automatically
- **Multi-project workspace** — Organize prompts by project, each with its own working directory for context-aware execution
- **AI prompt improvement** — Built-in integration with DeepSeek/OpenAI-compatible APIs to reformulate, improve, correct, shorten, or expand prompts before submission
- **Multi-provider settings** — Configure one or more AI providers (Claude CLI, DeepSeek, OpenAI-compatible) and select which to use per job
- **Job lifecycle** — Create, cancel, retry, edit, and duplicate jobs from the UI. View per-job execution logs
- **Lightweight** — No database, no build step for the frontend. JSONL storage and vanilla JS SPA

## How it works

```
Browser (SSE) → Express server → QueueManager (poll loop) → Claude CLI / API executor
                              → JobStore + ProjectStore + SessionStore (JSONL)
                              → LogStore (files) + SettingsStore (JSON)
                              → DeepSeekExecutor (HTTP) for prompt improvement
```

The queue runs a poll loop in the background, picking up pending jobs and handing them off to the configured executor. The Claude executor spawns `claude -p "prompt"` with session resume support, while the HTTP executor calls OpenAI-compatible APIs directly. All progress is streamed to the browser via SSE.

## Getting started

### Prerequisites

- Node.js 18+
- [Claude CLI](https://claude.ai/download) installed and available in PATH (for Claude execution)

### Install & run

```bash
# Install dependencies
npm install

# Start the dev server (default port 3457)
npm run dev
```

Open http://localhost:3457 in your browser.

### Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3457` | Server port |
| `SARAB_DATA_DIR` | `./data` | Data storage directory |
| `CLAUDE_CMD` | `claude` | Path to Claude CLI binary |
| `CLAUDE_FLAGS` | `--dangerously-skip-permissions` | Extra CLI flags |
| `SARAB_TIMEOUT` | `600000` | Job timeout in ms (10 min) |
| `SARAB_MAX_RETRIES` | `2` | Max retries per job |
| `SARAB_POLL_INTERVAL` | `5000` | Queue poll interval in ms |

## Usage

1. **Submit a prompt** — Go to "New Prompt", write your prompt, optionally attach it to a project, and choose an AI provider
2. **Monitor execution** — The dashboard shows queue progress, job status, and real-time updates
3. **Review logs** — Click any completed/failed job to view its full execution log
4. **Manage projects** — Create projects with custom working directories, browse their job history and sessions
5. **Improve prompts** — Use the prompt improvement feature to refine your prompt with AI before submitting
6. **Configure providers** — Add multiple AI providers in Settings and set one as default

### Session modes

| Mode | Behavior |
|------|----------|
| *(unset)* | Fresh Claude session |
| `new` | Explicit fresh session |
| `resume` + session ID | Resume a specific session |
| `resume` (no ID) | Resume latest session for the project |
| `latest` | Resume latest session for the project |

## API

SARAB exposes a REST API at `/api/`:

- `GET /api/jobs` — List jobs (optional `?projectId=X`)
- `POST /api/jobs` — Create a job
- `GET /api/jobs/:id` — Job detail
- `PATCH /api/jobs/:id` — Edit a job
- `POST /api/jobs/:id/cancel` — Cancel a job
- `POST /api/jobs/:id/retry` — Retry a failed job
- `POST /api/jobs/:id/duplicate` — Duplicate a job
- `GET /api/jobs/:id/log` — Get execution log
- `GET /api/projects` — List projects
- `POST /api/projects` — Create a project
- `GET /api/sessions` — List sessions
- `GET /api/settings` — Get settings
- `POST /api/settings/providers` — Add a provider
- `POST /api/prompt/improve` — Improve a prompt
- `POST /api/queue/pause` — Pause queue
- `POST /api/queue/resume` — Resume queue
- `GET /api/queue/status` — Queue status
- `GET /api/stats` — Dashboard stats
- `GET /api/events` — SSE event stream

## Tech stack

- **Backend**: Express (TypeScript), tsx for development
- **Frontend**: Vanilla JS SPA, CSS, HTML
- **Storage**: JSONL (jobs, projects, sessions), flat files (logs), JSON (settings)
- **Testing**: Playwright (E2E), shell smoke tests
- **Executors**: Claude CLI subprocess, HTTP for OpenAI-compatible APIs

## Testing

```bash
npm test                      # Playwright tests
./scripts/smoke-test.sh       # Quick API smoke tests
./scripts/run-all-tests.sh    # Both smoke + Playwright
```

## License

MIT
