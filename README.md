# HabitHero 🏡

ระบบติดตาม **งานบ้าน + นิสัยดี** สำหรับครอบครัว — เด็กส่งงานพร้อมรูป ผู้ปกครองอนุมัติ เด็กได้ XP ขึ้นเลเวล
สะสมเหรียญตรา แล้วเอา XP ไปแลกรางวัลที่พ่อแม่ตั้งไว้ ใช้ได้ทั้งหน้าเว็บและผ่านแชท (Telegram / Discord / LINE)
ด้วย AI agent ของ [claude-gateway](https://github.com/0xMaxMa/claude-gateway)

> ออกแบบเป็น **แอปครอบครัวเดียว (single-family)** ต่อการติดตั้งหนึ่งครั้ง — ไม่มีระบบสมัครสมาชิกเปิดสาธารณะ
> ผู้ปกครองคนแรกที่กด "สร้างบัญชี" คือเจ้าของบ้าน แล้วประตูก็ปิด

---

## สารบัญ

- [ฟีเจอร์](#ฟีเจอร์)
- [สแตกที่ใช้](#สแตกที่ใช้)
- [ติดตั้งบน claude-gateway (getpod app)](#ติดตั้งบน-claude-gateway-getpod-app)
- [ตัวแปรสภาพแวดล้อม (env)](#ตัวแปรสภาพแวดล้อม-env)
- [ใช้งานครั้งแรก](#ใช้งานครั้งแรก)
- [ข้อมูลตั้งต้น (init data)](#ข้อมูลตั้งต้น-init-data)
- [พัฒนาต่อบนเครื่อง](#พัฒนาต่อบนเครื่อง)
- [เทสต์](#เทสต์)
- [โครงสร้างโปรเจกต์](#โครงสร้างโปรเจกต์)
- [ความปลอดภัย](#ความปลอดภัย)

---

## ฟีเจอร์

**ฝั่งเด็ก**
- รายการงานวันนี้ ส่งงานพร้อมรูปถ่าย
- XP / เลเวล 45 ขั้น + ยศ 9 ระดับ / สตรีคต่อเนื่อง
- เหรียญตรา 28 แบบ พร้อมป๊อปอัพฉลองตอนได้ใหม่
- ร้านรางวัล — ใช้ XP แลกของที่พ่อแม่ตั้งไว้
- เข้าระบบด้วย **PIN 4 หลัก** (ไม่ต้องมีอีเมล)

**ฝั่งผู้ปกครอง**
- แดชบอร์ดสรุปทั้งบ้าน + คิวรออนุมัติ (ดูรูปก่อนอนุมัติได้)
- อนุมัติ / ปฏิเสธ / **ยกเลิกอนุมัติ** (คืน XP + ถอนเหรียญที่ได้จากครั้งนั้น)
- จัดการงานบ้าน (หมวดหมู่ / XP / ทำซ้ำรายวัน-รายสัปดาห์ / กำหนดเวลา / ต้องมีรูปไหม)
- จัดการรางวัล + ลิมิตต่อวัน-สัปดาห์-เดือน
- แจก XP โบนัส · ประวัติย้อนหลัง · จัดการสมาชิกและรูปโปรไฟล์

**ผ่านแชท (AI agent)**
- คุยภาษาธรรมชาติ: "วันนี้มีงานอะไร", "ส่งงานล้างจาน" (แนบรูป), "ขอแลกรางวัล", "อนุมัติให้หน่อย"
- ตัว agent เป็น **markdown ล้วน** (`agent/`) ไม่มีโค้ด channel ในแอป — gateway เป็นเจ้าของทุก channel

---

## สแตกที่ใช้

| ส่วน | เทคโนโลยี |
|---|---|
| Framework | Next.js 14 (App Router, standalone output) |
| ภาษา | TypeScript |
| ฐานข้อมูล | PostgreSQL 16 + Prisma 5 |
| Auth | NextAuth v4 (parent: อีเมล+รหัสผ่าน, child: PIN 4 หลัก) |
| UI | Tailwind CSS (ธีม "Cozy" อบอุ่น mobile-first) |
| เทสต์ | Vitest (unit + integration) · Playwright (E2E) |
| Deploy | Docker + claude-gateway app store |

---

## ติดตั้งบน claude-gateway (getpod app)

แอปนี้ประกาศตัวเองด้วย [`app.yaml`](./app.yaml) — gateway จะ generate `docker-compose.yml`
ให้เองตอนติดตั้ง (ไฟล์นั้นจึงไม่ได้อยู่ใน repo)

**สิ่งที่ gateway จะสร้างให้ 3 service:** `app` (Next.js, พอร์ต 4000 ในคอนเทนเนอร์ → 3737 บนโฮสต์)
· `db` (postgres:16-alpine) · `agent` (habit-hero-bot)

### วิธีที่ 1 — ติดตั้งจาก GitHub

จากแชทของ agent ที่มี gateway MCP tools:

```
ติดตั้งแอปจาก https://github.com/0xMaxMa/app-habit-hero
```

หรือยิง API ตรง:

```bash
curl -s -X POST http://localhost:10850/api/v1/apps/install \
  -H "X-Api-Key: $GATEWAY_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "github_url": "https://github.com/0xMaxMa/app-habit-hero",
    "commit": "<40-char commit hash>",
    "env_vars": {
      "DB_PASSWORD":     "'"$(openssl rand -base64 24)"'",
      "NEXTAUTH_SECRET": "'"$(openssl rand -base64 32)"'",
      "AGENT_API_TOKEN": "'"$(openssl rand -base64 32)"'",
      "NEXTAUTH_URL":    "https://your-host.example.com"
    }
  }' | jq
```

### วิธีที่ 2 — ติดตั้งจากโฟลเดอร์บนเครื่อง

```bash
git clone https://github.com/0xMaxMa/app-habit-hero.git
cd app-habit-hero
cp tools/installs/.env.example tools/installs/.env   # ใส่ค่าให้ครบก่อน
make -C tools/installs install
```

`tools/installs/` มี `install` / `uninstall` / `stat` / `job` / `start` / `stop` / `logs` ครบ

> **การอัปเกรด:** ทุกครั้งที่คอนเทนเนอร์ `app` บูต จะรัน `prisma migrate deploy` ให้อัตโนมัติ
> (ดู `CMD` ใน [`Dockerfile`](./Dockerfile)) — migration ทุกตัวเขียนแบบ idempotent

---

## ตัวแปรสภาพแวดล้อม (env)

คัดลอกจาก [`.env.example`](./.env.example) แล้วเติมค่าจริง — **ห้าม commit `.env`**

| ตัวแปร | บังคับ | คำอธิบาย |
|---|---|---|
| `DB_PASSWORD` | ✅ | รหัสผ่าน Postgres (แหล่งความจริงเดียว — `DATABASE_URL` ฝังค่านี้) |
| `DATABASE_URL` | ✅ | connection string เต็ม (gateway ประกอบให้จาก `DB_PASSWORD`) |
| `NEXTAUTH_SECRET` | ✅ | คีย์เซ็น session — `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ✅ | URL สาธารณะของแอป (มีผลกับชื่อคุกกี้: `http` → `next-auth.session-token`, `https` → `__Secure-…`) |
| `AGENT_API_TOKEN` | ✅ | โทเคนที่ agent ส่งมาเป็นเฮดเดอร์ `x-agent-token` — ทุกคำขอจาก agent ที่ไม่มีตัวนี้ถูกปฏิเสธ |
| `PHOTO_DIR` | — | ที่เก็บรูปงาน+รูปโปรไฟล์ (ดีฟอลต์ `./data/photos`, ในคอนเทนเนอร์คือ `/data/photos` ที่ mount ไว้) |

> รูปทั้งหมดอยู่บน **volume ที่ mount ไว้** ไม่ใช่ในคอนเทนเนอร์ — build/reinstall ใหม่รูปไม่หาย

---

## ใช้งานครั้งแรก

1. เปิดแอป → หน้า `/login` จะเสนอ **"สร้างบัญชี"** ให้เฉพาะตอนที่ยังไม่มีผู้ปกครองในระบบ
2. กรอกอีเมล + รหัสผ่าน → สร้าง `Family` + ผู้ปกครองคนแรก (`POST /api/setup`)
   — เรียกซ้ำครั้งที่สองจะได้ `409` เสมอ ป้องกันการสร้างครอบครัวที่สอง
3. เข้าสู่ **onboarding**: ตั้งชื่อครอบครัว → เพิ่มลูก (พร้อม PIN 4 หลักต่อคน) → เลือกงานเริ่มต้น → เสร็จ
4. เชื่อมแชท: หน้า **ตั้งค่าครอบครัว** → สร้าง invite/link code แล้วให้สมาชิกส่งโค้ดนั้นให้ bot

---

## ข้อมูลตั้งต้น (init data)

repo นี้ **ไม่มีข้อมูลผู้ใช้จริงเลย** — ไม่มีครอบครัว ไม่มีสมาชิก ไม่มีประวัติส่งงาน XP หรือรูปภาพ
มีเฉพาะ "เนื้อหาตั้งต้น" 4 อย่างนี้เท่านั้น:

| ข้อมูล | อยู่ที่ไหน | เข้าฐานข้อมูลเมื่อไหร่ |
|---|---|---|
| 🏅 **เหรียญตรา** (28 แบบ) | `prisma/migrations/*_badges/` + `lib/badges.ts` | อัตโนมัติตอน `prisma migrate deploy` (ทุกครั้งที่บูต) |
| 📈 **เลเวล** (45 ขั้น / 9 ยศ / สูงสุด 200,000 XP) | `lib/level.ts` | ไม่มีตาราง — เป็นสูตรคำนวณในโค้ด |
| 🧹 **งานบ้านตั้งต้น** | `lib/starter-catalog.ts` → `STARTER_CHORES` | ตอนจบ onboarding (ผู้ปกครองเลือกเอง) |
| 🎁 **รางวัลตั้งต้น** | `lib/starter-catalog.ts` → `STARTER_REWARDS` | ตอนจบ onboarding (สร้างให้ทั้งชุด) |

งานบ้านและรางวัลผูกกับ `familyId` เสมอ จึงเป็น **catalog ในโค้ด** ไม่ใช่แถวใน migration —
เพราะตอน migrate ยังไม่มีครอบครัวให้ผูก แก้ไข/เพิ่ม/ลบรายการได้ที่ `lib/starter-catalog.ts`
ส่วนผู้ปกครองก็แก้ทุกอย่างในแอปได้หลังติดตั้ง

ถ้าติดตั้งไปแล้วและอยากเติม catalog เข้าครอบครัวที่มีอยู่ (idempotent — ข้ามรายการที่ชื่อซ้ำ):

```bash
npm run db:seed
```

---

## พัฒนาต่อบนเครื่อง

ต้องมี Node 20+ และ PostgreSQL (จะรันเองหรือใช้ Docker ก็ได้)

```bash
git clone https://github.com/0xMaxMa/app-habit-hero.git
cd app-habit-hero
npm ci

cp .env.example .env          # แก้ DATABASE_URL ให้ชี้ Postgres ของคุณ
npx prisma generate
npx prisma migrate deploy     # สร้างตาราง + seed เหรียญตรา

npm run dev                   # http://localhost:4000
```

ต้องการข้อมูลตัวอย่าง (ครอบครัว + เด็ก + ประวัติ) สำหรับ dev:

```bash
npm run db:seed:dev
```

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | dev server พอร์ต 4000 |
| `npm run build` / `npm start` | build production / รัน |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:seed` | เติม catalog งานบ้าน+รางวัลเข้าครอบครัวที่มีอยู่ |
| `npm run db:seed:dev` | ข้อมูลตัวอย่างสำหรับ dev |

---

## เทสต์

```bash
npm run test              # unit (Vitest, jsdom) — ไม่ต้องมี DB
npm run test:integration  # integration — ต้องมี Postgres จริง
npm run test:e2e          # E2E (Playwright)
npm run test:all          # unit + integration
```

integration/E2E อ่านค่าจาก `.env.test`:

```bash
cp .env.test.example .env.test
```

CI ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) inject env เองและยก Postgres
เป็น service ให้ — ครอบคลุม unit → integration → E2E

---

## โครงสร้างโปรเจกต์

```
app/
  (parent)/          หน้าเว็บฝั่งผู้ปกครอง — dashboard, approvals, chores, rewards, history, settings
  (child)/           หน้าเว็บฝั่งเด็ก — tasks, rewards, badges, history
  api/               REST API ที่ทั้งหน้าเว็บและ agent เรียกร่วมกัน
  setup/ onboarding/ login/ pin/
lib/
  api/               ตัวช่วยฝั่ง API — authz, validate, respond, gamification, photo
  badges.ts level.ts xp.ts streak.ts point-rules.ts clock.ts
  starter-catalog.ts งานบ้าน + รางวัลตั้งต้น
  onboarding.ts      step machine + การเขียนข้อมูลแบบ transaction
components/ui/       ดีไซน์ระบบ (Card, Button, XpBadge, ProgressBar, Avatar, …)
prisma/              schema, migrations, seed
agent/               AGENTS.md / SOUL.md / skills/*.md — ตัว agent เป็น markdown ล้วน
tools/installs/      สคริปต์ติดตั้ง/ถอนผ่าน gateway API
tests/               unit · integration · e2e
```

---

## ความปลอดภัย

- ทุก endpoint บังคับ **family scope** — ข้ามครอบครัวไม่ได้ และ role (parent/child) ตรวจที่ API ไม่ใช่ที่ UI
- รหัสผ่านและ PIN เก็บเป็น **bcrypt hash** เท่านั้น
- คำขอจาก agent ต้องมี `x-agent-token` ที่ตรงกับ `AGENT_API_TOKEN` มิฉะนั้นถูกปฏิเสธทั้งหมด
- รูปเสิร์ฟผ่าน `/api/photos/*` และ `/api/avatars/*` ที่ตรวจสิทธิ์ก่อนเสมอ — ไม่ได้เปิดเป็นไฟล์สาธารณะ
- ไฟล์ที่ **ไม่เคย** ขึ้น repo: `.env` ทุกตัว, `data/photos/` (รูปเด็กจริง), `postgres/` (ข้อมูล DB),
  `agent/.sessions/` — ดู [`.gitignore`](./.gitignore)

พบช่องโหว่? เปิด issue แบบ private หรือติดต่อเจ้าของ repo โดยตรง อย่าเปิดเป็น issue สาธารณะ
