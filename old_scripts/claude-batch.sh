#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────
# claude-batch.sh — Sequential Claude CLI prompt processor
# ───────────────────────────────────────────────────────────
# DEPRECATED: Use claude-worker.sh for continuous daemon mode.
# This script remains available for one-shot batch processing
# but new workflows should use ./scripts/claude-worker.sh
#
# Reads .md prompt files from prompts/, executes them one at
# a time via Claude CLI, moves results to prompts/done/ or
# prompts/failed/. Never processes the same file twice.
#
# Usage:
#   ./scripts/claude-batch.sh [OPTIONS]
#
# Options:
#   --dry-run       Print what would be done, don't execute
#   --verbose       Show full prompt content and Claude output
#   --retries N     Retry failed prompts N times (default: 0)
#   --timeout N     Max seconds per prompt (default: 600)
#   --stop-on-error Stop all processing on first failure
#   --model MODEL   Pass --model to Claude CLI
#   --help          Show this message
#
# Folder structure (auto-created):
#   prompts/          ← Drop .md files here
#   prompts/done/     ← Successfully processed
#   prompts/failed/   ← Failed (after retries exhausted)
#   prompts/logs/     ← Execution logs
#
# Examples:
#   ./scripts/claude-batch.sh
#   ./scripts/claude-batch.sh --dry-run --verbose
#   ./scripts/claude-batch.sh --retries 2 --timeout 300
#   ./scripts/claude-batch.sh --model claude-sonnet-4-20250506
# ───────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPTS_DIR="${PROJECT_ROOT}/prompts"
DONE_DIR="${PROMPTS_DIR}/done"
FAILED_DIR="${PROMPTS_DIR}/failed"
LOGS_DIR="${PROMPTS_DIR}/logs"
LOCK_FILE="${PROMPTS_DIR}/.batch.lock"

CLAUDE_CMD="${CLAUDE_CMD:-claude}"
CLAUDE_FLAGS="${CLAUDE_FLAGS:---dangerously-skip-permissions}"
DEFAULT_TIMEOUT=600
DEFAULT_RETRIES=0

# ── State ─────────────────────────────────────────────────
DRY_RUN=false
VERBOSE=false
STOP_ON_ERROR=false
MAX_RETRIES=$DEFAULT_RETRIES
TIMEOUT=$DEFAULT_TIMEOUT
MODEL_ARG=""
PROMPTS_PROCESSED=0
PROMPTS_SUCCEEDED=0
PROMPTS_FAILED=0
START_TIME=$(date +%s)

# ── Colors ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; DIM='\033[2m'; NC='\033[0m'

# ── Functions ─────────────────────────────────────────────

log_info()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[$(date +%H:%M:%S)] ✓${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠${NC} $*"; }
log_error() { echo -e "${RED}[$(date +%H:%M:%S)] ✗${NC} $*"; }
log_dim()   { echo -e "${DIM}$*${NC}"; }

usage() {
  grep "^# " "$0" | grep -v "^#!/" | sed 's/^# //' | sed 's/^#//'
  exit 0
}

cleanup() {
  log_warn "Interrupted. Processed: $PROMPTS_PROCESSED, OK: $PROMPTS_SUCCEEDED, Failed: $PROMPTS_FAILED"
  rm -f "$LOCK_FILE"
  exit 130
}

acquire_lock() {
  if [[ -f "$LOCK_FILE" ]]; then
    local pid
    pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      log_error "Another batch instance is running (PID $pid)."
      log_error "Remove $LOCK_FILE if this is stale."
      exit 1
    fi
    log_warn "Removing stale lock file (PID $pid no longer running)."
    rm -f "$LOCK_FILE"
  fi
  echo $$ > "$LOCK_FILE"
}

# ── Parse args ────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)        DRY_RUN=true; shift ;;
    --verbose)        VERBOSE=true; shift ;;
    --stop-on-error)  STOP_ON_ERROR=true; shift ;;
    --retries)        MAX_RETRIES="${2:-0}"; shift 2 ;;
    --timeout)        TIMEOUT="${2:-600}"; shift 2 ;;
    --model)          MODEL_ARG="--model ${2}"; shift 2 ;;
    --help)           usage ;;
    *) log_error "Unknown option: $1"; usage ;;
  esac
done

# ── Setup ─────────────────────────────────────────────────
mkdir -p "$PROMPTS_DIR" "$DONE_DIR" "$FAILED_DIR" "$LOGS_DIR"
acquire_lock
trap cleanup SIGINT SIGTERM

if ! command -v "$CLAUDE_CMD" &>/dev/null && [[ "$DRY_RUN" != "true" ]]; then
  log_error "'$CLAUDE_CMD' not found. Set CLAUDE_CMD=/path/to/claude"
  rm -f "$LOCK_FILE"; exit 1
fi

# ── Main loop ─────────────────────────────────────────────
log_info "╔══════════════════════════════════════╗"
log_info "║   Claude Batch Prompt Processor      ║"
log_info "╚══════════════════════════════════════╝"
log_dim "  Folder:    $PROMPTS_DIR"
log_dim "  Dry run:   $DRY_RUN"
log_dim "  Retries:   $MAX_RETRIES"
log_dim "  Timeout:   ${TIMEOUT}s"
log_dim "  Model:     ${MODEL_ARG:-default}"
log_dim "  Verbose:   $VERBOSE"
echo ""

