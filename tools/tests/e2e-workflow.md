# e2e-workflow: Full Test Workflow for habit-hero

End-to-end test covering setup → install → app/API → agent prompts → uninstall.

**Prerequisites:** claude-gateway running locally.

Set these shell variables once at the start — used throughout the steps below:

```bash
# Run from repo root
APP_NAME=$(grep '^name:' app.yaml | awk '{print $2}')
AGENT_NAME=$(grep -A3 '^\s*agent:' app.yaml | grep '^\s*name:' | awk '{print $2}')
```

---

## 1. Environment Setup

### 1.1 App env — `<repo-root>/.env`

Used by the app and DB containers at install time. Create if not exists:

```bash
# Run from repo root
if [ ! -f .env ]; then
  echo "DB_PASSWORD and NEXTAUTH_SECRET need to be set."
  printf "Enter DB_PASSWORD (any string, keep it secret): "
  read -r db_pass
  printf "Enter NEXTAUTH_SECRET (openssl rand -base64 32): "
  read -r nextauth_secret
  cat > .env <<EOF
DB_PASSWORD=${db_pass}
NEXTAUTH_SECRET=${nextauth_secret}
EOF
  echo ".env created."
fi
```

> `NEXTAUTH_URL` / `BASE_PATH` are injected automatically by the gateway at install time. Do not set them manually.

### 1.2 Install env — `tools/installs/.env`

Used by `install.sh` to authenticate to the gateway and pass container secrets. Create if not exists:

```bash
# Run from repo root
if [ ! -f tools/installs/.env ]; then
  echo ""
  echo "tools/installs/.env needs to be configured."
  echo ""
  printf "GATEWAY_API_KEY  (find it in gateway admin panel or ~/.claude-gateway/config.yaml): "
  read -r api_key
  DB_PASSWORD=$(grep '^DB_PASSWORD=' .env | cut -d= -f2)
  NEXTAUTH_SECRET=$(grep '^NEXTAUTH_SECRET=' .env | cut -d= -f2)
  cat > tools/installs/.env <<EOF
GATEWAY_API_KEY=${api_key}
DB_PASSWORD=${DB_PASSWORD}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
EOF
  echo "tools/installs/.env created."
fi
```

### 1.3 Test env — `tools/tests/.env`

Used by `agent-msg.sh` to connect to the gateway. Create if not exists:

```bash
# Run from repo root
if [ ! -f tools/tests/.env ]; then
  echo ""
  echo "tools/tests/.env needs to be configured."
  echo ""
  printf "GATEWAY_API_KEY  (find it in gateway admin panel or ~/.claude-gateway/config.yaml): "
  read -r api_key
  AGENT_NAME=$(grep -A3 '^\s*agent:' app.yaml | grep '^\s*name:' | awk '{print $2}')
  cat > tools/tests/.env <<EOF
GATEWAY_API_KEY=${api_key}
AGENT_ID=${AGENT_NAME}
SESSION_ID=
EOF
  echo "tools/tests/.env created."
fi
```

**Where to find each value:**

| Variable | Where |
|---|---|
| `GATEWAY_API_KEY` | gateway admin panel > API Keys, or `~/.claude-gateway/config.yaml` |
| `DB_PASSWORD` | pick any secret string — must match repo-root `.env` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` — must match repo-root `.env` |
| `AGENT_ID` | `app.yaml` → `services.agent.name` (auto-read by setup script above) |
| `SESSION_ID` | Leave blank — `agent-msg.sh` fills this automatically after first message |

---

## 2. Uninstall (if exists)

```bash
# Run from repo root
( cd tools/installs && bash uninstall.sh ) 2>/dev/null || true

