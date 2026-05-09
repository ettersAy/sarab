#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────
# claude-worker.sh — Continuous Claude prompt execution daemon
# ───────────────────────────────────────────────────────────────────
# Runs forever in a loop. Every N minutes: scans prompts/ for new
# .md files, executes them sequentially via Claude CLI, restarts the
# main app, then sleeps. Processed prompts are moved to prompts/done/
# (success) or prompts/failed/ (failure).
#
# Usage:
#   ./scripts/claude-worker.sh [OPTIONS]
#
# Options:
#   --daemon          Run in background (fork + disown)
#   --interval N      Polling interval in seconds (default: 300 = 5m)
#   --dry-run         Print what would be done, don't execute
#   --verbose         Show full prompt content and Claude output
#   --retries N       Retry failed prompts N times (default: 0)
#   --timeout N       Max seconds per prompt (default: 600)
#   --model MODEL     Pass --model to Claude CLI
#   --no-restart      Skip app restart after batch
#   --once            Process one batch then exit (non-daemon mode)
#   --help            Show this message
#
# Environment:
#   CLAUDE_CMD        Path to Claude CLI (default: claude)
#   CLAUDE_FLAGS      Extra flags for Claude CLI
#   POLL_INTERVAL     Polling interval in seconds (override default)
#
# Folder structure:
#   prompts/          ← Drop .md files here
#   prompts/done/     ← Successfully processed
#   prompts/failed/   ← Failed (after retries exhausted)
#   prompts/logs/     ← Execution logs
#   scripts/.worker/  ← Runtime state (PID, lock, status)
#
# Examples:
#   ./scripts/claude-worker.sh                       # foreground loop
#   ./scripts/claude-worker.sh --daemon               # background
#   ./scripts/claude-worker.sh --once                 # single batch
#   ./scripts/claude-worker.sh --interval 120 --retries 2
#   ./scripts/claude-worker.sh --model claude-sonnet-4-20250506
# ───────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Paths ─────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPTS_DIR="${PROJECT_ROOT}/prompts"
DONE_DIR="${PROMPTS_DIR}/done"
FAILED_DIR="${PROMPTS_DIR}/failed"
LOGS_DIR="${PROMPTS_DIR}/logs"
STATE_DIR="${SCRIPT_DIR}/.worker"
PID_FILE="${STATE_DIR}/worker.pid"
LOCK_FILE="${STATE_DIR}/worker.lock"
STATUS_FILE="${STATE_DIR}/status"
WORKER_LOG="${STATE_DIR}/worker.log"

# ── Defaults (overridable via env) ────────────────────────────────
CLAUDE_CMD="${CLAUDE_CMD:-claude}"
CLAUDE_FLAGS="${CLAUDE_FLAGS:---dangerously-skip-permissions}"
DEFAULT_INTERVAL="${POLL_INTERVAL:-300}"
DEFAULT_TIMEOUT=600
DEFAULT_RETRIES=0

# ── CLI state ─────────────────────────────────────────────────────
DAEMON=false
DRY_RUN=false
VERBOSE=false
NO_RESTART=false
ONCE=false
INTERVAL=$DEFAULT_INTERVAL
MAX_RETRIES=$DEFAULT_RETRIES
TIMEOUT=$DEFAULT_TIMEOUT
MODEL_ARG=""
SHUTDOWN_REQUESTED=false

# ── Batch counters ────────────────────────────────────────────────
CYCLE_COUNT=0
TOTAL_PROCESSED=0
TOTAL_SUCCEEDED=0
TOTAL_FAILED=0

# ── Colors ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

# ── Logging ───────────────────────────────────────────────────────
# All log_* functions write to both stdout and WORKER_LOG

_log() {
  local level="$1"; shift
  local msg="$*"
  echo -e "$msg" | tee -a "$WORKER_LOG" >/dev/null
  echo -e "$msg"
}

log_info()  { _log INFO  "${CYAN}[$(date +%H:%M:%S)]${NC} $*"; }
log_ok()    { _log OK    "${GREEN}[$(date +%H:%M:%S)] ✓${NC} $*"; }
log_warn()  { _log WARN  "${YELLOW}[$(date +%H:%M:%S)] ⚠${NC} $*"; }
log_error() { _log ERROR "${RED}[$(date +%H:%M:%S)] ✗${NC} $*"; }
log_dim()   { _log DEBUG "${DIM}$*${NC}"; }
log_banner() {
  local msg="$*"
  _log INFO ""
  _log INFO "${CYAN}╔══════════════════════════════════════╗${NC}"
  _log INFO "${CYAN}║${NC}   $msg"
  _log INFO "${CYAN}╚══════════════════════════════════════╝${NC}"
  _log INFO ""
}

# ── Usage ─────────────────────────────────────────────────────────
usage() {
  grep "^# " "$0" | grep -v "^#!/" | sed 's/^# //' | sed 's/^#//'
  exit 0
}

