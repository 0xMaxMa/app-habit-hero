# /bonus
Parent grants manual bonus XP to a child.

**Usage:** `/bonus <child> <amount> <reason>`

- `child` — the child's user id (resolve from name if needed).
- `amount` — positive integer XP.
- `reason` — short text for the audit trail.

**Call:**
```
POST http://app:4000${BASE_PATH}/api/bonus
headers: x-agent-token: ${AGENT_API_TOKEN}
         x-actor-ref: <parent channel_user_ref>
body (JSON): { "user": "<childId>", "amount": <N>, "reason": "<reason>" }
```

**Reply:** confirm the bonus and **celebrate any level-up / streak / badge deltas** the
response returns (AGENTS.md §7).

Parent-only — the API enforces role (a child bonusing themselves gets `403`; relay, don't
retry).

**Example**
- Parent: "บวก น้องเอ 50 XP ช่วยล้างรถ"
- → `POST /api/bonus { "user": "u_a", "amount": 50, "reason": "ช่วยล้างรถ" }`
- Reply: "ให้โบนัส 50 XP น้องเอแล้ว 🚗✨ (ช่วยล้างรถ)"
