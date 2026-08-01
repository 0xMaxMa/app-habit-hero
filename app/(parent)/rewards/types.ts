/**
 * app/(parent)/rewards/types.ts — the reward shape as it comes back from the
 * JSON API (dates serialized to strings). Shared by the catalog page and the
 * create/edit form.
 */

export type Reward = {
  id: string
  title: string
  description: string | null
  xpCost: number
  iconEmoji: string | null
  dailyLimit: number | null
  weeklyLimit: number | null
  monthlyLimit: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}
