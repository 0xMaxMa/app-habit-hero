/**
 * lib/starter-catalog.ts — the content a fresh HabitHero install ships with.
 *
 * A new install must arrive with something to *do*, not an empty app. Four
 * kinds of starter content exist, and only two of them live here:
 *
 *   badges  → global (no familyId) → seeded by SQL migrations under
 *             prisma/migrations, mirroring lib/badges.ts
 *   levels  → no table at all; a pure formula in lib/level.ts
 *   chores  → family-scoped ─┐
 *   rewards → family-scoped ─┴─ THIS FILE
 *
 * Chores and rewards both carry a required `familyId`, so they cannot be rows
 * in a migration — at migrate time no family exists yet. They are therefore a
 * catalogue in code, written into the DB when onboarding provisions the family
 * (lib/onboarding.ts) or by `npm run db:seed` for a family that already exists.
 *
 * Everything here is a STARTING POINT: parents edit, add and delete all of it
 * from the app afterwards. Tune the lists to your household by editing this
 * file before installing.
 *
 * Pure data + types only — no Prisma client, no React.
 */

import type { ChoreCategory, Recurrence } from '@prisma/client'

// ---------------------------------------------------------------------------
// Chores
// ---------------------------------------------------------------------------

export interface StarterChore {
  /** Stable identifier used by the onboarding wizard's checkboxes. */
  key: string
  /** Display-only; the Chore model has no emoji column. */
  emoji: string
  title: string
  description: string
  xpValue: number
  recurrence: Recurrence
  category: ChoreCategory
  /** Ask the child to attach a photo as proof. */
  requirePhoto: boolean
  /** Bonus/optional work rather than an everyday duty. */
  isExtra: boolean
  /** Time-of-day marker, "HH:MM". Past it the late multiplier applies. */
  dueTime?: string
  /** Weekly recurrence only: 0=Sun … 6=Sat. Empty/omitted = every day. */
  recurDays?: number[]
  /** XP multiplier when submitted after `dueTime`. Defaults to 1 (no penalty). */
  lateXpMultiplier?: number
}

/**
 * Curated starter chores, grouped by category. XP values are deliberately small
 * so the reward prices below stay meaningful — a daily routine is worth 5–20 XP,
 * a real piece of work 20–50.
 */
