# /deduct
Parent deducts XP from a child ("หักคะแนน").

**Usage:** `/deduct <child> <amount> <reason>`

- `child` — the child's user id (resolve from name if needed).
- `amount` — positive integer XP, max **1000** per deduction. Send the amount as a
  *positive* number; the API applies the minus itself.
- `reason` — **required**, max 200 chars. It is stored and shown to the child in their own
  history, so never invent one: if the parent did not give a reason, **ask for it** before
  calling.

**Call:**
```
POST http://app:4000${BASE_PATH}/api/deductions
headers: x-agent-token: ${AGENT_API_TOKEN}
         x-actor-ref: <parent channel_user_ref>
body (JSON): { "user": "<childId>", "amount": <N>, "reason": "<reason>" }
```

**Reply:** confirm what was actually taken off, and report these fields honestly:

- `applied` — XP really removed. When `floored` is `true` this is **less** than `requested`
  because the balance stops at 0 (a child never goes negative) — say so.
- `xp` / `level` — the balance and level after the deduction.
- `leveledDown` / `levelsLost` — mention it plainly if the child dropped a level. Do not
  celebrate anything here; this is not a gamification delta (§7).

Parent-only — the API enforces role and family (a child deducting anyone, or a parent
deducting another family's child, gets `403`; relay, don't retry). `amount` ≤ 0, a
fractional amount, over 1000, or a blank reason get `400` — relay the message.

**Read history:** `GET /api/deductions[?child=<childId>]` returns the family's deductions
(newest first). A child asking is pinned to their own rows by the API.

**Example**
- Parent: "หัก น้องเอ 50 XP ไม่ทำการบ้าน"
- → `POST /api/deductions { "user": "u_a", "amount": 50, "reason": "ไม่ทำการบ้าน" }`
- Reply: "หัก 50 XP ของน้องเอแล้วครับ (ไม่ทำการบ้าน) — เหลือ 100 XP, Level 1"
