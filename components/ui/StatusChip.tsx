import * as React from 'react'
import { cn } from './cn'

export type ChoreStatus = 'done' | 'pending' | 'late' | 'rejected'

type StatusChipProps = {
  status: ChoreStatus
  /** Override the default Thai label. */
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

const config: Record<ChoreStatus, { label: string; icon: string; cls: string }> = {
  done: {
    label: 'เสร็จแล้ว',
    icon: '✅',
    cls: 'bg-success-100 text-success-500 border-success-400/40',
  },
  pending: {
    label: 'รออนุมัติ',
    icon: '⏳',
    cls: 'bg-primary-300/40 text-primary-700 border-primary-500/30',
  },
  late: {
    label: 'เลยกำหนด',
    icon: '⚠️',
    cls: 'bg-xp-300/60 text-xp-700 border-xp-500/40',
  },
  rejected: {
    label: 'ปฏิเสธ',
    icon: '❌',
    cls: 'bg-danger-100 text-danger-500 border-danger-500/30',
  },
}

const sizeMap = {
  sm: 'h-6 px-2 text-xs gap-1',
  md: 'h-7 px-2.5 text-sm gap-1',
}

/**
 * StatusChip — chore completion status pill: Done / Pending / Late / Rejected.
 */
export function StatusChip({ status, label, size = 'md', className }: StatusChipProps) {
  const c = config[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border font-bold',
        sizeMap[size],
        c.cls,
        className,
      )}
    >
      <span aria-hidden className="leading-none">
        {c.icon}
      </span>
      {label ?? c.label}
    </span>
  )
}
