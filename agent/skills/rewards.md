# /rewards
Show the active reward catalog and XP cost of each.

**Usage:** `/rewards`

**Call:**
```
GET http://app:4000${BASE_PATH}/api/rewards
headers: x-agent-token: ${AGENT_API_TOKEN}
         x-actor-ref: <sender channel_user_ref>
```

**Reply:** list each active reward with its emoji and XP cost. To redeem one, see `redeem.md`.

**Example**
- User: "มีของรางวัลอะไรบ้าง"
- → `GET /api/rewards`
- Reply: "คลังรางวัลตอนนี้ 🎮 เล่นเกม 1 ชม. (100 XP) · 🎬 ดูหนัง (150 XP) · 🍕 Pizza night (500 XP) อยากแลกอันไหนบอกได้เลย!"
