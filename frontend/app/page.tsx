'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { getQueue } from '@/lib/api'
import UploadZone from '@/components/UploadZone'
import { ACTION_CONFIG } from '@/lib/utils'
import type { ReferralSummary } from '@/lib/types'

const POLL_INTERVAL_MS = 30_000

function countByTier(referrals: ReferralSummary[]) {
  return {
    'PRIORITY REVIEW':    referrals.filter((r) => r.action === 'PRIORITY REVIEW').length,
    'SECONDARY APPROVAL': referrals.filter((r) => r.action === 'SECONDARY APPROVAL').length,
    'STANDARD QUEUE':     referrals.filter((r) => r.action === 'STANDARD QUEUE').length,
    processing: referrals.filter((r) => r.status === 'pending' && !r.action).length,
    failed:     referrals.filter((r) => r.status === 'failed').length,
  }
}

const TIERS = [
  {
    action:      'PRIORITY REVIEW' as const,
    href:        '/priority',
    description: 'Matches ENT urgent criteria — schedule immediately',
    icon:        'emergency',
  },
  {
    action:      'SECONDARY APPROVAL' as const,
    href:        '/secondary',
    description: 'Provider marked urgent but no criteria matched — review before scheduling',
    icon:        'rule_folder',
  },
  {
    action:      'STANDARD QUEUE' as const,
    href:        '/standard',
    description: 'No urgency indicated by provider or clinical content',
    icon:        'inbox',
  },
]

export default function HomePage() {
  const { user, authLoading, logout } = useAuth()
  const router = useRouter()

  const [referrals, setReferrals] = useState<ReferralSummary[]>([])
  const [pageLoading, setPageLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  const fetchQueue = useCallback(async () => {
    if (!user) return
    try {
      const data = await getQueue(user.idToken)
      setReferrals(data.filter((r) => r.status !== 'archived'))
      setFetchError(false)
    } catch (err) {
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        logout()
        router.replace('/login')
      } else {
        setFetchError(true)
      }
    } finally {
      setPageLoading(false)
    }
  }, [user, logout, router])

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    fetchQueue()
    const interval = setInterval(fetchQueue, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [authLoading, user, fetchQueue, router])

  if (authLoading || pageLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <span className="material-symbols-outlined text-primary animate-spin" style={{ fontSize: '32px' }}>sync</span>
      </div>
    )
  }

  const counts = countByTier(referrals)
  const total = referrals.length

  return (
    <div className="min-h-screen bg-surface">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md shadow-header">
        <div className="mx-auto max-w-4xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-xl font-black uppercase tracking-tighter text-primary">TriageAI</span>
            <div className="hidden sm:block h-5 w-px bg-outline-variant/40" />
            <div className="hidden sm:flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-on-surface-variant">Live</span>
              <span className="bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded text-xs ml-1">
                {total} referral{total !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-on-surface-variant">{user.clinicName}</span>
            <button
              onClick={() => { logout(); router.replace('/login') }}
              className="bg-surface-container-low border border-outline-variant/30 text-on-surface-variant text-xs font-medium px-3 py-1.5 rounded hover:bg-surface-container-high transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">

        {fetchError && (
          <div className="mb-6 rounded-lg border border-error/20 bg-error-container/20 p-4 text-center">
            <p className="text-sm font-medium text-error">Could not connect to the API.</p>
          </div>
        )}

        {/* Upload zone */}
        <section className="mb-10">
          <UploadZone token={user.idToken} onUploaded={fetchQueue} />
        </section>

        {/* Section header */}
        <div className="mb-5">
          <h2 className="text-lg font-bold tracking-tight text-primary">Triage Queues</h2>
          <p className="text-sm text-on-surface-variant mt-1">Real-time clinical pipeline status.</p>
        </div>

        {/* Tier cards */}
        <div className="flex flex-col gap-4">
          {TIERS.map(({ action, href, description, icon }) => {
            const cfg = ACTION_CONFIG[action]
            const count = counts[action]
            return (
              <Link key={action} href={href}>
                <div className={`
                  group block bg-surface-container-lowest rounded-lg border border-outline-variant/15
                  border-l-[3px] overflow-hidden cursor-pointer
                  hover:shadow-ambient-md transition-all duration-150
                  ${cfg.borderColor}
                `}>
                  <div className="flex items-center justify-between p-5 pl-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded flex items-center justify-center ${cfg.sectionBg}`}>
                        <span className={`material-symbols-outlined ${cfg.badgeText === 'text-on-tertiary' ? 'text-tertiary-container' : cfg.badgeText}`} style={{ fontSize: '22px' }}>
                          {icon}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-base font-bold tracking-tight text-on-surface flex items-center gap-2 group-hover:text-primary transition-colors">
                          {cfg.label}
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${cfg.badgeBg} ${cfg.badgeText}`}>
                            {count}
                          </span>
                        </h3>
                        <p className="text-sm text-on-surface-variant mt-0.5">{description}</p>
                      </div>
                    </div>
                    <div className="flex items-center text-sm font-medium text-on-surface-variant group-hover:text-primary transition-colors">
                      Open queue
                      <span className="material-symbols-outlined ml-1 group-hover:translate-x-1 transition-transform" style={{ fontSize: '18px' }}>arrow_forward</span>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}

          {/* In Pipeline card */}
          <Link href="/pending">
            <div className={`
              group block bg-surface-container-lowest rounded-lg border border-outline-variant/15
              border-l-[3px] overflow-hidden cursor-pointer
              hover:shadow-ambient-md transition-all duration-150
              ${counts.failed > 0 ? 'border-l-tertiary-container' : 'border-l-primary-container'}
            `}>
              <div className="flex items-center justify-between p-5 pl-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded flex items-center justify-center ${counts.failed > 0 ? 'bg-error-container/30' : 'bg-primary-fixed/20'}`}>
                    <span
                      className={`material-symbols-outlined ${counts.failed > 0 ? 'text-error' : 'text-primary-container animate-spin'}`}
                      style={{ fontSize: '22px' }}
                    >
                      {counts.failed > 0 ? 'warning' : 'sync'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold tracking-tight text-on-surface flex items-center gap-2 group-hover:text-primary transition-colors">
                      In Pipeline
                      {(counts.processing > 0 || counts.failed > 0) && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${counts.failed > 0 ? 'bg-error text-on-error' : 'bg-surface-container-high text-on-surface-variant'}`}>
                          {counts.processing + counts.failed}
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-on-surface-variant mt-0.5">
                      {counts.processing > 0
                        ? `${counts.processing} referral${counts.processing !== 1 ? 's' : ''} currently being classified`
                        : 'No referrals currently processing'}
                      {counts.failed > 0 ? ` · ${counts.failed} failed` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center text-sm font-medium text-on-surface-variant group-hover:text-primary transition-colors">
                  View
                  <span className="material-symbols-outlined ml-1 group-hover:translate-x-1 transition-transform" style={{ fontSize: '18px' }}>arrow_forward</span>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  )
}