# Verify containers are gone
docker ps --filter name=${APP_NAME}
# Expected: empty
```

If you want a clean DB state (no leftover data):

```bash
# Run from repo root
rm -rf postgres/
```

---

## 3. Install

```bash
# Run from repo root
cd tools/installs
make install-watch
cd ../..
```

`make install-watch` starts the async install and polls the job until it reports
`completed` or `failed`.

**Expected logs:**
- `Symlinked <path> → ~/.claude-gateway/apps/${APP_NAME}`
- `Agent "${AGENT_NAME}" registered`
- `Containers healthy`
- `Install complete: ...`

**Verify symlink and agent registration:**

```bash
# apps/<app-name> must be a symlink pointing to repo root
ls -la ~/.claude-gateway/apps/${APP_NAME}
# Expected: lrwxrwxrwx ... ${APP_NAME} -> /path/to/repo

# agents/<agent-name> must exist as a directory
ls ~/.claude-gateway/agents/${AGENT_NAME}
# Expected: directory listing (AGENTS.md, skills/, etc.)
```

**Verify containers:**

```bash
docker ps --filter name=${APP_NAME}
# Expected: ${APP_NAME}-app (healthy), ${APP_NAME}-db (healthy), ${APP_NAME}-agent (up)
```

You can re-check app status at any time:

```bash
# Run from repo root
( cd tools/installs && bash stat.sh )
```

---

## 4. App / API Tests

Run from inside the agent container (uses docker-compose DNS `app`):

```bash
BASE_PATH=$(docker exec ${APP_NAME}-agent printenv BASE_PATH)
```

### 4.1 Health check

```bash
docker exec ${APP_NAME}-agent curl -si "http://app:4000${BASE_PATH}/api/health"
# Expected: HTTP 200
```

### 4.2 List habits

```bash
docker exec ${APP_NAME}-agent curl -s "http://app:4000${BASE_PATH}/api/habits"
# Expected: JSON array (empty [] only on a fresh DB with no prior data)
```

### 4.3 Create a habit

```bash
HABIT_ID=$(docker exec ${APP_NAME}-agent curl -s -X POST "http://app:4000${BASE_PATH}/api/habits" \
  -H "Content-Type: application/json" \
  -d '{"name":"Brush teeth","points":10}' | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "Created habit id: $HABIT_ID"
# Expected: {"id":<N>,"name":"Brush teeth","points":10,...}
```

### 4.4 Log a completion

```bash
docker exec ${APP_NAME}-agent curl -s -X POST "http://app:4000${BASE_PATH}/api/habits/${HABIT_ID}/complete" \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: completion record with awarded points
```

### 4.5 Delete a habit

```bash
docker exec ${APP_NAME}-agent curl -s -X DELETE "http://app:4000${BASE_PATH}/api/habits/${HABIT_ID}"
# Expected: {"deleted":true} or 204 No Content
```

> The exact API surface is defined by the app phase (see design/PRD.md §7 and design/task.md).
> Adjust the endpoints above to match the implemented routes.

---

## 5. Agent Prompt Tests

Clear any stale session before running (required after reinstall):

```bash
sed -i 's/^SESSION_ID=.*/SESSION_ID=/' tools/tests/.env
```

```bash
cd tools/tests
```

### 5.1 List a child's habits

```bash
bash agent-msg.sh "what habits does Mina have today?"
# Expected: list of the child's habits with completion state
```

### 5.2 Mark a habit done

```bash
bash agent-msg.sh "mark Mina's brush teeth as done"
# Expected: confirmation + points awarded
```

### 5.3 Points / progress query

```bash
bash agent-msg.sh "how many points did Mina earn this week?"
# Expected: weekly point total
```

### 5.4 Add a new habit

```bash
bash agent-msg.sh "add a new habit: make the bed, worth 5 points"
# Expected: confirmation that the habit was created
```

---

## 6. Uninstall

```bash
# Run from repo root
( cd tools/installs && bash uninstall.sh )
```

**Verify symlink is removed:**

```bash
# apps/<app-name> symlink must be gone
ls ~/.claude-gateway/apps/${APP_NAME}
# Expected: No such file or directory
```

> `~/.claude-gateway/agents/${AGENT_NAME}` is preserved by the gateway (stores conversation history and sessions). This is intentional — remove manually only if a fully clean state is needed.

**Verify containers are gone:**

```bash
docker ps --filter name=${APP_NAME}
# Expected: empty
```

> Postgres data at `postgres/` is preserved. Delete manually for a fully clean state.
