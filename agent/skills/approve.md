# /approve
Parent approves (or rejects) a pending chore completion. Awarding XP happens server-side.

**Usage:**
- `/approve <completionId>`
- `/reject <completionId> <reason>`

Find the id first if the parent named a chore instead of an id:
```
GET http://app:4000${BASE_PATH}/api/completions?status=pending
```

**Approve:**
```
POST http://app:4000${BASE_PATH}/api/completions/<completionId>/approve
headers: x-agent-token: ${AGENT_API_TOKEN}
         x-actor-ref: <parent channel_user_ref>
```

**Reject (with feedback):**
```
POST http://app:4000${BASE_PATH}/api/completions/<completionId>/reject
headers: x-agent-token: ${AGENT_API_TOKEN}
         x-actor-ref: <parent channel_user_ref>
body (JSON): { "feedback": "<reason>" }
```

**Undo an approval (parent changed their mind):**
```
POST http://app:4000${BASE_PATH}/api/completions/<completionId>/unapprove
headers: x-agent-token: ${AGENT_API_TOKEN}
         x-actor-ref: <parent channel_user_ref>
```
Only works on an **approved** completion (a pending one returns `409`). It claws the
granted XP back, revokes any badge that approval was holding up (`revokedBadges` in the
response), and puts the chore back in the pending queue with its photo intact. The daily
streak is deliberately not rewound — if you mention the undo, say the streak is unchanged
rather than implying it was reverted.

**Reply:**
- Approve → confirm and **celebrate any level-up / streak / badge deltas** the response
  returns (see AGENTS.md §7). Tell the child their work passed.
- Reject → relay the feedback gently ("ลองอีกครั้งนะ ...") — no XP is added.

Only a **parent** may do this; the API enforces role. A child or outsider trying to approve
gets `403` — relay that, don't retry. Inline `[✅][❌]` buttons are the channel's job, not yours.

**Example**
- Parent: "อนุมัติงานล้างจานของมิ้นท์"
- → `GET /api/completions?status=pending` (find id `c_88`)
- → `POST /api/completions/c_88/approve`
- Reply: "อนุมัติแล้ว! มิ้นท์ได้ 30 XP 🎉 เลเวลอัพเป็น Level 7 ด้วยนะ!"