# ── Signal handlers ───────────────────────────────────────────────
handle_sigterm() {
  log_warn "Received SIGTERM — initiating graceful shutdown..."
  SHUTDOWN_REQUESTED=true
}

handle_sigint() {
  log_warn "Received SIGINT — initiating graceful shutdown..."
  SHUTDOWN_REQUESTED=true
}

handle_sighup() {
  log_info "Received SIGHUP — will reload config on next cycle."
  # Re-source env overrides on next loop iteration
}

# ── PID file ──────────────────────────────────────────────────────
write_pid() {
  echo $$ > "$PID_FILE"
}

remove_pid() {
  rm -f "$PID_FILE"
}

# ── Locking ───────────────────────────────────────────────────────
acquire_lock() {
  if [[ -f "$LOCK_FILE" ]]; then
    local pid
    pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      log_error "Another worker instance is running (PID $pid)."
      log_error "Remove $LOCK_FILE if this is stale."
      exit 1
    fi
    log_warn "Removing stale lock file (PID $pid no longer running)."
    rm -f "$LOCK_FILE"
  fi
  echo $$ > "$LOCK_FILE"
}

release_lock() {
  rm -f "$LOCK_FILE"
}

# ── Status file ───────────────────────────────────────────────────
write_status() {
  local status="${1:-idle}"
  cat > "$STATUS_FILE" <<STATUS
pid=$$
status=$status
cycle=$CYCLE_COUNT
processed=$TOTAL_PROCESSED
succeeded=$TOTAL_SUCCEEDED
failed=$TOTAL_FAILED
started_at=$(date -Iseconds 2>/dev/null || date)
updated_at=$(date -Iseconds 2>/dev/null || date)
STATUS
}

# ── Setup ─────────────────────────────────────────────────────────
setup() {
  mkdir -p "$PROMPTS_DIR" "$DONE_DIR" "$FAILED_DIR" "$LOGS_DIR" "$STATE_DIR"

  # Rotate worker log if >1MB
  if [[ -f "$WORKER_LOG" ]]; then
    local size
    size=$(stat -c%s "$WORKER_LOG" 2>/dev/null || stat -f%z "$WORKER_LOG" 2>/dev/null || echo 0)
    if [[ ${size:-0} -gt 1048576 ]]; then
      mv "$WORKER_LOG" "${WORKER_LOG}.old"
    fi
  fi

  acquire_lock
  write_pid
  write_status "starting"

  trap handle_sigterm SIGTERM
  trap handle_sigint SIGINT
  trap handle_sighup SIGHUP
}

# ── Scan for pending prompts ──────────────────────────────────────
scan_prompts() {
  find "$PROMPTS_DIR" -maxdepth 1 -name '*.md' -type f 2>/dev/null | sort
}

# ── Execute a single prompt ───────────────────────────────────────
# Returns: 0 on success, 1 on failure (after retries exhausted)
execute_prompt() {
  local prompt_file="$1"
  local basename
  basename=$(basename "$prompt_file")
  local log_file="${LOGS_DIR}/${basename%.md}.log"

  log_info "  ▶ Starting: $basename"
  write_status "executing:$basename"

  # Read prompt
  local prompt_content
  prompt_content=$(cat "$prompt_file")
  if [[ -z "${prompt_content//[[:space:]]/}" ]]; then
    log_warn "  Empty prompt, moving to done."
    mv "$prompt_file" "$DONE_DIR/$basename"
    return 0
  fi

  $VERBOSE && log_dim "  Content: $(echo "$prompt_content" | head -c 200)..."

  local attempt=0
  local success=false
  local exit_code=0

  while [[ $attempt -le $MAX_RETRIES ]]; do
    if [[ $attempt -gt 0 ]]; then
      # Exponential backoff: 2s, 4s, 8s...
      local delay=$((2 ** attempt))
      [[ $delay -gt 60 ]] && delay=60
      log_warn "  Retry $attempt/$MAX_RETRIES (waiting ${delay}s)..."
      sleep "$delay"
    fi

    # Write log header
    {
      echo "=== Claude Worker Execution ==="
      echo "File:    $basename"
      echo "Started: $(date -Iseconds 2>/dev/null || date)"
      echo "Attempt: $((attempt + 1))"
      echo "Command: $CLAUDE_CMD $CLAUDE_FLAGS $MODEL_ARG -p '...'"
      echo "========================================"
      echo ""
    } > "$log_file"

    # Escape prompt for shell
    local escaped_prompt
    escaped_prompt=$(printf '%s' "$prompt_content" | sed "s/'/'\\\\''/g")
    local cmd="$CLAUDE_CMD $CLAUDE_FLAGS $MODEL_ARG -p '${escaped_prompt}'"

    # Execute with timeout
    exit_code=0
    if command -v timeout &>/dev/null; then
      if [[ "$VERBOSE" == "true" ]]; then
        timeout --signal=TERM --kill-after=10 "$TIMEOUT" bash -c "$cmd" 2>&1 | tee -a "$log_file" || exit_code=$?
      else
        timeout --signal=TERM --kill-after=10 "$TIMEOUT" bash -c "$cmd" >> "$log_file" 2>&1 || exit_code=$?
      fi
    else
      if [[ "$VERBOSE" == "true" ]]; then
        bash -c "$cmd" 2>&1 | tee -a "$log_file" || exit_code=$?
      else
        bash -c "$cmd" >> "$log_file" 2>&1 || exit_code=$?
      fi
    fi

    # Write log footer
    {
      echo ""
      echo "========================================"
      echo "Exit code: $exit_code"
      echo "Finished: $(date -Iseconds 2>/dev/null || date)"
    } >> "$log_file"

    # Check result
    if [[ $exit_code -eq 0 ]]; then
      success=true
      break
    fi

    # Classify failure
    if [[ $exit_code -eq 124 ]] || [[ $exit_code -eq 137 ]]; then
      log_error "  Timed out after ${TIMEOUT}s (signal $exit_code)"
    else
      log_error "  Failed with exit code $exit_code"
    fi

    attempt=$((attempt + 1))

    # Check for shutdown during retries
    if $SHUTDOWN_REQUESTED; then
      log_warn "  Shutdown requested during retry cycle — aborting prompt."
      break
    fi
  done

  # Move file based on result
  if $success; then
    mv "$prompt_file" "$DONE_DIR/$basename"
    log_ok "  ✓ Completed → prompts/done/$basename"
    return 0
  else
    mv "$prompt_file" "$FAILED_DIR/$basename"
    log_error "  ✗ Failed → prompts/failed/$basename (log: prompts/logs/${basename%.md}.log)"
    return 1
  fi
}

