# /score
Show a user's XP, level, streak, and badges.

**Usage:** `/score [user]`

- `user` — the user id to look up. If omitted, use the sender's own linked identity.

**Call:**
```
GET http://app:4000${BASE_PATH}/api/progress?user=<userId>
headers: x-agent-token: ${AGENT_API_TOKEN}
         x-actor-ref: <sender channel_user_ref>
```

**Reply:** current XP, level, "อีก N XP ถึง Level x", current streak, and any badges. Report
the numbers the API returns — never invent them. On `401 UNLINKED`, ask the user to link
first (see `link.md`).

**Example**
- User: "คะแนนฉันเท่าไหร่แล้ว"
- → `GET /api/progress?user=u_mint`
- Reply: "ตอนนี้ Level 6 · 340 XP 🔥 สตรีค 5 วัน — อีก 160 XP ถึง Level 7!"
