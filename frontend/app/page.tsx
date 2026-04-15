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
    'PRIORITY REVIEW': referrals.filter((r) => r.action === 'PRIORITY REVIEW').length,
    'SECONDARY APPROVAL': referrals.filter((r) => r.action === 'SECONDARY APPROVAL').length,
    'STANDARD QUEUE': referrals.filter((r) => r.action === 'STANDARD QUEUE').length,
    processing: referrals.filter((r) => r.status === 'pending' && !r.action).length,
    failed: referrals.filter((r) => r.status === 'failed').length,
  }
}

const TIERS = [
  {
    action: 'PRIORITY REVIEW' as const,
    href: '/priority',
    description: 'Matches ENT urgent criteria — schedule immediately',
  },
  {
    action: 'SECONDARY APPROVAL' as const,
    href: '/secondary',
    description: 'Provider marked urgent but no criteria matched — review before scheduling',
  },
  {
    action: 'STANDARD QUEUE' as const,
    href: '/standard',
    description: 'No urgency indicated by provider or clinical content',
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

  if (authLoading || pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  const counts = countByTier(referrals)
  const total = referrals.length

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-semibold text-slate-900">TriageAI</h1>
                <p className="text-xs text-slate-400">{user?.clinicName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                Live
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                {total} referral{total !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => { logout(); router.replace('/login') }}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {fetchError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm font-medium text-red-700">Could not connect to the API.</p>
          </div>
        )}

        {/* Upload zone */}
        <div className="mb-8">
          <UploadZone token={user!.idToken} onUploaded={fetchQueue} />
        </div>

        {/* Tier cards */}
        <div className="flex flex-col gap-4">
          {TIERS.map(({ action, href, description }) => {
            const cfg = ACTION_CONFIG[action]
            const count = counts[action]
            return (
              <Link key={action} href={href}>
                <div className={`
                  group flex items-center justify-between rounded-xl border border-slate-200
                  bg-white p-6 shadow-sm transition-all hover:shadow-md cursor-pointer
                  border-l-4 ${cfg.borderColor}
                `}>
                  <div className="flex items-center gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${cfg.badgeBg}`}>
                      <span className="text-xl font-bold text-white">{count}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText} px-2.5 py-0.5 text-xs font-semibold`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                          {cfg.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-400 group-hover:text-slate-600 transition-colors">
                      Open queue
                    </span>
                    <svg className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              </Link>
            )
          })}

          {/* In-pipeline card — always visible so staff can always track uploads */}
          <Link href="/pending">
            <div className={`
              group flex items-center justify-between rounded-xl border border-slate-200
              bg-white p-6 shadow-sm transition-all hover:shadow-md cursor-pointer
              border-l-4
              ${counts.failed > 0 ? 'border-l-red-400' : 'border-l-slate-300'}
            `}>
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${counts.failed > 0 ? 'bg-red-100' : 'bg-slate-100'}`}>
                  {counts.failed > 0 ? (
                    <svg className="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold
                      ${counts.failed > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${counts.failed > 0 ? 'bg-red-400' : 'bg-slate-400 animate-pulse'}`} />
                      In Pipeline
                    </span>
                    {counts.failed > 0 && (
                      <span className="text-xs text-red-500 font-medium">{counts.failed} failed</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {counts.processing > 0
                      ? `${counts.processing} referral${counts.processing !== 1 ? 's' : ''} currently being classified`
                      : 'No referrals currently processing'}
                    {counts.failed > 0 ? ' — some need attention' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400 group-hover:text-slate-600 transition-colors">
                  View
                </span>
                <svg className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  )
}
