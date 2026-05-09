#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────
# run-all-tests.sh — Run smoke tests + Playwright tests
# ───────────────────────────────────────────────────────────────────
set -euo pipefail

echo "=== TypeScript Check ==="
npx tsc --noEmit && echo "OK" || { echo "FAILED"; exit 1; }

echo ""
echo "=== Smoke Tests ==="
./scripts/smoke-test.sh 3467 || { echo "Smoke tests FAILED"; exit 1; }

echo ""
echo "=== Playwright Tests ==="
rm -rf data test-results
npx playwright test || { echo "Playwright tests FAILED"; exit 1; }

echo ""
echo "=== All tests passed ==="
