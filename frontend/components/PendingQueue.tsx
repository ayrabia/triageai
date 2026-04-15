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
      await updateStatus(id, 'archived', user.idToken)
      setReferrals((prev) => prev.filter((r) => r.id !== id))
    } finally {
      setDismissing((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }, [user])

  const fetchReferrals = useCallback(async () => {
    if (!user) return
    try {
      // Fetch pending (unclassified) + failed in one call each
      const [pending, failed] = await Promise.all([
        getQueue(user.idToken, undefined, 'pending'),
        getQueue(user.idToken, undefined, 'failed'),
      ])
      // pending includes both processing (no action) and classified-but-pending-review;
      // we only want the ones still in the pipeline (no action yet)
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

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  const processing = referrals.filter((r) => r.status === 'pending')
  const failed = referrals.filter((r) => r.status === 'failed')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Home
              </Link>
              <span className="text-slate-200">/</span>
              <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                In Pipeline
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                Live · refreshes every 10s
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                {referrals.length} referral{referrals.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {fetchError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-700">Could not load referrals.</p>
          </div>
        ) : referrals.length === 0 ? (
          <div className="py-24 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">Pipeline is clear.</p>
            <p className="mt-1 text-xs text-slate-400">No referrals are currently processing.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Processing */}
            {processing.length > 0 && (
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Processing ({processing.length})
                </h2>
                <div className="flex flex-col gap-3">
                  {processing.map((r) => (
                    <PendingCard key={r.id} referral={r} />
                  ))}
                </div>
              </section>
            )}

            {/* Failed */}
            {failed.length > 0 && (
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-red-400">
                  Failed ({failed.length})
                </h2>
                <div className="flex flex-col gap-3">
                  {failed.map((r) => (
                    <PendingCard
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

function PendingCard({
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
    <div className={`
      flex items-center justify-between rounded-xl border bg-white p-5
      shadow-sm border-l-4
      ${isFailed ? 'border-slate-200 border-l-red-400' : 'border-slate-200 border-l-slate-300'}
    `}>
      <Link href={`/referrals/${referral.id}`} className="group flex items-center gap-3 min-w-0 flex-1">
        {isFailed ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100">
            <svg className="h-4 w-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          </div>
        )}
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-800 font-mono group-hover:text-indigo-600 transition-colors">
            {displayName}
          </span>
          <span className="text-xs text-slate-400">
            {isFailed ? 'Pipeline failed — open to view details' : 'Extracting and classifying…'}
          </span>
        </div>
      </Link>

      <div className="flex items-center gap-3 shrink-0 ml-4">
        <span className="text-xs text-slate-400">
          {formatDate(referral.received_at)}
          <span className="mx-1 text-slate-300">·</span>
          {formatRelativeTime(referral.received_at)}
        </span>
        {isFailed && onDismiss && (
          <button
            onClick={onDismiss}
            disabled={dismissing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {dismissing ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
            ) : (
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
