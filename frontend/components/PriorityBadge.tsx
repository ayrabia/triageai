import type { ReferralAction } from '@/lib/types'
import { ACTION_CONFIG } from '@/lib/utils'

interface Props {
  action: ReferralAction | null | undefined
  size?: 'sm' | 'default'
}

export default function PriorityBadge({ action, size = 'default' }: Props) {
  if (!action) return null
  const cfg = ACTION_CONFIG[action]
  const cls = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`inline-flex items-center rounded font-bold tracking-tight shrink-0 ${cfg.badgeBg} ${cfg.badgeText} ${cls}`}>
      {cfg.shortLabel.toUpperCase()}
    </span>
  )
}
