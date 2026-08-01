#!/bin/bash
[ -f "$(dirname "$0")/.env" ] && source "$(dirname "$0")/.env"

[ -z "$1" ] && echo "Usage: job.sh <job-id>" && exit 1

curl -s "http://localhost:10850/api/v1/apps/jobs/$1" \
  -H "X-Api-Key: $GATEWAY_API_KEY" \
  | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g; s/\x1b.//g' \
  | tr -d '\000-\010\013-\037'
