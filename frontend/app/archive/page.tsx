'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { getArchive } from '@/lib/api'
import type { ArchivedReferral, PatientRecord } from '@/lib/types'

const ACTION_BADGE: Record<string, string> = {
  'PRIORITY REVIEW':    'bg-[#FFEBEE] text-[#B71C1C]',
  'SECONDARY APPROVAL': 'bg-[#FFF8E1] text-[#E65100]',
  'STANDARD QUEUE':     'bg-[#E8F5E9] text-[#1B5E20]',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function groupByPatient(referrals: ArchivedReferral[]): PatientRecord[] {
  const map = new Map<string, PatientRecord>()

  for (const r of referrals) {
    const key = r.patient_name ?? '__unknown__'
    if (!map.has(key)) {
      map.set(key, {
        patient_name: r.patient_name,
        patient_dob: r.patient_dob,
        referring_provider: r.referring_provider,
        referral_count: 0,
        last_referral_at: r.received_at,
        referrals: [],
      })
    }
    const record = map.get(key)!
    record.referral_count++
    record.referrals.push(r)
    if (r.received_at > record.last_referral_at) record.last_referral_at = r.received_at
  }

  return Array.from(map.values()).sort((a, b) => {
    if (!a.patient_name) return 1
    if (!b.patient_name) return -1
    return a.patient_name.localeCompare(b.patient_name)
  })
}

export default function ArchivePage() {
  const { user, authLoading, logout } = useAuth()
  const router = useRouter()

  const [referrals, setReferrals] = useState<ArchivedReferral[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchArchive = useCallback(async () => {
    if (!user) return
    try {
      const data = await getArchive()
      setReferrals(data)
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
    fetchArchive()
  }, [authLoading, user, fetchArchive, router])

  const records = useMemo(() => groupByPatient(referrals), [referrals])

  const filtered = useMemo(() => {
    if (!search.trim()) return records
    const q = search.toLowerCase()
    return records.filter((r) =>
      (r.patient_name ?? '').toLowerCase().includes(q) ||
      (r.referring_provider ?? '').toLowerCase().includes(q)
    )
  }, [records, search])

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

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
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            Home
          </Link>
          <span className="h-5 w-px bg-outline-variant/40" />
          <h1 className="text-sm font-semibold text-on-surface">Scheduled Archive</h1>
          <span className="ml-auto rounded-full bg-surface-container-high px-2.5 py-0.5 text-xs font-medium text-on-surface-variant">
            {records.length} {records.length === 1 ? 'patient' : 'patients'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">

        {/* Search */}
        <div className="relative mb-6">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline" style={{ fontSize: '18px' }}>search</span>
          <input
            type="text"
            placeholder="Search by patient name or referring provider…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest pl-9 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {error && (
          <p className="text-sm text-error mb-4">Failed to load archive. Please refresh.</p>
        )}

        {filtered.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: '48px' }}>folder_open</span>
            <p className="text-sm font-medium text-on-surface">
              {search ? 'No patients match your search.' : 'No scheduled referrals yet.'}
            </p>
            {!search && (
              <p className="text-xs text-outline max-w-xs">
                Once a coordinator marks a referral as scheduled, it will appear here as a patient record.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {filtered.map((record) => {
            const key = record.patient_name ?? '__unknown__'
            const isOpen = expanded.has(key)
            return (
              <div key={key} className="bg-surface-container-lowest rounded-lg border border-outline-variant/15 overflow-hidden">
                {/* Patient header row */}
                <button
                  onClick={() => toggleExpand(key)}
                  className="w-full px-6 py-4 flex items-center gap-4 text-left hover:bg-surface-container-low transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px' }}>person</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-on-surface">
                      {record.patient_name ?? 'Unknown Patient'}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {record.patient_dob && (
                        <span className="text-xs text-on-surface-variant">DOB: {record.patient_dob}</span>
                      )}
                      {record.referring_provider && (
                        <span className="text-xs text-outline">Ref: {record.referring_provider}</span>
                      )}
                      <span className="text-xs text-outline">Last seen: {formatDate(record.last_referral_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 text-xs font-medium text-on-surface-variant">
                      {record.referral_count} {record.referral_count === 1 ? 'referral' : 'referrals'}
                    </span>
                    <span className={`material-symbols-outlined text-outline transition-transform ${isOpen ? 'rotate-180' : ''}`} style={{ fontSize: '20px' }}>
                      expand_more
                    </span>
                  </div>
                </button>

                {/* Referral list */}
                {isOpen && (
                  <div className="border-t border-outline-variant/15">
                    {record.referrals.map((r) => (
                      <Link
                        key={r.id}
                        href={`/referrals/${r.id}`}
                        className="flex items-start gap-4 px-6 py-4 border-b border-outline-variant/10 last:border-b-0 hover:bg-surface-container-low transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {r.action && (
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${ACTION_BADGE[r.action] ?? ''}`}>
                                {r.action}
                              </span>
                            )}
                            <span className="text-xs text-outline">{formatDate(r.received_at)}</span>
                          </div>
                          <p className="text-sm font-medium text-on-surface truncate">
                            {r.referral_reason ?? r.filename ?? 'No reason extracted'}
                          </p>
                          {r.summary && (
                            <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2 leading-relaxed">{r.summary}</p>
                          )}
                        </div>
                        <span className="material-symbols-outlined text-outline shrink-0 mt-0.5" style={{ fontSize: '18px' }}>arrow_forward</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
