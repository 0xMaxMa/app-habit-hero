import * as React from 'react'
import {
  PageShell,
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
  Button,
  XpBadge,
  ProgressBar,
  Avatar,
  StreakFlame,
  BadgeChip,
  StatusChip,
} from '@/components/ui'

export const metadata = {
  title: 'Kitchen Sink · HabitHero Cozy',
  description: 'Visual reference for every HabitHero Cozy UI component.',
}

function Section({
  title,
  desc,
  children,
}: {
  title: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <div className="mb-3">
        <h2 className="text-xl font-extrabold text-ink-900">{title}</h2>
        {desc && <p className="text-sm font-semibold text-ink-600">{desc}</p>}
      </div>
      {children}
    </section>
  )
}

const swatches: { name: string; cls: string; text?: string }[] = [
  { name: 'cream-50', cls: 'bg-cream-50 border border-cream-600' },
  { name: 'cream-200', cls: 'bg-cream-200 border border-cream-600' },
  { name: 'cream-500', cls: 'bg-cream-500' },
  { name: 'ink-900', cls: 'bg-ink-900', text: 'text-white' },
  { name: 'ink-600', cls: 'bg-ink-600', text: 'text-white' },
  { name: 'primary-600', cls: 'bg-primary-600', text: 'text-white' },
  { name: 'primary-700', cls: 'bg-primary-700', text: 'text-white' },
  { name: 'xp-500', cls: 'bg-xp-500', text: 'text-white' },
  { name: 'success-500', cls: 'bg-success-500', text: 'text-white' },
  { name: 'danger-500', cls: 'bg-danger-500', text: 'text-white' },
]