while true; do
  # Find the first .md file (excluding done/failed/logs dirs)
  PROMPT_FILE=$(find "$PROMPTS_DIR" -maxdepth 1 -name '*.md' -type f 2>/dev/null | sort | head -1)
  [[ -z "$PROMPT_FILE" ]] && break

  BASENAME=$(basename "$PROMPT_FILE")
  PROMPTS_PROCESSED=$((PROMPTS_PROCESSED + 1))
  LOG_FILE="${LOGS_DIR}/${BASENAME%.md}.log"

  log_info "[$PROMPTS_PROCESSED] Processing: $BASENAME"

  if [[ "$DRY_RUN" == "true" ]]; then
    log_dim "   Would execute: $CLAUDE_CMD $CLAUDE_FLAGS -p \"\$(cat $BASENAME)\""
    log_dim "   → Moving to: prompts/done/$BASENAME (dry-run)"
    mv "$PROMPT_FILE" "$DONE_DIR/$BASENAME"
    PROMPTS_SUCCEEDED=$((PROMPTS_SUCCEEDED + 1))
    continue
  fi

  # Read prompt content
  PROMPT_CONTENT=$(cat "$PROMPT_FILE")
  if [[ -z "${PROMPT_CONTENT// }" ]]; then
    log_warn "   Empty prompt, skipping."
    mv "$PROMPT_FILE" "$DONE_DIR/$BASENAME"
    continue
  fi

  $VERBOSE && log_dim "   Content: $(echo "$PROMPT_CONTENT" | head -c 200)..."

  # Execute with retries
  ATTEMPT=0
  SUCCESS=false
  while [[ $ATTEMPT -le $MAX_RETRIES ]]; do
    if [[ $ATTEMPT -gt 0 ]]; then
      log_warn "   Retry $ATTEMPT/$MAX_RETRIES..."
      sleep 2
    fi

    # Build command with proper shell escaping
    ESCAPED_PROMPT=$(printf '%s' "$PROMPT_CONTENT" | sed "s/'/'\\\\''/g")
    CMD="$CLAUDE_CMD $CLAUDE_FLAGS $MODEL_ARG -p '${ESCAPED_PROMPT}'"

    {
      echo "=== Claude Batch Execution ==="
      echo "File: $BASENAME"
      echo "Started: $(date -Iseconds)"
      echo "Attempt: $((ATTEMPT + 1))"
      echo "Command: $CLAUDE_CMD $CLAUDE_FLAGS $MODEL_ARG -p '...'"
      echo "========================================"
      echo ""
    } > "$LOG_FILE"

    # Execute with timeout
    EXIT_CODE=0
    if [[ "$VERBOSE" == "true" ]]; then
      eval "$CMD" 2>&1 | tee -a "$LOG_FILE" || EXIT_CODE=$?
    else
      eval "$CMD" >> "$LOG_FILE" 2>&1 || EXIT_CODE=$?
    fi

    {
      echo ""
      echo "========================================"
      echo "Exit code: $EXIT_CODE"
      echo "Finished: $(date -Iseconds)"
    } >> "$LOG_FILE"

    if [[ $EXIT_CODE -eq 0 ]]; then
      SUCCESS=true
      break
    fi

    # Check for timeout (signal 124 from timeout command)
    if [[ $EXIT_CODE -eq 124 ]]; then
      log_error "   Timed out after ${TIMEOUT}s"
    else
      log_error "   Failed with exit code $EXIT_CODE"
    fi

    ATTEMPT=$((ATTEMPT + 1))
  done

  # Move file based on result
  if $SUCCESS; then
    mv "$PROMPT_FILE" "$DONE_DIR/$BASENAME"
    log_ok "   → prompts/done/$BASENAME"
    PROMPTS_SUCCEEDED=$((PROMPTS_SUCCEEDED + 1))
  else
    mv "$PROMPT_FILE" "$FAILED_DIR/$BASENAME"
    log_error "   → prompts/failed/$BASENAME (log: prompts/logs/${BASENAME%.md}.log)"
    PROMPTS_FAILED=$((PROMPTS_FAILED + 1))
    if $STOP_ON_ERROR; then
      log_error "Stopping on first failure (--stop-on-error)."
      break
    fi
  fi
done

# ── Summary ────────────────────────────────────────────────
ELAPSED=$(($(date +%s) - START_TIME))
echo ""
log_info "╔══════════════════════════════════════╗"
log_info "║   Batch Complete                     ║"
log_info "╚══════════════════════════════════════╝"
log_info "  Processed: $PROMPTS_PROCESSED"
log_ok   "  Succeeded: $PROMPTS_SUCCEEDED"
[[ $PROMPTS_FAILED -gt 0 ]] && log_error "  Failed:    $PROMPTS_FAILED" || log_dim "  Failed:    0"
log_dim   "  Duration:  ${ELAPSED}s"
echo ""

rm -f "$LOCK_FILE"
[[ $PROMPTS_FAILED -gt 0 ]] && exit 1
exit 0
