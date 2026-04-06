import { ACTION_CONFIG } from '@/lib/utils'
import type { ReferralAction } from '@/lib/types'

interface Props {
  action: ReferralAction | null
  size?: 'sm' | 'md'
}

export default function PriorityBadge({ action, size = 'md' }: Props) {
  if (!action) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        Processing
      </span>
    )
  }

  const cfg = ACTION_CONFIG[action]
  const px = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'
  const text = size === 'sm' ? 'text-xs' : 'text-xs font-semibold'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText} ${px} ${text}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
      {size === 'sm' ? cfg.shortLabel : cfg.label}
    </span>
  )
}
