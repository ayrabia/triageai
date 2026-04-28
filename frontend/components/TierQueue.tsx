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
      const data = await getQueue({ action, status: 'ready' })
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
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <span className="material-symbols-outlined text-primary animate-spin" style={{ fontSize: '32px' }}>sync</span>
      </div>
    )
  }

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
            <h1 className="text-lg font-bold tracking-tight text-primary">{cfg.label}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-bold tracking-wide uppercase ${cfg.badgeBg} ${cfg.badgeText}`}>
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${cfg.dotColor === cfg.badgeBg ? 'bg-white/60' : cfg.dotColor}`} />
              Live
            </span>
            <span className="text-sm font-medium text-on-surface-variant">
              {referrals.length} referral{referrals.length !== 1 ? 's' : ''}
            </span>
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
            <span className="material-symbols-outlined text-outline mb-4" style={{ fontSize: '32px' }}>inbox</span>
            <p className="text-sm font-semibold text-on-surface">No referrals in this queue.</p>
            <p className="mt-1 text-xs text-on-surface-variant">All caught up.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {referrals.map((r) => (
              <QueueCard key={r.id} referral={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
