'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { getQueue, updateStatus } from '@/lib/api'
import { formatDate, formatRelativeTime } from '@/lib/utils'
import type { ReferralSummary } from '@/lib/types'

const POLL_INTERVAL_MS = 10_000

export default function PendingQueue() {
  const { user, authLoading, logout } = useAuth()
  const router = useRouter()

  const [referrals, setReferrals] = useState<ReferralSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [dismissing, setDismissing] = useState<Set<string>>(new Set())

  const dismiss = useCallback(async (id: string) => {
    if (!user) return
    setDismissing((prev) => new Set(prev).add(id))
    try {
      await updateStatus(id, 'archived')
      setReferrals((prev) => prev.filter((r) => r.id !== id))
    } finally {
      setDismissing((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }, [user])

  const fetchReferrals = useCallback(async () => {
    if (!user) return
    try {
      const [pending, failed] = await Promise.all([
        getQueue({ status: 'pending' }),
        getQueue({ status: 'failed' }),
      ])
      const processing = pending.filter((r) => !r.action)
      setReferrals([...processing, ...failed])
      setFetchError(false)
    } catch (err) {
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        logout()
        router.replace('/login')
      } else {
        setFetchError(true)
      }
    } finally {
      setLoading(false)
    }
  }, [user, logout, router])

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    fetchReferrals()
    const interval = setInterval(fetchReferrals, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [authLoading, user, fetchReferrals, router])

  if (authLoading || loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <span className="material-symbols-outlined text-primary animate-spin" style={{ fontSize: '32px' }}>sync</span>
      </div>
    )
  }

  const processing = referrals.filter((r) => r.status === 'pending')
  const failed = referrals.filter((r) => r.status === 'failed')

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md shadow-header">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
              Home
            </Link>
            <span className="h-5 w-px bg-outline-variant/40" />
            <div className="flex items-center gap-2 px-2.5 py-1 bg-surface-container-low rounded">
              <span className="material-symbols-outlined text-primary animate-spin" style={{ fontSize: '14px' }}>sync</span>
              <span className="text-sm font-bold tracking-tight text-primary">In Pipeline</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed-dim animate-pulse" />
            <span className="text-xs text-on-surface-variant">Live · refreshes every 10s</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {fetchError ? (
          <div className="rounded-lg border border-error/20 bg-error-container/20 p-6 text-center">
            <p className="text-sm font-medium text-error">Could not load referrals.</p>
          </div>
        ) : referrals.length === 0 ? (
          <div className="py-24 flex flex-col items-center">
            <span className="material-symbols-outlined text-outline mb-4" style={{ fontSize: '32px' }}>check_circle</span>
            <p className="text-sm font-semibold text-on-surface">Pipeline is clear.</p>
            <p className="mt-1 text-xs text-on-surface-variant">No referrals are currently processing.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {processing.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-outline mb-4">
                  Processing ({processing.length})
                </h2>
                <div className="flex flex-col gap-3">
                  {processing.map((r) => (
                    <PipelineCard key={r.id} referral={r} />
                  ))}
                </div>
              </section>
            )}

            {failed.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-error">
                    Failed
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-error-container text-on-error-container text-[10px] font-bold">
                    {failed.length} issue{failed.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {failed.map((r) => (
                    <PipelineCard
                      key={r.id}
                      referral={r}
                      onDismiss={() => dismiss(r.id)}
                      dismissing={dismissing.has(r.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function PipelineCard({
  referral,
  onDismiss,
  dismissing,
}: {
  referral: ReferralSummary
  onDismiss?: () => void
  dismissing?: boolean
}) {
  const isFailed = referral.status === 'failed'
  const displayName = referral.filename ?? referral.id.slice(0, 8).toUpperCase()

  return (
    <article className={`
      bg-surface-container-lowest rounded-lg border border-outline-variant/15 border-l-[3px]
      p-5 flex items-center gap-4
      ${isFailed ? 'border-l-tertiary-container' : 'border-l-secondary-container'}
    `}>
      <Link href={`/referrals/${referral.id}`} className="group flex items-center gap-4 min-w-0 flex-1">
        <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded ${
          isFailed ? 'bg-error-container/50' : 'bg-surface-container-low'
        }`}>
          {isFailed ? (
            <span className="material-symbols-outlined fill text-error" style={{ fontSize: '20px' }}>warning</span>
          ) : (
            <span className="material-symbols-outlined text-secondary animate-spin" style={{ fontSize: '20px' }}>sync</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-on-surface font-mono truncate group-hover:text-primary transition-colors">
            {displayName}
          </p>
          <p className={`text-xs mt-0.5 ${isFailed ? 'text-error' : 'text-on-surface-variant'}`}>
            {isFailed ? 'Pipeline failed — open to view details' : 'Extracting and classifying…'}
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <span className="text-xs text-on-surface-variant block">{formatDate(referral.received_at)}</span>
          <span className="text-xs text-outline block">{formatRelativeTime(referral.received_at)}</span>
        </div>
        {isFailed && onDismiss && (
          <button
            onClick={onDismiss}
            disabled={dismissing}
            className="flex items-center gap-1.5 rounded border border-outline-variant/50 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:border-error/30 hover:bg-error-container/20 hover:text-error transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {dismissing ? (
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: '12px' }}>sync</span>
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>close</span>
            )}
            Dismiss
          </button>
        )}
      </div>
    </article>
  )
}
