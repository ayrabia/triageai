'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { getQueue } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'
import type { ReferralSummary } from '@/lib/types'

const POLL_INTERVAL_MS = 30_000

export default function SchedulingInboxPage() {
  const { user, authLoading, logout } = useAuth()
  const router = useRouter()
  const [referrals, setReferrals] = useState<ReferralSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchData = useCallback(async () => {
    if (!user) return
    try {
      const data = await getQueue(user.idToken, { status: 'approved_for_scheduling' })
      setReferrals(data)
      setError(false)
    } catch (err) {
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        logout(); router.replace('/login')
      } else {
        setError(true)
      }
    } finally {
      setLoading(false)
    }
  }, [user, logout, router])

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    fetchData()
    const interval = setInterval(fetchData, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [authLoading, user, fetchData, router])

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <span className="material-symbols-outlined text-primary animate-spin" style={{ fontSize: '32px' }}>sync</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md shadow-header">
        <div className="mx-auto max-w-4xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
              Home
            </Link>
            <span className="h-5 w-px bg-outline-variant/40" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-bold text-on-surface">Ready to Schedule</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary-container text-on-primary-container">
                {referrals.length}
              </span>
            </div>
          </div>
          <span className="text-xs text-on-surface-variant">{user?.clinicName}</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-lg border border-error/20 bg-error-container/20 p-4 text-center">
            <p className="text-sm text-error">Could not load referrals.</p>
          </div>
        )}

        {!error && referrals.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: '40px' }}>calendar_today</span>
            <p className="mt-4 text-sm font-medium text-on-surface-variant">No referrals ready to schedule.</p>
            <p className="mt-1 text-xs text-outline">Check back when triage has approved referrals for scheduling.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {referrals.map((r) => (
              <Link key={r.id} href={`/referrals/${r.id}`}>
                <div className="group bg-surface-container-lowest rounded-lg border border-outline-variant/15 border-l-[3px] border-l-primary-container p-5 hover:shadow-ambient-md transition-all cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors line-clamp-2">
                        {r.referral_reason ?? r.filename ?? r.id.slice(0, 8)}
                      </p>
                      {r.scheduling_window && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary">
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>calendar_today</span>
                          {r.scheduling_window}
                        </div>
                      )}
                      <p className="mt-1 text-xs text-outline">{formatRelativeTime(r.received_at)}</p>
                    </div>
                    <span
                      className="material-symbols-outlined text-on-surface-variant group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0"
                      style={{ fontSize: '18px' }}
                    >
                      arrow_forward
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