export const STARTER_CHORES: readonly StarterChore[] = [
  // --- cleaning ---
  {
    key: 'tidy_toys',
    emoji: '🧸',
    title: 'เก็บของเล่น',
    description: 'เก็บของเล่นเข้าที่ให้เรียบร้อยก่อนนอน',
    xpValue: 5,
    recurrence: 'daily',
    category: 'cleaning',
    requirePhoto: true,
    isExtra: false,
  },
  {
    key: 'clean_house',
    emoji: '🧹',
    title: 'ทำความสะอาดบ้าน',
    description: 'กวาด ถู หรือเช็ดฝุ่นในส่วนที่ได้รับมอบหมาย',
    xpValue: 10,
    recurrence: 'daily',
    category: 'cleaning',
    requirePhoto: true,
    isExtra: false,
  },
  {
    key: 'dishes',
    emoji: '🍽️',
    title: 'ล้างจาน',
    description: 'ล้างจานหลังมื้ออาหารให้สะอาด',
    xpValue: 10,
    recurrence: 'daily',
    category: 'cleaning',
    requirePhoto: false,
    isExtra: false,
  },
  {
    key: 'laundry',
    emoji: '👕',
    title: 'ซักผ้า',
    description: 'ช่วยซัก ตาก หรือพับเสื้อผ้า',
    xpValue: 20,
    recurrence: 'daily',
    category: 'cleaning',
    requirePhoto: true,
    isExtra: true,
  },
  {
    key: 'wash_car',
    emoji: '🚗',
    title: 'ล้างรถ',
    description: 'ช่วยล้างรถในวันหยุด',
    xpValue: 30,
    recurrence: 'weekly',
    category: 'cleaning',
    requirePhoto: true,
    isExtra: true,
    recurDays: [0, 6],
  },

  // --- reading / study ---
  {
    key: 'homework',
    emoji: '📝',
    title: 'ทำการบ้าน',
    description: 'ทำการบ้านให้เสร็จก่อนเวลาที่ตกลงกันไว้',
    xpValue: 10,
    recurrence: 'daily',
    category: 'reading',
    requirePhoto: true,
    isExtra: false,
    dueTime: '20:30',
    lateXpMultiplier: 0.6,
  },
  {
    key: 'read_15',
    emoji: '📚',
    title: 'อ่านหนังสือ 15 นาที',
    description: 'อ่านหนังสือที่ชอบวันละ 15 นาที',
    xpValue: 20,
    recurrence: 'daily',
    category: 'reading',
    requirePhoto: true,
    isExtra: false,
    dueTime: '21:00',
  },
  {
    key: 'vocab',
    emoji: '🔤',
    title: 'ท่องคำศัพท์',
    description: 'ท่องคำศัพท์ใหม่ประจำสัปดาห์',
    xpValue: 30,
    recurrence: 'weekly',
    category: 'reading',
    requirePhoto: true,
    isExtra: false,
  },

  // --- cooking / eating ---
  {
    key: 'cook',
    emoji: '🍳',
    title: 'ทำอาหาร',
    description: 'ช่วยเตรียมหรือทำอาหารหนึ่งมื้อ',
    xpValue: 20,
    recurrence: 'daily',
    category: 'cooking',
    requirePhoto: true,
    isExtra: true,
  },
  {
    key: 'eat_veggies',
    emoji: '🥦',
    title: 'กินผัก',
    description: 'กินผักให้หมดจาน',
    xpValue: 20,
    recurrence: 'daily',
    category: 'cooking',
    requirePhoto: true,
    isExtra: true,
  },

  // --- routine ---
  {
    key: 'make_bed',
    emoji: '🛏️',
    title: 'เก็บที่นอน',
    description: 'เก็บที่นอนให้เรียบร้อยหลังตื่นนอน',
    xpValue: 5,
    recurrence: 'daily',
    category: 'routine',
    requirePhoto: true,
    isExtra: false,
    dueTime: '08:00',
    lateXpMultiplier: 0.6,
  },
  {
    key: 'wake_early',
    emoji: '⏰',
    title: 'ตื่นเช้า',
    description: 'ตื่นตรงเวลาในวันเรียน ไม่ต้องปลุกซ้ำ',
    xpValue: 10,
    recurrence: 'weekly',
    category: 'routine',
    requirePhoto: false,
    isExtra: false,
    dueTime: '06:30',
    recurDays: [1, 2, 3, 4, 5],
    lateXpMultiplier: 0.6,
  },
  {
    key: 'ready_for_school',
    emoji: '🎒',
    title: 'พร้อมไปโรงเรียน (อาบน้ำ+กินข้าว)',
    description: 'อาบน้ำ แต่งตัว กินข้าว และเก็บกระเป๋าให้พร้อมตรงเวลา',
    xpValue: 15,
    recurrence: 'weekly',
    category: 'routine',
    requirePhoto: true,
    isExtra: false,
    dueTime: '07:00',
    recurDays: [1, 2, 3, 4, 5],
    lateXpMultiplier: 0.6,
  },
  {
    key: 'wash_bottle',
    emoji: '🍶',
    title: 'ล้างขวดน้ำ',
    description: 'ล้างขวดน้ำของตัวเองหลังกลับจากโรงเรียน',
    xpValue: 5,
    recurrence: 'weekly',
    category: 'routine',
    requirePhoto: true,
    isExtra: false,
    recurDays: [1, 2, 3, 4, 5],
  },
  {
    key: 'bedtime',
    emoji: '🌙',
    title: 'เข้านอนตรงเวลา',
    description: 'เข้านอนตามเวลาที่ตกลงกันไว้',
    xpValue: 5,
    recurrence: 'daily',
    category: 'routine',
    requirePhoto: false,
    isExtra: false,
    dueTime: '21:30',
    lateXpMultiplier: 0.6,
  },
  {
    key: 'brush_teeth',
    emoji: '🦷',
    title: 'แปรงฟันก่อนนอน',
    description: 'แปรงฟันให้สะอาดก่อนเข้านอน',
    xpValue: 5,
    recurrence: 'daily',
    category: 'routine',
    requirePhoto: false,
    isExtra: false,
    dueTime: '21:00',
  },

  // --- exercise ---
  {
    key: 'exercise',
    emoji: '🏃',
    title: 'ออกกำลังกาย 30 นาที',
    description: 'วิ่ง เดิน ปั่นจักรยาน หรือเล่นกีฬา 30 นาที',
    xpValue: 50,
    recurrence: 'weekly',
    category: 'exercise',
    requirePhoto: true,
    isExtra: true,
    recurDays: [0, 6],
  },

  // --- helping ---
  {
    key: 'care_sibling',
    emoji: '🤝',
    title: 'ดูแลน้อง',
    description: 'ช่วยดูแลน้องหรือเล่นกับน้องอย่างใจเย็น',
    xpValue: 10,
    recurrence: 'daily',
    category: 'helping',
    requirePhoto: true,
    isExtra: true,
  },
  {
    key: 'help_homework',
    emoji: '✏️',
    title: 'ช่วยสอนการบ้านน้อง',
    description: 'ช่วยน้องทำการบ้านหรืออ่านหนังสือด้วยกัน',
    xpValue: 5,
    recurrence: 'daily',
    category: 'helping',
    requirePhoto: false,
    isExtra: true,
  },
  {
    key: 'behave_all_day',
    emoji: '😇',
    title: 'ไม่ซนทั้งวัน',
    description: 'ทั้งวันไม่ทะเลาะ ไม่งอแง ฟังเหตุผล',
    xpValue: 10,
    recurrence: 'daily',
    category: 'helping',
    requirePhoto: false,
    isExtra: true,
  },

  // --- other ---
  {
    key: 'feed_pet',
    emoji: '🐕',
    title: 'ให้อาหารสัตว์เลี้ยง',
    description: 'ให้อาหารและเปลี่ยนน้ำให้สัตว์เลี้ยง',
    xpValue: 10,
    recurrence: 'daily',
    category: 'other',
    requirePhoto: true,
    isExtra: false,
  },
  {
    key: 'trash',
    emoji: '🗑️',
    title: 'ทิ้งขยะ',
    description: 'รวบรวมขยะไปทิ้งให้เรียบร้อย',
    xpValue: 10,
    recurrence: 'daily',
    category: 'other',
    requirePhoto: true,
    isExtra: false,
  },
  {
    key: 'eat_properly',
    emoji: '🍚',
    title: 'ตั้งใจกินข้าว',
    description: 'กินข้าวให้หมดจานโดยไม่เล่นระหว่างกิน',
    xpValue: 5,
    recurrence: 'daily',
    category: 'other',
    requirePhoto: false,
    isExtra: false,
  },
  {
    key: 'drink_milk',
    emoji: '🥛',
    title: 'กินนม',
    description: 'ดื่มนมให้ครบตามที่ตกลงกันไว้',
    xpValue: 5,
    recurrence: 'daily',
    category: 'other',
    requirePhoto: false,
    isExtra: false,
  },
  {
    key: 'creative',
    emoji: '🎨',
    title: 'ทำอะไรก็ได้ที่สร้างสรรค์',
    description: 'วาดรูป ประดิษฐ์ เล่นดนตรี หรือสร้างอะไรใหม่ๆ',
    xpValue: 5,
    recurrence: 'daily',
    category: 'other',
    requirePhoto: true,
    isExtra: true,
  },
  {
    key: 'save_money',
    emoji: '🐷',
    title: 'ออมเงินค่าขนมรายสัปดาห์',
    description: 'หยอดกระปุกจากค่าขนมที่เหลือ',
    xpValue: 20,
    recurrence: 'weekly',
    category: 'other',
    requirePhoto: true,
    isExtra: true,
    recurDays: [0, 5, 6],
  },
] as const

