#!/bin/bash
[ -f "$(dirname "$0")/.env" ] && source "$(dirname "$0")/.env"

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_NAME=$(grep '^name:' "${APP_DIR}/app.yaml" | awk '{print $2}')

body=$(jq -n \
  --arg path "$APP_DIR" \
  --arg pass "${DB_PASSWORD}" \
  --arg secret "${NEXTAUTH_SECRET}" \
  --arg url "${NEXTAUTH_URL:-http://localhost:3737}" \
  --arg agenttok "${AGENT_API_TOKEN}" \
  '{"local_path":$path,"env_vars":{"DB_PASSWORD":$pass,"NEXTAUTH_SECRET":$secret,"NEXTAUTH_URL":$url,"AGENT_API_TOKEN":$agenttok}}')

curl -s -X POST http://localhost:10850/api/v1/apps/install \
  -H "X-Api-Key: $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$body" | jq
