# /redeem
Child requests to redeem a reward with their XP.

**Usage:** `/redeem <reward>`

- `reward` — reward name or id. Resolve the id from `GET /api/rewards` (see `rewards.md`);
  if the name is ambiguous, ask which one.

**Call:**
```
POST http://app:4000${BASE_PATH}/api/redemptions
headers: x-agent-token: ${AGENT_API_TOKEN}
         x-actor-ref: <child channel_user_ref>
body (JSON): { "reward_id": "<id>", "user": "<childId>" }
```

**Reply:**
- Enough XP → API creates a `pending` redemption; tell the child the request was sent to a
  parent to approve.
- Not enough → API returns `{ "shortfall": N }` and creates **no** row; tell the child
  exactly how many XP short ("ขาดอีก N XP นะ เก็บอีกนิดเดียว!").
- Over a limit → API rejects with a reason; relay it kindly.

A parent later approves with `POST /api/redemptions/:id/approve`, which deducts the XP.

**Example**
- Child: "ขอแลกเล่นเกม 1 ชม."
- → `GET /api/rewards` (reward id `r_game`) → `POST /api/redemptions { "reward_id": "r_game", "user": "u_mint" }`
- Reply (enough): "ส่งคำขอแลก 🎮 เล่นเกม 1 ชม. ให้คุณแม่อนุมัติแล้วนะ!"
- Reply (short): "ตอนนี้มี 80 XP ขาดอีก 20 XP ถึงจะแลกได้ สู้ๆ!"
