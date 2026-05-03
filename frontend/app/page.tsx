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

const PHYSICIAN_NAV = [
  {
    href:        '/my-queue',
    title:       'My Queue',
    description: 'Referrals escalated to you for MD review',
    icon:        'person',
    borderColor: 'border-l-primary-container',
    iconBg:      'bg-primary-fixed/20',
    iconColor:   'text-primary-container',
    countKey:    'myQueue' as const,
  },
  {
    href:        '/all-cases',
    title:       'All Cases',
    description: 'All referrals across every tier at this clinic',
    icon:        'folder_open',
    borderColor: 'border-l-outline-variant',
    iconBg:      'bg-surface-container-high',
    iconColor:   'text-on-surface-variant',
    countKey:    'total' as const,
  },
]

const TIERS = [
  {
    action:      'PRIORITY REVIEW' as const,
    href:        '/priority',
    description: 'Matches ENT urgent criteria — schedule immediately or escalate to MD',
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

function countAll(referrals: ReferralSummary[], myUserId?: string) {
  const ready = referrals.filter((r) => r.status === 'ready')
  const active = referrals.filter((r) => r.status !== 'archived' && r.status !== 'scheduled')
  return {
    'PRIORITY REVIEW':    ready.filter((r) => r.action === 'PRIORITY REVIEW').length,
    'SECONDARY APPROVAL': ready.filter((r) => r.action === 'SECONDARY APPROVAL').length,
    'STANDARD QUEUE':     ready.filter((r) => r.action === 'STANDARD QUEUE').length,
    escalated_to_md:      active.filter((r) => r.status === 'escalated_to_md').length,
    md_reviewed:          active.filter((r) => r.status === 'md_reviewed').length,
    approved_for_scheduling: referrals.filter((r) => r.status === 'approved_for_scheduling').length,
    processing:           referrals.filter((r) => r.status === 'pending' && !r.action).length,
    failed:               referrals.filter((r) => r.status === 'failed').length,
    myQueue:              myUserId ? referrals.filter((r) => r.routed_to === myUserId && r.status !== 'archived').length : 0,
    total:                active.length,
  }
}

export default function HomePage() {
  const { user, authLoading, logout } = useAuth()
  const router = useRouter()

  const [referrals, setReferrals] = useState<ReferralSummary[]>([])
  const [pageLoading, setPageLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  const fetchQueue = useCallback(async () => {
    if (!user) return
    try {
      const data = await getQueue()
      setReferrals(data)
      setFetchError(false)
    } catch (err) {
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        logout(); router.replace('/login')
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
    if (user.role === 'superadmin') { router.replace('/superadmin'); return }
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

  const role = user.role
  const counts = countAll(referrals, user.id)

  return (
    <div className="min-h-screen bg-surface">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md shadow-header">
        <div className="mx-auto max-w-4xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-xl font-black uppercase tracking-tighter text-primary">TriageAI</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-on-surface-variant">{user.clinicName}</span>
            {role === 'admin' && (
              <Link href="/team"
                className="text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>group</span>
                Team
              </Link>
            )}
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

        {/* ── PHYSICIAN ── */}
        {role === 'physician' && (
          <>
            <div className="mb-5">
              <h2 className="text-lg font-bold tracking-tight text-primary">Your Dashboard</h2>
              <p className="text-sm text-on-surface-variant mt-1">Referrals escalated to you and the full clinic record.</p>
            </div>
            <NavCards items={PHYSICIAN_NAV} counts={counts} />
          </>
        )}

        {/* ── COORDINATOR ── */}
        {role === 'coordinator' && (
          <>
            <section className="mb-10">
              <UploadZone onUploaded={fetchQueue} />
            </section>
            <div className="mb-5">
              <h2 className="text-lg font-bold tracking-tight text-primary">Scheduling Inbox</h2>
              <p className="text-sm text-on-surface-variant mt-1">Referrals cleared by triage and ready to schedule.</p>
            </div>
            <div className="flex flex-col gap-4">
              <NavCard
                href="/scheduling-inbox"
                title="Ready to Schedule"
                description="Referrals approved by triage with scheduling windows set"
                icon="calendar_today"
                borderColor="border-l-primary-container"
                iconBg="bg-primary-fixed/20"
                iconColor="text-primary-container"
                count={counts.approved_for_scheduling}
                countBg="bg-primary-container text-on-primary-container"
              />
              <NavCard
                href="/pending"
                title="In Pipeline"
                description={counts.processing > 0
                  ? `${counts.processing} referral${counts.processing !== 1 ? 's' : ''} currently being classified`
                  : 'No referrals currently processing'}
                icon={counts.failed > 0 ? 'warning' : 'sync'}
                borderColor={counts.failed > 0 ? 'border-l-tertiary-container' : 'border-l-outline-variant'}
                iconBg={counts.failed > 0 ? 'bg-error-container/30' : 'bg-surface-container-high'}
                iconColor={counts.failed > 0 ? 'text-error' : 'text-on-surface-variant'}
                count={counts.processing + counts.failed}
                countBg={counts.failed > 0 ? 'bg-error text-on-error' : 'bg-surface-container-high text-on-surface-variant'}
                spin={counts.failed === 0 && counts.processing > 0}
              />
              <NavCard
                href="/archive"
                title="Scheduled Archive"
                description="Patient records for all scheduled referrals — search by name"
                icon="folder_open"
                borderColor="border-l-outline-variant"
                iconBg="bg-surface-container-high"
                iconColor="text-on-surface-variant"
                countBg="bg-surface-container-high text-on-surface-variant"
              />
            </div>
          </>
        )}

        {/* ── REVIEWER / ADMIN ── */}
        {(role === 'reviewer' || role === 'admin') && (
          <>
            {role === 'admin' && (
              <section className="mb-10">
                <UploadZone onUploaded={fetchQueue} />
              </section>
            )}

            <div className="mb-5">
              <h2 className="text-lg font-bold tracking-tight text-primary">Triage Queues</h2>
              <p className="text-sm text-on-surface-variant mt-1">Real-time clinical pipeline status.</p>
            </div>

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

              {/* MD status cards */}
              {counts.escalated_to_md > 0 && (
                <div className="bg-surface-container-lowest rounded-lg border border-outline-variant/15 border-l-[3px] border-l-outline-variant p-5 pl-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded flex items-center justify-center bg-surface-container-high">
                      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '22px' }}>hourglass_empty</span>
                    </div>
                    <div>
                      <h3 className="text-base font-bold tracking-tight text-on-surface flex items-center gap-2">
                        Awaiting MD
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                          {counts.escalated_to_md}
                        </span>
                      </h3>
                      <p className="text-sm text-on-surface-variant mt-0.5">Escalated to physician — pending decision</p>
                    </div>
                  </div>
                </div>
              )}

              {counts.md_reviewed > 0 && (
                <Link href="/priority">
                  <div className="group bg-surface-container-lowest rounded-lg border border-primary-container/40 border-l-[3px] border-l-primary-container p-5 pl-4 hover:shadow-ambient-md transition-all cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded flex items-center justify-center bg-primary-fixed/20">
                          <span className="material-symbols-outlined text-primary-container" style={{ fontSize: '22px' }}>reply</span>
                        </div>
                        <div>
                          <h3 className="text-base font-bold tracking-tight text-on-surface flex items-center gap-2 group-hover:text-primary transition-colors">
                            MD Responded
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary-container text-on-primary-container">
                              {counts.md_reviewed}
                            </span>
                          </h3>
                          <p className="text-sm text-on-surface-variant mt-0.5">Decision ready — send to scheduler</p>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary group-hover:translate-x-1 transition-all" style={{ fontSize: '18px' }}>arrow_forward</span>
                    </div>
                  </div>
                </Link>
              )}

              {/* In Pipeline */}
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

              {/* Scheduling inbox link for admin */}
              {role === 'admin' && (
                <NavCard
                  href="/scheduling-inbox"
                  title="Ready to Schedule"
                  description="Referrals approved by triage with scheduling windows set"
                  icon="calendar_today"
                  borderColor="border-l-outline-variant"
                  iconBg="bg-surface-container-high"
                  iconColor="text-on-surface-variant"
                  count={counts.approved_for_scheduling}
                  countBg="bg-surface-container-high text-on-surface-variant"
                />
              )}
              <NavCard
                href="/archive"
                title="Scheduled Archive"
                description="Patient records for all scheduled referrals — search by name"
                icon="folder_open"
                borderColor="border-l-outline-variant"
                iconBg="bg-surface-container-high"
                iconColor="text-on-surface-variant"
                countBg="bg-surface-container-high text-on-surface-variant"
              />
            </div>
          </>
        )}
      </main>
    </div>
  )
}

// ── Shared sub-components ────────────────────────────────────────────────────

function NavCards({ items, counts }: {
  items: typeof PHYSICIAN_NAV
  counts: Record<string, number>
}) {
  return (
    <div className="flex flex-col gap-4">
      {items.map(({ href, title, description, icon, borderColor, iconBg, iconColor, countKey }) => (
        <NavCard
          key={href}
          href={href}
          title={title}
          description={description}
          icon={icon}
          borderColor={borderColor}
          iconBg={iconBg}
          iconColor={iconColor}
          count={counts[countKey]}
          countBg="bg-surface-container-high text-on-surface-variant"
        />
      ))}
    </div>
  )
}

function NavCard({ href, title, description, icon, borderColor, iconBg, iconColor, count, countBg, spin }: {
  href: string
  title: string
  description: string
  icon: string
  borderColor: string
  iconBg: string
  iconColor: string
  count?: number
  countBg: string
  spin?: boolean
}) {
  return (
    <Link href={href}>
      <div className={`
        group block bg-surface-container-lowest rounded-lg border border-outline-variant/15
        border-l-[3px] overflow-hidden cursor-pointer
        hover:shadow-ambient-md transition-all duration-150
        ${borderColor}
      `}>
        <div className="flex items-center justify-between p-5 pl-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded flex items-center justify-center ${iconBg}`}>
              <span className={`material-symbols-outlined ${iconColor} ${spin ? 'animate-spin' : ''}`} style={{ fontSize: '22px' }}>{icon}</span>
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight text-on-surface flex items-center gap-2 group-hover:text-primary transition-colors">
                {title}
                {!!count && count > 0 && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${countBg}`}>
                    {count}
                  </span>
                )}
              </h3>
              <p className="text-sm text-on-surface-variant mt-0.5">{description}</p>
            </div>
          </div>
          <div className="flex items-center text-sm font-medium text-on-surface-variant group-hover:text-primary transition-colors">
            Open
            <span className="material-symbols-outlined ml-1 group-hover:translate-x-1 transition-transform" style={{ fontSize: '18px' }}>arrow_forward</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
