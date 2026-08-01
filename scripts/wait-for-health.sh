#!/usr/bin/env bash
# wait-for-health.sh <url> <timeout_s>
# Poll <url> until it returns HTTP 200, or exit 1 after <timeout_s> seconds.
set -euo pipefail

URL="${1:?usage: wait-for-health.sh <url> <timeout_s>}"
TIMEOUT="${2:?usage: wait-for-health.sh <url> <timeout_s>}"

deadline=$(( $(date +%s) + TIMEOUT ))

echo "wait-for-health: polling ${URL} for up to ${TIMEOUT}s"
while :; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${URL}" || true)"
  if [ "${code}" = "200" ]; then
    echo "wait-for-health: ${URL} is healthy (200)"
    exit 0
  fi
  if [ "$(date +%s)" -ge "${deadline}" ]; then
    echo "wait-for-health: timed out after ${TIMEOUT}s (last status: ${code:-none})" >&2
    exit 1
  fi
  sleep 2
done
