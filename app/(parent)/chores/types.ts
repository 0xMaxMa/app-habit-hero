/**
 * app/(parent)/chores/types.ts — shared shapes for the chore CRUD UI (T10).
 */

export type Recurrence = 'daily' | 'weekly' | 'once'

/** Kind of work — mirrors the Prisma ChoreCategory enum. */
export type ChoreCategory =
  | 'cleaning'
  | 'reading'
  | 'cooking'
  | 'other'
  | 'exercise'
  | 'routine'
  | 'helping'

/** A chore as returned by GET/POST/PATCH /api/chores. */
export type Chore = {
  id: string
  title: string
  description: string | null
  familyId: string
  assignedTo: string | null
  xpValue: number
  lateXpMultiplier: number
  recurrence: Recurrence
  category: ChoreCategory
  /** Weekday subset (0=Sun … 6=Sat) for weekly chores; empty = every day. */
  recurDays: number[]
  dueTime: string | null
  activeFrom: string | null
  activeUntil: string | null
  requirePhoto: boolean
  isExtra: boolean
  createdAt: string
  updatedAt: string
}

/** Payload sent to POST/PATCH /api/chores (client-validated). */
export type ChoreInput = {
  title: string
  assignedTo: string | null
  xpValue: number
  recurrence: Recurrence
  category: ChoreCategory
  recurDays: number[]
  dueTime: string | null
  lateXpMultiplier: number
  requirePhoto: boolean
  isExtra: boolean
}

/** A child option for the assignee picker (from /api/progress?scope=weekly). */
export type ChildOption = { userId: string; name: string }

/** Display metadata for each chore category (drawer chips + chore-row tag). */
export const CATEGORY_META: Record<ChoreCategory, { emoji: string; label: string }> = {
  cleaning: { emoji: '🧹', label: 'ทำความสะอาด' },
  reading: { emoji: '📚', label: 'การเรียน' },
  cooking: { emoji: '🍳', label: 'ทำอาหาร' },
  other: { emoji: '🧸', label: 'อื่นๆ' },
  exercise: { emoji: '🏃', label: 'ออกกำลังกาย' },
  routine: { emoji: '☀️', label: 'กิจวัตร' },
  helping: { emoji: '🤝', label: 'ช่วยเหลือ' },
}

/** Category chip order for the create-chore drawer. */
export const CATEGORY_ORDER: ChoreCategory[] = [
  'other',
  'cleaning',
  'reading',
  'cooking',
  'exercise',
  'routine',
  'helping',
]

/** Weekday labels for the recurrence day picker, index 0=Sun … 6=Sat. */
export const WEEKDAY_LABELS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const
