#!/usr/bin/env bash
# docker-smoke.sh — standalone docker-compose smoke test (D-1..D-4).
#
# This is the NO-GATEWAY path: it brings up the repo's own docker-compose.yml,
# waits for the app health endpoint, verifies migrations are applied inside the
# container, then tears everything down. The gateway-managed install flow lives
# under tools/ (see tools/tests/e2e-workflow.md) — this script deliberately does
# not touch it.
#
#   D-1  docker compose up -d (build + start app + db)
#   D-2  wait for /api/health to return 200, then curl -f it
#   D-3  assert `prisma migrate status` is clean inside the app container
#   D-4  docker compose down (always, even on failure)
#
# The standalone docker-compose.yml builds the app at the root path (no
# BASE_PATH), matching app.yaml's `type: api`, so health is at /api/health.
# Override HEALTH_URL if you deploy under a sub-path:
#   HEALTH_URL=http://localhost:4000/some/prefix/api/health scripts/docker-smoke.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

HEALTH_URL="${HEALTH_URL:-http://localhost:4000/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

cleanup() {
  echo "== D-4: docker compose down =="
  docker compose down -v || true
}
trap cleanup EXIT

echo "== D-1: docker compose up -d =="
docker compose up -d --build

echo "== D-2: wait for health @ ${HEALTH_URL} =="
"${SCRIPT_DIR}/wait-for-health.sh" "${HEALTH_URL}" "${HEALTH_TIMEOUT}"
curl -fsS "${HEALTH_URL}" >/dev/null
echo "health OK"

echo "== D-3: prisma migrate status (inside app container) =="
# Next standalone drops node_modules/.bin, so call the Prisma CLI entrypoint
# directly (matches the container CMD) rather than via `npx prisma`.
docker compose exec -T app node node_modules/prisma/build/index.js migrate status

echo "docker-smoke: PASS"
