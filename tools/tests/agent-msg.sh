#!/bin/bash
ENV_FILE="$(dirname "$0")/.env"
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

MSG="${1:-hello}"

BODY=$(jq -n --arg msg "$MSG" --arg cid "tools" '{message: $msg, chat_id: $cid, stream: true}')
[ -n "$SESSION_ID" ] && BODY=$(printf '%s' "$BODY" | jq --arg sid "$SESSION_ID" '. + {session_id: $sid}')

URL="http://localhost:10850/api/v1/agents/${AGENT_ID}/messages"

echo "--- DEBUG ---" >&2
echo "URL:      $URL" >&2
echo "AGENT_ID: $AGENT_ID" >&2
echo "API_KEY:  ${GATEWAY_API_KEY:0:8}..." >&2
echo "SESSION:  ${SESSION_ID:-(none)}" >&2
echo "BODY:     $BODY" >&2
echo "-------------" >&2

NEW_SESSION=""

curl -sN -X POST "$URL" \
  -H "X-Api-Key: $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d "$BODY" | while IFS= read -r line; do
  [ -z "$line" ] && continue
  [[ "$line" != data:* ]] && continue

  payload="${line#data: }"
  [ "$payload" = "[DONE]" ] && break

  type=$(printf '%s' "$payload" | jq -r '.type // empty' 2>/dev/null)

  case "$type" in
    text_delta)
      text=$(printf '%s' "$payload" | jq -r '.text // empty' 2>/dev/null)
      printf '%s' "$text"
      ;;
    result)
      printf '\n'
      NEW_SESSION=$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null)
      duration=$(printf '%s' "$payload" | jq -r '.duration_ms // empty' 2>/dev/null)
      echo "(done — ${duration}ms)" >&2
      if [ -n "$NEW_SESSION" ] && [ "$NEW_SESSION" != "$SESSION_ID" ]; then
        if grep -q "^SESSION_ID=" "$ENV_FILE" 2>/dev/null; then
          sed -i "s|^SESSION_ID=.*|SESSION_ID=$NEW_SESSION|" "$ENV_FILE"
        else
          echo "SESSION_ID=$NEW_SESSION" >> "$ENV_FILE"
        fi
        echo "(session saved: $NEW_SESSION)" >&2
      fi
      ;;
    error)
      printf '\n'
      msg=$(printf '%s' "$payload" | jq -r '.message // empty' 2>/dev/null)
      echo "ERROR: $msg" >&2
      ;;
  esac
done
