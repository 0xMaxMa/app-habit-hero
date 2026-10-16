# Memory — read and write your own notes

Long-term notes (which child maps to which linked ref, a family's preferences) go in
**that family's own file**, never in one file shared across every family you now talk to.
This is enforced by `memory-path.sh`, not by remembering to tag headings — the point of a
per-family file is that there is no shared file left to blend two families' notes into.

**Before any memory read or write, resolve the path. Never type it by hand:**

```
1. GET /api/family
   headers: x-agent-token, x-actor-ref: <this message's channel_user_ref>
   → { "family": { "id": "<familyId>", "name": "...", ... } }
2. bash skills/memory-path.sh <familyId>
   → memory/family-<familyId>.md
3. Read or write exactly that path for everything about this family.
```

Do this every time, even mid-conversation — step 1 is already required by AGENTS.md §1
("resolve family fresh, every single message"), so this only adds step 2. Never reuse a
path resolved for a different message, and never fall back to a shared file (`MEMORY.md`
or otherwise) when the script rejects the input — fix the input instead: re-resolve the
family and try again.

**Still true as before (AGENTS.md §10):**

- Never store secrets — no `AGENT_API_TOKEN`, no channel tokens, no PINs, no passwords.
- Treat what's in the file as private — one family's children's names and ids. Never
  paste it into a GitHub issue, a pull request, a log line, or a reply to anyone outside
  that family.
- A note is a hint, never a credential — confirm it against a live API call before acting
  on it.
- Nothing under `memory/` survives an app update. Only a file literally named `MEMORY.md`
  gets backed up by the gateway, and per-family notes no longer live there. Treat every
  note here as rebuildable, not irreplaceable.

**This is app-level, not gateway-level, and that's intentional.** claude-gateway's opt-in
`multiTenant` agent setting (per-sender isolation, `memory_search`/`memory_get` disabled)
cannot apply to this agent — gateway refuses it for `type: "app-agent"`, which is how this
agent is registered, and even if it could, its tenant key is per sender, not per family,
which would split one family's notes across each linked parent. See AGENTS.md §10 for the
full reasoning. Don't reach for `memory_search`/`memory_get` as a shortcut here either:
this agent's archive is never built, so they would find nothing — the path above is the
only way in or out of a family's notes.
