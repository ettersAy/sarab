#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────
# smoke-test.sh — Quick smoke test for SARAB API
# ───────────────────────────────────────────────────────────────────
# Starts the SARAB dev server, runs API checks, then stops it.
# Usage: ./scripts/smoke-test.sh [PORT]
# ───────────────────────────────────────────────────────────────────
set -euo pipefail

PORT="${1:-3457}"
BASE="http://localhost:${PORT}"
PASS=0
FAIL=0
SERVER_PID=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

check() {
  local desc="$1"
  local method="$2"
  local path="$3"
  local expected_status="${4:-200}"
  local body="${5:-}"

  local curl_args=(-s -o /dev/null -w "%{http_code}" --max-time 5 -X "$method" "$BASE$path")
  if [[ -n "$body" ]]; then
    curl_args+=(-H "Content-Type: application/json" -d "$body")
  fi

  local status
  status=$(curl "${curl_args[@]}" 2>/dev/null || echo "000")

  if [[ "$status" == "$expected_status" ]]; then
    echo -e "  ${GREEN}PASS${NC} [$status] $desc"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} [$status] $desc (expected $expected_status)"
    FAIL=$((FAIL + 1))
  fi
}

echo "Starting SARAB dev server on port $PORT..."
env PORT="$PORT" npx tsx src/server.ts &
SERVER_PID=$!

echo "Waiting for server..."
for i in $(seq 1 30); do
  if curl -s "$BASE/health" > /dev/null 2>&1; then
    echo "Server ready."
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo -e "${RED}Server failed to start${NC}"
    exit 1
  fi
  sleep 0.5
done

if ! curl -s "$BASE/health" > /dev/null 2>&1; then
  echo -e "${RED}Server did not become ready in 15s${NC}"
  exit 1
fi

echo ""
echo "Running smoke tests..."
echo ""

# ── Health & Static ──────────────────────────────────────────
check "Health endpoint"            "GET"  "/health"           200
check "Web UI loads"               "GET"  "/"                 200
check "CSS loads"                  "GET"  "/styles.css"       200
check "JS loads"                   "GET"  "/js/core.js"      200

# ── Jobs API ─────────────────────────────────────────────────
check "List jobs (empty)"          "GET"  "/api/jobs"         200
check "Job stats"                  "GET"  "/api/jobs/stats"   200
check "Get missing job"            "GET"  "/api/jobs/nope"    404

# ── Queue API ────────────────────────────────────────────────
check "Queue status"               "GET"  "/api/queue/status"  200
check "Pause queue"                "POST" "/api/queue/pause"   200

# ── Create job (queue is paused, so it stays pending) ────────
JOB_ID=$(curl -s -X POST "$BASE/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke test","prompt":"Say hello","maxRetries":0,"timeoutMs":30000}' \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ -n "$JOB_ID" ]]; then
  echo -e "  ${GREEN}PASS${NC} [201] Create job → $JOB_ID"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}FAIL${NC} Could not create job"
  FAIL=$((FAIL + 1))
fi

check "Get created job"            "GET"  "/api/jobs/$JOB_ID"  200

# Cancel (still pending because queue is paused)
check "Cancel job"                 "POST" "/api/jobs/$JOB_ID/cancel" 200

# Resume queue
check "Resume queue"               "POST" "/api/queue/resume"  200

# Delete cancelled job
check "Delete job"                 "DELETE" "/api/jobs/$JOB_ID" 200
check "Deleted job is 404"         "GET"   "/api/jobs/$JOB_ID"  404

# ── SSE (check it connects, not the stream itself) ───────────
SSE_OUT=$(mktemp)
curl -s --max-time 2 "$BASE/api/events" > "$SSE_OUT" 2>/dev/null || true
if grep -q "connected" "$SSE_OUT" 2>/dev/null; then
  echo -e "  ${GREEN}PASS${NC} [SSE] SSE endpoint streams events"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}FAIL${NC} [---] SSE endpoint did not return expected data"
  FAIL=$((FAIL + 1))
fi
rm -f "$SSE_OUT"

echo ""
echo "─────────────────────────────────────"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "─────────────────────────────────────"

exit $FAIL
