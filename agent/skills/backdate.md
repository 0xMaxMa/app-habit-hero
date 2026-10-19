# /backdate
Parent logs a chore completion for a past day (up to 7 days back) — the API's answer
to "ส่งงานเมื่อวาน" / "เมื่อวานลืมส่ง" style requests.

**Usage:** `/backdate <child> <chore> <date>`

- `child` — the child's user id (resolve from name if needed).
- `chore` — the chore id (resolve from name/today's list if needed).
- `date` — the day it actually happened, `YYYY-MM-DD`, Thai local calendar date.
  **Must be strictly before today and at most 7 days back.** Today itself is NOT
  valid here — use the normal submit flow (`POST /api/completions`) for same-day work.

**Call:**
```
POST http://app:4000${BASE_PATH}/api/completions/backdate
headers: x-agent-token: ${AGENT_API_TOKEN}
         x-actor-ref: <parent channel_user_ref>
body (JSON): { "child": "<childId>", "chore_id": "<choreId>", "date": "<YYYY-MM-DD>" }
```

The completion is created **already approved** — a parent attesting it happened for a
specific day IS the approval, there is no separate review step. XP, level, streak and
badge deltas come back exactly like an approve call; **celebrate any deltas** (§7).

**When to use this instead of Bonus XP:** a request to credit a specific *chore* for a
*specific past day within the last 7 days* → use `/backdate`, it corrects the real
completion history (and recomputes the streak for that day correctly) instead of just
stapling XP onto today. Fall back to Bonus XP (`skills/bonus.md`) only when:
  - the date is more than 7 days back (the API will `400` — relay the window, don't retry
    with a different date), or
  - there's no specific chore being credited (a vague "ปะป๊าให้พิเศษ" bonus), or
  - the parent explicitly asks for a bonus rather than a backdated chore log.

Parent-only — the API enforces role (a child backdating, or a parent backdating another
family's child, gets `403`; relay, don't retry). A day already covered for that chore gets
`409 ALREADY_SUBMITTED` — relay it, same as a normal duplicate submit.

**Example**
- Parent: "ส่งงานเมื่อวาน เหวินทำการบ้าน" (and "การบ้าน" is a real chore on เหวิน's list)
- → resolve เหวิน's user id + the การบ้าน chore id, compute yesterday's date
- → `POST /api/completions/backdate { "child": "u_wern", "chore_id": "chore_homework", "date": "2026-10-18" }`
- Reply: "บันทึกงานการบ้านของเหวินสำหรับเมื่อวาน (18 ต.ค.) แล้วค่ะ ✅ ได้ +XX XP"
