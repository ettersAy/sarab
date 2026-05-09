#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────
# run-all-tests.sh — Run smoke tests + Playwright tests
# ───────────────────────────────────────────────────────────────────
set -euo pipefail

echo "=== JS Syntax Check ==="
JS_OK=1
for f in src/web/js/*.js src/web/js/views/*.js; do
  node -c "$f" 2>&1 || { echo "FAILED: $f"; JS_OK=0; }
done
[ "$JS_OK" -eq 1 ] && echo "All JS OK" || { echo "JS syntax check FAILED"; exit 1; }

echo ""
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