export default function KitchenSinkPage() {
  return (
    <PageShell
      containerSize="lg"
      header={
        <>
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-600 text-lg text-white shadow-[0_3px_0_#27619B]">
            🦸
          </div>
          <div className="leading-tight">
            <div className="text-base font-extrabold text-ink-900">HabitHero</div>
            <div className="text-xs font-semibold text-ink-600">Cozy · Kitchen Sink</div>
          </div>
          <div className="ml-auto">
            <XpBadge value={1240} />
          </div>
        </>
      }
    >
      <p className="mb-8 max-w-xl text-sm font-semibold text-ink-600">
        แผงรวม component ทั้งหมดของดีไซน์ &quot;Cozy&quot; — โทนกระดาษอุ่น การ์ดมน
        ปุ่มใหญ่กดสนุก สำหรับทั้งเด็กและผู้ปกครอง
      </p>

      {/* Colors ------------------------------------------------------- */}
      <Section title="Color tokens" desc="warm cream · brown ink · blue primary · amber XP">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {swatches.map((s) => (
            <div
              key={s.name}
              className={`flex h-16 items-end rounded-lg p-2 text-xs font-bold ${s.cls} ${s.text ?? 'text-ink-900'}`}
            >
              {s.name}
            </div>
          ))}
        </div>
      </Section>

      {/* Buttons ------------------------------------------------------ */}
      <Section title="Button" desc="chunky tactile pills — variants, sizes, and the extra-large kid size">
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button variant="primary">อนุมัติ</Button>
            <Button variant="secondary">ภายหลัง</Button>
            <Button variant="success" leftIcon="✅">
              เสร็จแล้ว
            </Button>
            <Button variant="danger" leftIcon="✕">
              ปฏิเสธ
            </Button>
            <Button variant="ghost">ยกเลิก</Button>
            <Button variant="primary" disabled>
              ปิดใช้งาน
            </Button>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="kid" variant="primary" leftIcon="📸">
              ส่งงาน!
            </Button>
            <Button size="kid" variant="success" leftIcon="🎉">
              แลกรางวัล
            </Button>
          </div>
          <div className="mt-4">
            <Button fullWidth size="lg" variant="primary">
              ปุ่มเต็มความกว้าง
            </Button>
          </div>
        </Card>
      </Section>

      {/* Cards -------------------------------------------------------- */}
      <Section title="Card" desc="raised · plain · sunk · interactive">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card variant="raised">
            <CardTitle>Raised</CardTitle>
            <CardSubtitle>การ์ดหลัก มีเงานุ่ม</CardSubtitle>
          </Card>
          <Card variant="plain">
            <CardTitle>Plain</CardTitle>
            <CardSubtitle>ไม่มีเงา</CardSubtitle>
          </Card>
          <Card variant="sunk">
            <CardTitle>Sunk</CardTitle>
            <CardSubtitle>พื้นจม</CardSubtitle>
          </Card>
          <Card interactive>
            <CardTitle>Interactive</CardTitle>
            <CardSubtitle>ยกตัวตอน hover</CardSubtitle>
          </Card>
        </div>
      </Section>

      {/* XP + Progress ----------------------------------------------- */}
      <Section title="XpBadge & ProgressBar">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>XP badges</CardTitle>
            </CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <XpBadge value={40} size="sm" />
              <XpBadge value={185} />
              <XpBadge value={1240} size="lg" />
              <XpBadge value={40} showSign tone="xp" />
              <XpBadge value={-12} tone="penalty" />
              <XpBadge value={0} tone="muted" />
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <div className="space-y-4">
              <ProgressBar
                value={340}
                max={500}
                tone="xp"
                label={
                  <>
                    <span>Level 7</span>
                    <span className="text-ink-500">อีก 160 XP ถึง Level 8</span>
                  </>
                }
              />
              <ProgressBar value={3} max={4} tone="primary" label={<span>งานวันนี้ 3/4</span>} />
              <ProgressBar value={100} max={100} tone="success" size="lg" label={<span>ครบแล้ว!</span>} />
            </div>
          </Card>
        </div>
      </Section>

      {/* Avatars ------------------------------------------------------ */}
      <Section title="Avatar" desc="illustrated panda / fox (inline SVG) และแบบตัวย่อ พร้อมวงแหวนเลเวล">
        <Card>
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex flex-col items-center gap-2">
              <Avatar character="panda" name="มิ้นท์" size="xl" ring="primary" />
              <span className="text-sm font-bold text-ink-700">Panda</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Avatar character="fox" name="น้องปอ" size="xl" ring="xp" />
              <span className="text-sm font-bold text-ink-700">Fox</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Avatar character="initials" name="คุณแม่" size="xl" ring="success" />
              <span className="text-sm font-bold text-ink-700">Initials</span>
            </div>
            <div className="flex items-end gap-2">
              <Avatar character="panda" size="sm" />
              <Avatar character="fox" size="md" />
              <Avatar character="panda" size="lg" />
            </div>
          </div>
        </Card>
      </Section>

      {/* Streak + Status --------------------------------------------- */}
      <Section title="StreakFlame & StatusChip">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Streak</CardTitle>
              <CardSubtitle>เรืองแสงเมื่อ ≥ 7 วัน</CardSubtitle>
            </CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <StreakFlame days={3} size="sm" />
              <StreakFlame days={8} />
              <StreakFlame days={30} size="lg" />
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Status chips</CardTitle>
            </CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status="done" />
              <StatusChip status="pending" />
              <StatusChip status="late" />
              <StatusChip status="rejected" />
            </div>
          </Card>
        </div>
      </Section>

      {/* Badges ------------------------------------------------------- */}
      <Section title="BadgeChip" desc="เหรียญตรารูปหกเหลี่ยม — earned / locked / rarity">
        <Card>
          <div className="flex flex-wrap gap-5">
            <BadgeChip icon="🧹" label="นักรบความสะอาด" rarity="common" hint="ปลดล็อกแล้ว" />
            <BadgeChip icon="📚" label="หนอนหนังสือ" rarity="rare" />
            <BadgeChip icon="🌅" label="ตื่นเช้า" rarity="epic" hint="14 วัน" />
            <BadgeChip icon="🔒" label="ยังไม่ได้" rarity="common" earned={false} />
            <BadgeChip icon="🏆" label="แชมป์เดือน" rarity="epic" earned={false} />
          </div>
        </Card>
      </Section>

      {/* Composed example -------------------------------------------- */}
      <Section title="Composed: Family Overview card" desc="component ทั้งหมดทำงานร่วมกัน">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <div className="flex items-center gap-3">
              <Avatar character="panda" name="มิ้นท์" size="lg" ring="primary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <CardTitle className="truncate">มิ้นท์</CardTitle>
                  <StreakFlame days={12} size="sm" />
                </div>
                <CardSubtitle>Level 7 — Skilled Hero</CardSubtitle>
              </div>
              <XpBadge value={340} />
            </div>
            <div className="mt-4">
              <ProgressBar value={340} max={500} tone="xp" label={<span>อีก 160 XP ถึง Level 8</span>} />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <StatusChip status="done" />
              <StatusChip status="pending" />
              <span className="ml-auto text-sm font-bold text-ink-600">งานวันนี้ 3/4</span>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <Avatar character="fox" name="น้องปอ" size="lg" ring="xp" />
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate">น้องปอ</CardTitle>
                <CardSubtitle>Level 4 — Rising Hero</CardSubtitle>
              </div>
              <XpBadge value={95} />
            </div>
            <div className="mt-4">
              <ProgressBar value={95} max={250} tone="primary" label={<span>อีก 155 XP ถึง Level 5</span>} />
            </div>
            <div className="mt-4 flex gap-3">
              <Button size="sm" variant="primary" leftIcon="✅">
                อนุมัติงาน
              </Button>
              <Button size="sm" variant="secondary">
                ดูรายละเอียด
              </Button>
            </div>
          </Card>
        </div>
      </Section>
    </PageShell>
  )
}