# ── Process all pending prompts ───────────────────────────────────
process_batch() {
  local prompts
  mapfile -t prompts < <(scan_prompts)

  if [[ ${#prompts[@]} -eq 0 ]]; then
    log_dim "  No pending prompts."
    return 0
  fi

  log_info "  Found ${#prompts[@]} pending prompt(s):"
  local p
  for p in "${prompts[@]}"; do
    log_dim "    - $(basename "$p")"
  done
  echo ""

  local batch_processed=0
  local batch_succeeded=0
  local batch_failed=0

  for p in "${prompts[@]}"; do
    # Respect shutdown signal between prompts
    if $SHUTDOWN_REQUESTED; then
      log_warn "  Shutdown requested — stopping batch processing."
      break
    fi

    if execute_prompt "$p"; then
      batch_succeeded=$((batch_succeeded + 1))
      TOTAL_SUCCEEDED=$((TOTAL_SUCCEEDED + 1))
    else
      batch_failed=$((batch_failed + 1))
      TOTAL_FAILED=$((TOTAL_FAILED + 1))
    fi
    batch_processed=$((batch_processed + 1))
    TOTAL_PROCESSED=$((TOTAL_PROCESSED + 1))
  done

  if [[ $batch_processed -gt 0 ]]; then
    log_info "  Batch summary: ${batch_processed} processed, ${batch_succeeded} ok, ${batch_failed} failed"
  fi

  return 0
}

# ── Restart the main app ──────────────────────────────────────────
restart_app() {
  if $NO_RESTART; then
    log_dim "  Skipping app restart (--no-restart)."
    return 0
  fi

  log_info "  Restarting main app..."

  local stop_script="${PROJECT_ROOT}/stop.sh"
  local start_script="${PROJECT_ROOT}/start.sh"

  if [[ -x "$stop_script" ]]; then
    bash "$stop_script" 2>&1 | while IFS= read -r line; do log_dim "    [stop] $line"; done || true
  else
    log_warn "  stop.sh not found or not executable, skipping."
  fi

  sleep 1

  if [[ -x "$start_script" ]]; then
    bash "$start_script" 2>&1 | while IFS= read -r line; do log_dim "    [start] $line"; done || true
  else
    log_warn "  start.sh not found or not executable, skipping."
  fi

  log_ok "  App restart complete."
}

# ── Main loop ─────────────────────────────────────────────────────
main_loop() {
  log_banner "Claude Prompt Worker Started"
  log_info "  PID:        $$"
  log_info "  Interval:   ${INTERVAL}s ($(echo "scale=1; $INTERVAL/60" | bc 2>/dev/null || echo "$INTERVAL")m)"
  log_info "  Retries:    $MAX_RETRIES"
  log_info "  Timeout:    ${TIMEOUT}s"
  log_info "  Model:      ${MODEL_ARG:-default}"
  log_info "  Dry run:    $DRY_RUN"
  log_info "  No restart: $NO_RESTART"
  log_info "  Daemon:     $DAEMON"
  log_info "  Prompt dir: $PROMPTS_DIR"
  log_info "  Log file:   $WORKER_LOG"
  echo ""

  while ! $SHUTDOWN_REQUESTED; do
    CYCLE_COUNT=$((CYCLE_COUNT + 1))

    log_info "╔══ Cycle #$CYCLE_COUNT — $(date '+%Y-%m-%d %H:%M:%S') ══╗"
    write_status "scanning"

    # Scan and process
    if $DRY_RUN; then
      local prompts
      mapfile -t prompts < <(scan_prompts)
      if [[ ${#prompts[@]} -gt 0 ]]; then
        log_info "  [DRY-RUN] Would process ${#prompts[@]} prompt(s):"
        local p
        for p in "${prompts[@]}"; do
          log_dim "    - $(basename "$p") → prompts/done/"
        done
      else
        log_dim "  [DRY-RUN] No pending prompts."
      fi
    else
      process_batch
    fi

    # Restart app after processing (only if something was done, or each cycle)
    if ! $DRY_RUN && ! $NO_RESTART; then
      restart_app
    fi

    # Check for --once mode
    if $ONCE; then
      log_info "  --once mode: exiting after one cycle."
      break
    fi

    # Sleep until next cycle
    if ! $SHUTDOWN_REQUESTED; then
      write_status "sleeping"
      log_info "╚══ Cycle #$CYCLE_COUNT done — sleeping ${INTERVAL}s... ══╝"
      echo ""

      # Sleep in 1-second increments so we can respond to signals
      local slept=0
      while [[ $slept -lt $INTERVAL ]] && ! $SHUTDOWN_REQUESTED; do
        sleep 1
        slept=$((slept + 1))
      done
    fi
  done

  log_warn "Shutdown complete."
  write_status "stopped"
}

# ── Cleanup ───────────────────────────────────────────────────────
cleanup() {
  log_info ""
  log_info "╔══════════════════════════════════════╗"
  log_info "║   Worker Shutdown                    ║"
  log_info "╚══════════════════════════════════════╝"
  log_info "  Cycles:     $CYCLE_COUNT"
  log_info "  Processed:  $TOTAL_PROCESSED"
  log_info "  Succeeded:  $TOTAL_SUCCEEDED"
  log_info "  Failed:     $TOTAL_FAILED"
  echo ""

  remove_pid
  release_lock
  write_status "stopped"

  exit 0
}

# ── Daemonize ─────────────────────────────────────────────────────
daemonize() {
  log_info "Forking to background..."

  # Re-invoke self without --daemon, fully detached
  local args=()
  for arg in "$@"; do
    [[ "$arg" == "--daemon" ]] && continue
    args+=("$arg")
  done

  nohup bash "$0" "${args[@]}" >> "$WORKER_LOG" 2>&1 &
  local child_pid=$!
  log_info "Worker daemon started with PID $child_pid"
  log_info "  Log:     $WORKER_LOG"
  log_info "  Status:  $STATUS_FILE"
  log_info "  Stop:    kill $child_pid"
  exit 0
}

# ── Parse CLI arguments ───────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --daemon)        DAEMON=true; shift ;;
    --interval)      INTERVAL="${2:-300}"; shift 2 ;;
    --dry-run)       DRY_RUN=true; shift ;;
    --verbose)       VERBOSE=true; shift ;;
    --retries)       MAX_RETRIES="${2:-0}"; shift 2 ;;
    --timeout)       TIMEOUT="${2:-600}"; shift 2 ;;
    --model)         MODEL_ARG="--model ${2}"; shift 2 ;;
    --no-restart)    NO_RESTART=true; shift ;;
    --once)          ONCE=true; shift ;;
    --help)          usage ;;
    *) log_error "Unknown option: $1"; usage ;;
  esac
done

# ── Validate ──────────────────────────────────────────────────────
if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || [[ "$INTERVAL" -lt 5 ]]; then
  log_error "Interval must be a positive integer >= 5 seconds."
  exit 1
fi

if ! [[ "$TIMEOUT" =~ ^[0-9]+$ ]] || [[ "$TIMEOUT" -lt 1 ]]; then
  log_error "Timeout must be a positive integer."
  exit 1
fi

# ── Entry point ───────────────────────────────────────────────────
setup

# Daemonize if requested (must happen before trap and main loop)
if $DAEMON; then
  daemonize "$@"
fi

if ! command -v "$CLAUDE_CMD" &>/dev/null && [[ "$DRY_RUN" != "true" ]]; then
  log_error "'$CLAUDE_CMD' not found. Set CLAUDE_CMD=/path/to/claude"
  release_lock
  exit 1
fi

# Run main loop; cleanup on exit
main_loop
cleanup
