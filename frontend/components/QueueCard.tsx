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

  const displayName = referral.filename
    ?? referral.id.slice(0, 8).toUpperCase()

  return (
    <Link href={`/referrals/${referral.id}`}>
      <div
        className={`
          group relative flex flex-col gap-2 rounded-xl border bg-white
          p-5 shadow-sm transition-all duration-150 cursor-pointer
          border-l-4
          ${isFailed
            ? 'border-slate-200 border-l-red-400 hover:shadow-md'
            : isProcessing
            ? 'border-slate-200 border-l-slate-300 hover:shadow-md'
            : `border-slate-200 ${cfg?.borderColor ?? 'border-l-slate-200'} hover:shadow-md`
          }
        `}
      >
        {/* Row 1: Badge + filename + date */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {isFailed ? (
              <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 shrink-0">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                Pipeline Failed
              </span>
            ) : isProcessing ? (
              <span className="flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 shrink-0">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
                Processing…
              </span>
            ) : (
              <PriorityBadge action={referral.action} />
            )}
            <span className="truncate text-xs text-slate-400 font-mono">{displayName}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {referral.status !== 'pending' && referral.status !== 'failed' && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
            )}
            {missingCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-600">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                {missingCount} missing
              </span>
            )}
            <span className="text-xs text-slate-400">
              {formatDate(referral.received_at)}
              <span className="mx-1 text-slate-300">·</span>
              {formatRelativeTime(referral.received_at)}
            </span>
          </div>
        </div>

        {/* Row 2: Referral reason */}
        {isFailed ? (
          <p className="text-sm font-medium leading-snug text-red-700">
            Classification failed — open to view details and retry
          </p>
        ) : (
          <p className="line-clamp-2 text-sm font-medium leading-snug text-slate-800">
            {referral.referral_reason ?? (isProcessing ? 'Extracting referral information…' : '—')}
          </p>
        )}

        {/* Row 3: Summary */}
        {!isProcessing && !isFailed && referral.summary && (
          <p className="line-clamp-1 text-xs leading-relaxed text-slate-500">
            {referral.summary}
          </p>
        )}

        {/* Row 4: Schedule window + chevron */}
        <div className="flex items-center justify-between pt-0.5">
          {referral.recommended_window && !isProcessing && !isFailed ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5" />
              </svg>
              Schedule: {referral.recommended_window}
            </span>
          ) : (
            <span />
          )}
          <svg
            className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500"
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </div>
    </Link>
  )
}
