'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { getQueue } from '@/lib/api'
import QueueCard from '@/components/QueueCard'
import { ACTION_CONFIG } from '@/lib/utils'
import type { ReferralAction, ReferralSummary } from '@/lib/types'

interface Props {
  action: ReferralAction
}

const POLL_INTERVAL_MS = 30_000

export default function TierQueue({ action }: Props) {
  const { user, authLoading, logout } = useAuth()
  const router = useRouter()
  const cfg = ACTION_CONFIG[action]

  const [referrals, setReferrals] = useState<ReferralSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  const fetchReferrals = useCallback(async () => {
    if (!user) return
    try {
      const data = await getQueue(user.idToken, { action })
      setReferrals(data)
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
  }, [user, action, logout, router])

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    fetchReferrals()
    const interval = setInterval(fetchReferrals, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [authLoading, user, fetchReferrals, router])

  if (authLoading || loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

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
              <span className={`inline-flex items-center gap-1.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText} px-3 py-1 text-xs font-semibold`}>
                <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                {cfg.label}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                Live
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
            <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${cfg.badgeBg}`}>
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">No referrals in this queue.</p>
            <p className="mt-1 text-xs text-slate-400">All caught up.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {referrals.map((r) => (
              <QueueCard key={r.id} referral={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
