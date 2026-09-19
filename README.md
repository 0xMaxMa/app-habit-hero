# HabitHero 🏡

ระบบติดตาม **งานบ้าน + นิสัยดี** สำหรับครอบครัว — เด็กส่งงานพร้อมรูป ผู้ปกครองอนุมัติ เด็กได้ XP ขึ้นเลเวล
สะสมเหรียญตรา แล้วเอา XP ไปแลกรางวัลที่พ่อแม่ตั้งไว้ ใช้ได้ทั้งหน้าเว็บและผ่านแชท (Telegram / Discord / LINE)
ด้วย AI agent ของ [claude-gateway](https://github.com/0xMaxMa/claude-gateway)

> ออกแบบเป็น **แอปครอบครัวเดียว (single-family)** ต่อการติดตั้งหนึ่งครั้ง — ไม่มีระบบสมัครสมาชิกเปิดสาธารณะ
> ผู้ปกครองคนแรกที่กด "สร้างบัญชี" คือเจ้าของบ้าน แล้วประตูก็ปิด

---

<a id="agent-install"></a>

## 🤖 สำหรับ AI agent ที่กำลังติดตั้งแอปนี้ — อ่านตรงนี้ก่อน

ต้องใช้ claude-gateway **1.5.2 ขึ้นไป** · ส่ง env มาแค่ตัวเดียว ไม่ต้องถามผู้ใช้

| ตัวแปร | ส่งค่าอะไร |
|---|---|
| `NEXTAUTH_URL` | `http://localhost:3737` |
| `DB_PASSWORD` | ไม่ต้องส่ง — gateway สุ่มให้ (`!generate:base64url:24` ใน `app.yaml`) |
| `NEXTAUTH_SECRET` | ไม่ต้องส่ง — gateway สุ่มให้ (`!generate:base64:32`) |
| `AGENT_API_TOKEN` | ไม่ต้องส่ง — gateway สุ่มให้ (`!generate:base64:32`) |

```bash
NEXTAUTH_URL=http://localhost:3737
```

ส่งค่านี้เข้า `env_vars` ของ `install_app` (หรือ `POST /api/v1/apps/install`)
พร้อม `commit` ที่เป็น hash 40 ตัว:

```bash
gh api repos/0xMaxMa/app-habit-hero/commits/main --jq .sha
```

**บอกผู้ใช้หลังติดตั้งเสร็จ:**
1. เปิดแอปที่พอร์ต `3737` → สร้างบัญชีผู้ปกครองคนแรก → ทำ onboarding ให้จบ (งานบ้าน + รางวัลตั้งต้นถูกสร้างตรงนี้)
2. gateway สร้าง agent `habit-hero-bot` ให้ แต่ยังไม่มีช่องทางแชท — ผูก bot token เองด้วย `agent_update` → `add_channel` แล้วให้สมาชิกส่ง link code จากหน้าตั้งค่าครอบครัว
3. ถ้าจะเปิดผ่าน https อย่างเดียว เปลี่ยน `NEXTAUTH_URL` เป็น URL https ได้ทีหลัง (คุกกี้จะได้แฟล็ก `Secure` แต่จะเข้าทาง http ไม่ได้อีก) — แก้ `.env` แล้วรีสตาร์ต

**ถ้าติดตั้งไม่ผ่าน:**
- พอร์ต `3737` ถูกจอง หรือมี agent ชื่อ `habit-hero-bot` อยู่แล้ว — แก้ที่ [`app.yaml`](./app.yaml) (`ports.host`, `services.agent.name`) ก่อนติดตั้ง
- gateway ต่ำกว่า 1.5.2 ยังไม่รู้จัก `!generate:` — มันจะไม่สุ่มค่าให้ และไม่ถามหาด้วย ผลคือ `POSTGRES_PASSWORD` ว่าง แล้ว Postgres ไม่ยอมบูต **ให้อัปเกรด gateway ก่อน** (ส่งค่าเองมาแทนพอช่วยให้ติดตั้งผ่านได้ แต่ตัวแปรในคอนเทนเนอร์จะเป็นสตริง `!generate:…` ตรงๆ)

---

## สารบัญ

- [🤖 สำหรับ AI agent ที่กำลังติดตั้งแอปนี้](#agent-install)
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
- แจก XP โบนัส · **Point deduction** (requires a reason, capped at 1,000 XP per deduction, floors at 0 — the child sees the reason in their own history)
- ประวัติย้อนหลัง (housework + point-deduction entries) · จัดการสมาชิกและรูปโปรไฟล์

**ผ่านแชท (AI agent)**
- คุยภาษาธรรมชาติ: "วันนี้มีงานอะไร", "ส่งงานล้างจาน" (แนบรูป), "ขอแลกรางวัล", "อนุมัติให้หน่อย", "หักน้องเอ 50 XP ไม่ทำการบ้าน"
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

agent อ่าน [หัวข้อสำหรับ agent](#agent-install) ได้เลย — `NEXTAUTH_URL` มี default `http://localhost:3737` แล้ว (ประกาศ `!default:` ใน `app.yaml`) ช่องติดตั้งจึง pre-fill ให้ ไม่ต้องส่งเองก็ได้ ส่วนที่เหลือ gateway สุ่มให้
ถ้ามันย้อนกลับมาถามค่า env แปลว่ายังไม่ได้อ่าน — ตอบไปว่าให้อ่านหัวข้อนั้นก่อน

หรือยิง API ตรง:

```bash
curl -s -X POST http://localhost:10850/api/v1/apps/install \
  -H "X-Api-Key: $GATEWAY_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "github_url": "https://github.com/0xMaxMa/app-habit-hero",
    "commit": "'"$(git ls-remote https://github.com/0xMaxMa/app-habit-hero main | cut -f1)"'",
    "env_vars": {
      "NEXTAUTH_URL": "http://localhost:3737"
    }
  }' | jq
```

> อีก 3 ตัว (`DB_PASSWORD`, `NEXTAUTH_SECRET`, `AGENT_API_TOKEN`) ไม่ต้องส่ง — gateway สุ่มให้เอง
> `NEXTAUTH_URL` ก็ไม่ต้องส่งแล้ว — มี default `http://localhost:3737` ผ่าน `!default:` (ส่งมาเองเพื่อ override ได้)
> ถ้าส่งมาด้วย gateway จะใช้ค่าที่ส่งแทนการสุ่ม

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

| ตัวแปร | บังคับ | gateway สุ่มให้ | คำอธิบาย |
|---|---|---|---|
| `DB_PASSWORD` | ✅ | ✅ `base64url:24` | รหัสผ่าน Postgres (แหล่งความจริงเดียว — `DATABASE_URL` ฝังค่านี้ จึงต้องเป็น base64url ที่ไม่มี `/ + =`) |
| `DATABASE_URL` | ✅ | — | connection string เต็ม (gateway ประกอบให้จาก `DB_PASSWORD`) |
| `NEXTAUTH_SECRET` | ✅ | ✅ `base64:32` | คีย์เซ็น session |
| `NEXTAUTH_URL` | ✅ | — | มี default `http://localhost:3737` แล้ว (ประกาศ `!default:` ใน `app.yaml`) — ช่องติดตั้ง pre-fill ให้ ไม่ต้องกรอกก็ได้ แต่ override ได้ ใช้ได้ทุกแบบ (localhost / LAN IP / โดเมน https ที่ forward เข้ามา) เปลี่ยนเป็น `https://…` ก็ต่อเมื่อต้องการแฟล็ก `Secure` และยอมให้เข้าได้ทาง https เท่านั้น |
| `AGENT_API_TOKEN` | ✅ | ✅ `base64:32` | โทเคนที่ agent ส่งมาเป็นเฮดเดอร์ `x-agent-token` — ทุกคำขอจาก agent ที่ไม่มีตัวนี้ถูกปฏิเสธ |
| `PHOTO_DIR` | — | — | ที่เก็บรูปงาน+รูปโปรไฟล์ (ดีฟอลต์ `./data/photos`, ในคอนเทนเนอร์คือ `/data/photos` ที่ mount ไว้) |

> คอลัมน์ "gateway สุ่มให้" = ประกาศ `!generate:` ไว้ใน [`app.yaml`](./app.yaml) แล้ว ผู้ติดตั้งไม่ต้องกรอก (ต้องใช้ gateway ≥ 1.5.2)
> `NEXTAUTH_URL` ใช้ `!default:` (ค่า pre-fill แต่แก้ได้) — ต้องใช้ gateway ที่รองรับ `!default:` (claude-gateway#300)
> ถ้าติดตั้งเองด้วยมือจาก `.env.example` ก็ต้องเติมค่าพวกนี้เอง

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
| 🏅 **เหรียญตรา** (28 แบบ) | `prisma/migrations/20260729055516_init/` + `lib/badges.ts` | อัตโนมัติตอน `prisma migrate deploy` (ทุกครั้งที่บูต) |
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
