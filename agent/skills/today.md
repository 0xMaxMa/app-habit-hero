# /today
Show a child's still-pending chores for today.

**Usage:** `/today [child]`

- `child` — the child's user id. If omitted, use the sender's own linked identity.

**Call:**
```
GET http://app:4000${BASE_PATH}/api/chores/today?child=<userId>
headers: x-agent-token: ${AGENT_API_TOKEN}
         x-actor-ref: <sender channel_user_ref>
```

**Reply:** list each pending chore with its XP. If the list is empty, cheer that everything's
done for today. On `401 UNLINKED`, ask the user to link first (see `link.md`).

**Example**
- User: "งานวันนี้เหลืออะไรบ้าง"
- → `GET /api/chores/today?child=u_mint`
- Reply: "วันนี้เหลือ 2 งานนะ 🧹 ล้างจาน (30 XP), 🧸 เก็บของเล่น (20 XP) สู้ๆ!"