const STARTER_CHORE_KEYS = new Set(STARTER_CHORES.map((c) => c.key))

/** True when `key` names a chore in the catalogue. */
export function isStarterChoreKey(key: string): boolean {
  return STARTER_CHORE_KEYS.has(key)
}

/** Look up a starter chore template by key (undefined if unknown). */
export function starterChoreByKey(key: string): StarterChore | undefined {
  return STARTER_CHORES.find((c) => c.key === key)
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export interface StarterReward {
  /** Stable identifier (not persisted — `title` is the DB-side identity). */
  key: string
  title: string
  description?: string
  xpCost: number
  iconEmoji: string
  /** Max redemptions per calendar day / week / month. Omit for unlimited. */
  dailyLimit?: number
  weeklyLimit?: number
  monthlyLimit?: number
}

/**
 * Curated starter rewards, cheapest first — a ladder from "today" treats a kid
 * can reach in a day or two, up to a family-sized goal worth saving months for.
 * Prices assume the chore XP above (roughly 60–120 XP earnable per day).
 */
export const STARTER_REWARDS: readonly StarterReward[] = [
  {
    key: 'swim',
    title: 'เล่นน้ำสระว่ายน้ำ',
    xpCost: 30,
    iconEmoji: '🏊',
  },
  {
    key: 'pocket_money',
    title: 'ค่าขนมพิเศษ 20 บาท',
    xpCost: 40,
    iconEmoji: '🍬',
  },
  {
    key: 'streaming_1h',
    title: 'ดูหนัง/ซีรีส์ที่บ้าน 1 ชม.',
    xpCost: 50,
    iconEmoji: '📺',
    dailyLimit: 2,
  },
  {
    key: 'youtube_1h',
    title: 'ดู YouTube บนทีวี 1 ชม.',
    xpCost: 100,
    iconEmoji: '📱',
    dailyLimit: 2,
  },
  {
    key: 'fastfood',
    title: 'ฟาสต์ฟู้ดที่เลือกเอง 1 มื้อ',
    xpCost: 100,
    iconEmoji: '🍟',
    weeklyLimit: 1,
  },
  {
    key: 'pizza',
    title: 'พิซซ่า 1 มื้อ',
    xpCost: 100,
    iconEmoji: '🍕',
    weeklyLimit: 1,
  },
  {
    key: 'game_1h',
    title: 'เล่นเกม 1 ชม.',
    xpCost: 150,
    iconEmoji: '🎮',
  },
  {
    key: 'friend_playdate',
    title: 'ไปเล่นกับเพื่อน 1 ครั้ง',
    xpCost: 200,
    iconEmoji: '🚗',
  },
  {
    key: 'board_game_cafe',
    title: 'ไปเล่นร้านบอร์ดเกม',
    xpCost: 200,
    iconEmoji: '🎲',
  },
  {
    key: 'shabu',
    title: 'บุฟเฟต์ชาบู',
    xpCost: 200,
    iconEmoji: '♨️',
    weeklyLimit: 1,
  },
  {
    key: 'theme_park',
    title: 'ไปสวนสนุก',
    xpCost: 200,
    iconEmoji: '🎪',
  },
  {
    key: 'online_shopping',
    title: 'เลือกซื้อของออนไลน์ งบ 200 บาท',
    xpCost: 400,
    iconEmoji: '🛒',
    monthlyLimit: 1,
  },
  {
    key: 'cinema',
    title: 'ดูหนังที่โรงหนัง',
    xpCost: 400,
    iconEmoji: '🎬',
    monthlyLimit: 1,
  },
  {
    key: 'sushi',
    title: 'บุฟเฟต์ซูชิ',
    xpCost: 1000,
    iconEmoji: '🍣',
    monthlyLimit: 1,
  },
  {
    key: 'big_gift',
    title: 'ของขวัญชิ้นใหญ่ที่อยากได้',
    description: 'ของชิ้นใหญ่ที่ตั้งใจเก็บมานาน — ตกลงงบกับพ่อแม่ก่อน',
    xpCost: 14000,
    iconEmoji: '🎉',
  },
  {
    key: 'family_trip',
    title: 'ทริปเที่ยวต่างประเทศกับครอบครัว',
    description: 'เป้าหมายใหญ่สุดของบ้าน — สะสมกันทั้งปี',
    xpCost: 50000,
    iconEmoji: '✈️',
  },
] as const

const STARTER_REWARD_KEYS = new Set(STARTER_REWARDS.map((r) => r.key))

/** True when `key` names a reward in the catalogue. */
export function isStarterRewardKey(key: string): boolean {
  return STARTER_REWARD_KEYS.has(key)
}

/** Look up a starter reward template by key (undefined if unknown). */
export function starterRewardByKey(key: string): StarterReward | undefined {
  return STARTER_REWARDS.find((r) => r.key === key)
}
