import Link from 'next/link'
import PriorityBadge from './PriorityBadge'
import { ACTION_CONFIG, STATUS_CONFIG, formatDate, formatRelativeTime } from '@/lib/utils'
import type { ReferralSummary } from '@/lib/types'

interface Props {
  referral: ReferralSummary
}

export default function QueueCard({ referral }: Props) {
  const cfg = referral.action ? ACTION_CONFIG[referral.action] : null
  const statusCfg = STATUS_CONFIG[referral.status]
  const missingCount = referral.missing_information?.length ?? 0
  const isProcessing = referral.status === 'pending' && !referral.action
  const isFailed = referral.status === 'failed'
  const displayName = referral.filename ?? referral.id.slice(0, 8).toUpperCase()

  return (
    <Link href={`/referrals/${referral.id}`}>
      <article className={`
        group relative bg-surface-container-lowest rounded-lg overflow-hidden
        border border-outline-variant/15 border-l-[3px] cursor-pointer
        flex flex-col gap-3 p-5
        transition-all duration-150 hover:shadow-ambient-md
        ${isFailed ? 'border-l-error' : isProcessing ? 'border-l-outline-variant' : cfg?.borderColor ?? 'border-l-outline-variant'}
      `}>

        {/* Row 1: badge + filename + status + missing + date */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            {isFailed ? (
              <span className="inline-flex items-center gap-1 rounded bg-error text-on-error px-2 py-0.5 text-xs font-bold tracking-tight shrink-0">
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>warning</span>
                FAILED
              </span>
            ) : isProcessing ? (
              <span className="inline-flex items-center gap-1.5 rounded bg-surface-container-high text-on-surface-variant px-2 py-0.5 text-xs font-bold tracking-tight shrink-0">
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: '12px' }}>sync</span>
                PROCESSING
              </span>
            ) : (
              <PriorityBadge action={referral.action} />
            )}
            <code className="truncate text-xs text-on-surface-variant font-mono bg-surface-container-low px-1.5 py-0.5 rounded border border-outline-variant/20">
              {displayName}
            </code>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {referral.status !== 'pending' && referral.status !== 'failed' && (
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
            )}
            {missingCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-[#FFF4E5] text-[#E65100] border border-[#FFB74D]/50 px-1.5 py-0.5 text-xs font-medium">
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>help_center</span>
                {missingCount} missing
              </span>
            )}
            <span className="text-xs text-on-surface-variant">
              {formatDate(referral.received_at)}
              <span className="mx-1 text-outline-variant">·</span>
              {formatRelativeTime(referral.received_at)}
            </span>
          </div>
        </div>

        {/* Row 2: referral reason */}
        {isFailed ? (
          <p className="text-base font-semibold text-error leading-tight tracking-tight">
            Classification failed — open to view details and retry
          </p>
        ) : (
          <h2 className="text-base font-semibold text-on-surface leading-tight tracking-tight line-clamp-2 pr-8">
            {referral.referral_reason ?? (isProcessing ? 'Extracting referral information…' : '—')}
          </h2>
        )}

        {/* Row 3: AI summary inset */}
        {!isProcessing && !isFailed && referral.summary && (
          <div className="bg-surface-container-low rounded border border-outline-variant/10 px-3 py-2">
            <p className="text-sm text-on-surface-variant line-clamp-1 flex items-center gap-2">
              <span className="material-symbols-outlined fill text-surface-tint shrink-0" style={{ fontSize: '16px' }}>auto_awesome</span>
              <span className="font-medium opacity-70 shrink-0">AI:</span>
              {referral.summary}
            </p>
          </div>
        )}

        {/* Row 4: schedule window + chevron */}
        <div className="flex items-center justify-between pt-1 border-t border-outline-variant/15 mt-1">
          {referral.recommended_window && !isProcessing && !isFailed ? (
            <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>calendar_today</span>
              Schedule: {referral.recommended_window}
            </div>
          ) : (
            <span />
          )}
          <span
            className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors"
            style={{ fontSize: '20px' }}
          >
            chevron_right
          </span>
        </div>
      </article>
    </Link>
  )
}
