# /badges
Show a child's achievement medals (earned, locked, and newly-unlocked).

**Usage:** `/badges [user]`

- `user` — the user id to look up. If omitted, use the sender's own linked identity.

**Call:**
```
GET http://app:4000${BASE_PATH}/api/badges?user=<userId>
headers: x-agent-token: ${AGENT_API_TOKEN}
         x-actor-ref: <sender channel_user_ref>
```

**Response:** `{ earnedCount, total, newCount, badges: [{ id, name, description, imageUrl, earned, isNew }] }`.

**Reply:**
- Summarize how many are earned ("ได้แล้ว 3 / 5 เหรียญ").
- List the earned ones by name + emoji, and hint what's left to unlock (use each
  locked badge's `description`).
- **Attach the medal image** for earned badges (especially any `isNew`): download
  `http://app:4000${BASE_PATH}<imageUrl>` (e.g. `/badges/on_fire.png`) and attach it.

Authz mirrors `/score`: a child may only read their own; a parent may read any child in
the family. On `401 UNLINKED`, ask the user to link first (see `link.md`).

**Example**
- Child: "หนูได้เหรียญอะไรบ้าง"
- → `GET /api/badges?user=u_a`
- Reply: "ได้แล้ว 3 / 28 เหรียญ 🎉 — 🔥 สตรีค 7 วัน, 🧹 นักทำความสะอาด กับ ⭐ 1,000 XP! เหลือ 📚 หนอนหนังสือ (อ่านหนังสือครบ 10 ครั้ง) อีกนะ" + แนบรูปเหรียญที่ได้
