# SARAB Improvement Tasks — 2026-05-08

## HIGH Priority (functional / security fixes)

### H1. Delete dead code `src/constants.ts`
- **File**: `src/constants.ts`
- **Why**: Duplicates `config.ts`, imported nowhere, confusing to maintainers
- **Effort**: Trivial (delete 1 file)

### H2. Startup recovery for "running" jobs
- **File**: `src/queue/manager.ts`
- **Why**: After a server restart, any job that was "running" stays stuck forever
- **Fix**: On `start()`, find all jobs with status "running"/"retrying" and mark them as "failed" with error "Server restarted"
- **Effort**: Small (~5 lines)

### H3. Request body size limit
- **File**: `src/server.ts`
- **Why**: DoS risk — huge JSON payloads can crash the server
- **Fix**: `app.use(express.json({ limit: "1mb" }))`
- **Effort**: Trivial (1 line)

### H4. Fix default values duplication
- **Files**: `src/storage/jobs.ts`, `src/config.ts`
- **Why**: Default timeout/retries defined in two places; config changes don't propagate
- **Fix**: Pass config into JobStore constructor or import config directly
- **Effort**: Small

### H5. Use AppError instead of raw Error in manager/store
- **Files**: `src/queue/manager.ts`, `src/storage/jobs.ts`
- **Why**: Raw errors become 500s with unhelpful messages; AppErrors get proper HTTP status codes
- **Fix**: Replace `throw new Error(...)` with `throw new NotFoundError(...)` or `throw new ValidationError(...)`
- **Effort**: Small

## MEDIUM Priority (quality / UX)

### M1. Add in-memory job index to JobStore
- **File**: `src/storage/jobs.ts`
- **Why**: Reading and parsing entire file for every operation is O(n); an in-memory Map would make reads O(1)
- **Approach**: Load all jobs into a Map on construction, persist on mutation
- **Effort**: Medium (~30 lines changed)

### M2. Add loading states to all UI buttons
- **File**: `src/web/app.js`
- **Why**: Users have no feedback during cancel/retry/delete/pause actions
- **Fix**: Disable button + change text during fetch, restore on completion
- **Effort**: Small

### M3. Display tags in job table
- **File**: `src/web/app.js`
- **Why**: Tags are stored but invisible to users
- **Fix**: Render tags as small chips in the job row
- **Effort**: Trivial (~5 lines)

### M4. Validate model names on job creation
- **File**: `src/api/jobs.ts`
- **Why**: Any string is accepted as model; typos cause confusing Claude CLI errors
- **Fix**: Check model against VALID_MODELS if provided
- **Effort**: Trivial (~5 lines)

### M5. Add log file output to logger
- **File**: `src/logger.ts`
- **Why**: Server logs are lost on restart
- **Fix**: Add a file transport alongside console logging
- **Effort**: Small

### M6. Add pagination to job list API and UI
- **Files**: `src/api/jobs.ts`, `src/storage/jobs.ts`, `src/web/app.js`
- **Why**: Unbounded list doesn't scale
- **Fix**: Add `?limit=N&offset=M` query params, pagination controls in UI
- **Effort**: Medium

### M7. SSE disconnect indicator
- **File**: `src/web/app.js`
- **Why**: Users don't know when real-time updates stop
- **Fix**: Listen for EventSource `onerror`, show indicator
- **Effort**: Trivial (~5 lines)

## LOW Priority (nice-to-have)

### L1. Responsive CSS
- **File**: `src/web/styles.css`
- **Effort**: Medium

### L2. Text search in queue view
- **File**: `src/web/app.js`
- **Effort**: Small

### L3. Concurrency config for queue
- **File**: `src/queue/manager.ts`
- **Effort**: Medium

### L4. ESLint + Prettier setup
- **Effort**: Small

### L5. Dockerfile
- **Effort**: Small

### L6. GitHub Actions CI
- **Effort**: Medium
