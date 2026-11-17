#!/usr/bin/env bash
# Browser tests for the dashboard. Starts a throwaway hub (sqlite in a temp folder, made-up secrets, port 8801),
# seeds it, runs the Playwright scripts in this folder, and stops the hub.
#
#   one-time:  npm install -g playwright && npx playwright install chromium
#   run:       bash tests/e2e/run-all.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT="${PORT:-8801}"
WORK="$(mktemp -d)"
export DATABASE_URL="sqlite:///$WORK/hub.db"
export ADMIN_TOKEN="test-admin-token-0123456789abcdef"
export SESSION_SECRET="test-session-secret-0123456789ab"
export DASHBOARD_PASSWORD="demo-pass"
export COOKIE_SECURE=0
export SENSITIVE_BOTS="finance"
export OWNER_NAME="Mr. Stark"
export BOT_TOKENS='{"chief-of-staff":"tok-chief-of-staff-0123456789ab","inbox":"tok-inbox-0123456789abcdef0123","social":"tok-social-0123456789abcdef01","fitness":"tok-fitness-0123456789abcdef0","finance":"tok-finance-0123456789abcdef0"}'
export HUB="http://127.0.0.1:$PORT"

python3 -m uvicorn app.main:app_factory --factory --port "$PORT" --log-level warning &
HUB_PID=$!
trap 'kill "$HUB_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do curl -sf "$HUB/health" >/dev/null && break; sleep 0.5; done
python3 tests/e2e/seed.py

status=0
for t in ambient a11y core perf live; do
  echo; echo "=== $t"
  node "tests/e2e/$t.js" || status=1
done
echo; [ "$status" = 0 ] && echo "all browser tests passed" || echo "SOME BROWSER TESTS FAILED"
exit "$status"
