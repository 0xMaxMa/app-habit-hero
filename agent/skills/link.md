# /link
Bind this channel sender to a HabitHero user with a one-time link code.

**When:** any API call returns `401` with code `UNLINKED`, or a user says they have a link
code. A parent generates codes in the web app under **Settings → Family**.

**Usage:** `/link <code>`

**Call:**
```
POST http://app:4000${BASE_PATH}/api/link
headers: x-agent-token: ${AGENT_API_TOKEN}
         x-actor-ref: <this sender's channel_user_ref>
body (JSON): { "code": "<link code>", "channel_user_ref": "<same ref>" }
```

**Reply:**
- Success → confirm they're linked, then retry whatever they originally wanted.
- Invalid / already used / expired → tell them to ask a parent for a fresh code. A code
  works **once only**.

Until linked, no other action works — ask for a code before doing anything else.

**Example**
- User: "รหัสของฉันคือ 7F3K9Q"
- → `POST /api/link { "code": "7F3K9Q", "channel_user_ref": "tg:12345" }`
- Reply: "ผูกบัญชีเรียบร้อย! ทีนี้ถามคะแนนหรือส่งงานได้เลยนะ 🎉"
