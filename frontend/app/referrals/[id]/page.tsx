'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { getReferral, getPdfUrl } from '@/lib/api'
import PriorityBadge from '@/components/PriorityBadge'
import ActionButtons from '@/components/ActionButtons'
import RouteModal from '@/components/RouteModal'
import PhysicianResponsePanel from '@/components/PhysicianResponsePanel'
import NotesThread from '@/components/NotesThread'
import EpicPanel from '@/components/EpicPanel'
import { ACTION_CONFIG, STATUS_CONFIG, formatDateTime, formatRelativeTime } from '@/lib/utils'
import type { ReferralDetail, ReferralNote } from '@/lib/types'

interface Props {
  params: { id: string }
}

export default function ReferralDetailPage({ params }: Props) {
  const { user, authLoading, logout } = useAuth()
  const router = useRouter()

  const [referral, setReferral] = useState<ReferralDetail | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [routeModalOpen, setRouteModalOpen] = useState(false)
  const [escalationMsg, setEscalationMsg] = useState<string | null>(null)
  const [notes, setNotes] = useState<ReferralNote[]>([])

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }

    getReferral(params.id)
      .then(setReferral)
      .catch((err) => {
        if (err instanceof Error) {
          if (err.message === 'UNAUTHORIZED') { logout(); router.replace('/login') }
          else if (err.message === 'NOT_FOUND' || err.message === 'FORBIDDEN') setNotFound(true)
        }
      })
      .finally(() => setPageLoading(false))
  }, [authLoading, user, params.id, logout, router])

  if (authLoading || pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <span className="material-symbols-outlined text-primary animate-spin" style={{ fontSize: '32px' }}>sync</span>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface">
        <p className="text-sm font-medium text-on-surface">Referral not found.</p>
        <Link href="/" className="text-sm text-primary hover:underline">Back to queue</Link>
      </div>
    )
  }

  if (!referral) return null

  const cfg = referral.action ? ACTION_CONFIG[referral.action] : null
  const statusCfg = STATUS_CONFIG[referral.status]

  async function handleTogglePdf() {
    if (pdfOpen) { setPdfOpen(false); return }
    if (pdfUrl) { setPdfOpen(true); return }
    setPdfLoading(true)
    setPdfError(null)
    try {
      const url = await getPdfUrl(params.id)
      setPdfUrl(url)
      setPdfOpen(true)
    } catch {
      setPdfError('Could not load the document. Please try again.')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface">

      <RouteModal
        referralId={referral.id}
        isOpen={routeModalOpen}
        onClose={() => setRouteModalOpen(false)}
        onRouted={(physicianName) => {
          setEscalationMsg(`Escalated to ${physicianName} — referral added to their queue`)
          setTimeout(() => { setEscalationMsg(null); router.refresh() }, 2500)
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md shadow-header">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
              Queue
            </Link>
            <span className="h-5 w-px bg-outline-variant/40" />
            <PriorityBadge action={referral.action} />
          </div>
          <span className={`rounded px-2.5 py-1 text-xs font-medium ${statusCfg.color}`}>
            {statusCfg.label}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">

        {/* Referral reason banner */}
        <div className={`bg-surface-container-lowest rounded-lg border border-outline-variant/15 border-l-[3px] p-6 mb-6 ${cfg?.borderColor ?? 'border-l-outline-variant'}`}>
          <div className="flex justify-between items-start gap-4">
            <div>
              <p className="text-xs font-medium text-on-surface-variant mb-2 uppercase tracking-wide">Referral Reason</p>
              <h1 className="text-xl font-bold tracking-tight text-on-surface leading-snug">
                {referral.referral_reason ?? 'No referral reason extracted'}
              </h1>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-on-surface-variant">Received {formatRelativeTime(referral.received_at)}</p>
              <p className="text-xs text-outline mt-0.5">{formatDateTime(referral.received_at)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-outline">
            {referral.processed_at && <span>Processed {formatRelativeTime(referral.processed_at)}</span>}
            {referral.processing_time_ms && <span>{(referral.processing_time_ms / 1000).toFixed(1)}s pipeline</span>}
          </div>
        </div>

        {/* AI Summary */}
        {referral.summary && (
          <div className="bg-primary-container/5 border border-primary-container/10 rounded-lg p-5 mb-8 flex items-start gap-4">
            <span className="material-symbols-outlined fill text-primary mt-0.5" style={{ fontSize: '20px' }}>auto_awesome</span>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">AI Triage Summary</p>
              <p className="text-sm text-on-surface-variant leading-relaxed">{referral.summary}</p>
            </div>
          </div>
        )}

        {/* Two-column grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">

          {/* LEFT — 7 cols */}
          <div className="lg:col-span-7 flex flex-col gap-6">

            {/* Classification */}
            <section className="bg-surface-container-lowest rounded-lg border border-outline-variant/15 p-6">
              <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4 pb-3 border-b border-outline-variant/15">
                Classification
              </h2>
              {referral.reasoning && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-on-surface-variant mb-2">Reasoning</p>
                  <p className="text-sm leading-relaxed text-on-surface">{referral.reasoning}</p>
                </div>
              )}
              {referral.matched_criteria && referral.matched_criteria.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-on-surface-variant mb-2">Matched Criteria</p>
                  <ul className="flex flex-col gap-2">
                    {referral.matched_criteria.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-on-surface">
                        <span className="material-symbols-outlined text-tertiary-container mt-0.5 shrink-0" style={{ fontSize: '16px' }}>warning</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {referral.evidence && referral.evidence.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-on-surface-variant mb-2">Supporting Evidence</p>
                  <ul className="flex flex-col gap-2">
                    {referral.evidence.map((e, i) => (
                      <li key={i} className="bg-surface-container-low rounded px-3 py-2 text-xs italic leading-relaxed text-on-surface-variant border border-outline-variant/10">
                        "{e}"
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Urgency labels — only for SECONDARY APPROVAL */}
            {referral.provider_urgency_label && (
              <section className="bg-surface-container-lowest rounded-lg border border-outline-variant/15 p-5">
                <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4">
                  Urgency Labels
                </h2>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-on-surface-variant">Referring provider</span>
                    <span className={`rounded px-2.5 py-1 text-xs font-semibold capitalize ${
                      ['urgent', 'stat'].includes(referral.provider_urgency_label.label.toLowerCase())
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'bg-surface-container-high text-on-surface-variant'
                    }`}>
                      {referral.referring_clinic_classification ?? referral.provider_urgency_label.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-on-surface-variant">TriageAI</span>
                    <PriorityBadge action={referral.action} size="sm" />
                  </div>
                  {referral.action === 'SECONDARY APPROVAL' && (
                    <div className="flex items-start gap-3 mt-1 bg-secondary-container/20 border border-secondary-container/40 rounded p-3">
                      <span className="material-symbols-outlined text-on-secondary-container mt-0.5 shrink-0" style={{ fontSize: '16px' }}>gavel</span>
                      <p className="text-xs leading-relaxed text-on-secondary-container">
                        Provider marked urgent but no clinical criteria matched. Secondary review required before scheduling.
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-outline">
                    Label found in: {referral.provider_urgency_label.source}
                  </p>
                </div>
              </section>
            )}

            {/* Next steps */}
            {referral.next_steps && (
              <section className={`rounded-lg border border-outline-variant/15 p-5 ${cfg?.sectionBg ?? 'bg-surface-container-lowest'}`}>
                <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
                  Next Steps
                </h2>
                <p className="text-sm font-medium leading-relaxed text-on-surface">{referral.next_steps}</p>
                {referral.recommended_window && (
                  <div className="mt-3 flex items-center gap-2 text-sm font-medium text-primary">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>calendar_today</span>
                    Schedule: {referral.recommended_window}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* RIGHT — 5 cols */}
          <div className="lg:col-span-5 flex flex-col gap-6">

            {/* Clinical findings */}
            {referral.relevant_clinical_findings && referral.relevant_clinical_findings.length > 0 && (
              <section className="bg-surface-container-lowest rounded-lg border border-outline-variant/15 p-5">
                <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4 pb-3 border-b border-outline-variant/15">
                  Key Clinical Findings
                </h2>
                <ul className="flex flex-col gap-2">
                  {referral.relevant_clinical_findings.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-on-surface">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Imaging */}
            {referral.imaging_summary && (
              <section className="bg-surface-container-lowest rounded-lg border border-outline-variant/15 p-5">
                <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Imaging</h2>
                <p className="text-sm leading-relaxed text-on-surface">{referral.imaging_summary}</p>
              </section>
            )}

            {/* Missing information */}
            {referral.missing_information && referral.missing_information.length > 0 && (
              <section className="bg-[#FFF4E5] rounded-lg border border-[#FFB74D]/50 p-5">
                <h2 className="text-sm font-semibold text-[#E65100] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>help_center</span>
                  Missing Information
                </h2>
                <ul className="flex flex-col gap-1.5">
                  {referral.missing_information.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[#E65100]/90">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F57C00] mt-1.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Actions */}
            <section className="bg-surface-container-lowest rounded-lg border border-outline-variant/15 p-5">
              <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4">
                Triage Actions
              </h2>
              {escalationMsg ? (
                <div className="flex items-start gap-3 rounded border border-secondary-container/40 bg-secondary-container/20 px-4 py-3">
                  <span className="material-symbols-outlined text-secondary-container mt-0.5" style={{ fontSize: '18px' }}>check_circle</span>
                  <p className="text-sm font-medium text-on-surface">{escalationMsg}</p>
                </div>
              ) : (
                <ActionButtons
                  referralId={referral.id}
                  currentStatus={referral.status}
                  currentAction={referral.action}
                  userRole={user!.role}
                  onRouteClick={() => setRouteModalOpen(true)}
                />
              )}
            </section>

            {/* MD Decision panel — PHYSICIAN responds when escalated to them */}
            {user!.role === 'physician'
              && referral.status === 'escalated_to_md'
              && referral.routed_to === user!.id && (
              <PhysicianResponsePanel
                referralId={referral.id}
                onSuccess={() => getReferral(params.id).then(setReferral)}
              />
            )}

            {/* MD Decision result — REVIEWER sees physician's decision */}
            {(user!.role === 'reviewer' || user!.role === 'admin')
              && referral.status === 'md_reviewed'
              && (referral.physician_note || referral.scheduling_window) && (
              <section className="bg-primary-fixed/5 border border-primary-container/20 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>medical_services</span>
                  MD Decision
                  {referral.routed_to_name && (
                    <span className="text-xs font-normal text-on-surface-variant normal-case tracking-normal">
                      — {referral.routed_to_name}
                    </span>
                  )}
                </h2>
                {referral.scheduling_window && (
                  <div className="flex items-center gap-1.5 text-sm font-medium text-primary mb-3">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>calendar_today</span>
                    {referral.scheduling_window}
                  </div>
                )}
                {referral.physician_note && (
                  <p className="text-sm leading-relaxed text-on-surface">{referral.physician_note}</p>
                )}
              </section>
            )}

            {/* Scheduling window — COORDINATOR sees when ready to schedule */}
            {user!.role === 'coordinator'
              && referral.status === 'approved_for_scheduling'
              && referral.scheduling_window && (
              <section className="bg-primary-fixed/5 border border-primary-container/20 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
                  Scheduling Window
                </h2>
                <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>calendar_today</span>
                  {referral.scheduling_window}
                </div>
                {referral.physician_note && (
                  <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">{referral.physician_note}</p>
                )}
              </section>
            )}
          </div>
        </div>

        {/* Notes thread */}
        {referral.action && (
          <div className="mt-8">
            <section className="bg-surface-container-lowest rounded-lg border border-outline-variant/15 p-6">
              <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4 pb-3 border-b border-outline-variant/15 flex items-center gap-2">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chat</span>
                Notes & Communication
              </h2>
              <NotesThread
                referralId={referral.id}
                onNotesLoaded={setNotes}
              />
            </section>
          </div>
        )}

        {/* Epic export panel */}
        {referral.action && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>screenshot_monitor</span>
              Epic Export
            </h2>
            <EpicPanel referral={referral} notes={notes} />
          </div>
        )}

        {/* PDF viewer */}
        <div className="mt-8">
          <button
            onClick={handleTogglePdf}
            disabled={pdfLoading}
            className="flex items-center gap-2 text-primary font-medium text-sm hover:underline mb-4 disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>picture_as_pdf</span>
            {pdfLoading ? 'Loading…' : pdfOpen ? 'Hide Referral Document' : 'View Referral Document'}
            {!pdfLoading && (
              <span
                className={`material-symbols-outlined text-outline transition-transform ${pdfOpen ? 'rotate-180' : ''}`}
                style={{ fontSize: '16px' }}
              >
                expand_more
              </span>
            )}
          </button>
          {pdfError && <p className="mb-3 text-xs text-error">{pdfError}</p>}
          {pdfOpen && pdfUrl && (
            <div className="overflow-hidden rounded-lg border border-outline-variant/20" style={{ boxShadow: '0 4px 20px -4px rgba(0,36,68,0.04)' }}>
              <iframe src={pdfUrl} title="Referral document" className="h-[800px] w-full" />
            </div>
          )}
        </div>

        {/* Footer metadata */}
        <div className="mt-8 pt-6 border-t border-outline-variant/15 flex flex-wrap gap-4 text-xs text-outline">
          <span>ID: {referral.id}</span>
          <span>Model: {referral.model_used ?? '—'}</span>
          <span>Pipeline: {referral.pipeline_version ?? '—'}</span>
          {referral.reviewed_at && <span>Reviewed: {formatDateTime(referral.reviewed_at)}</span>}
        </div>
      </main>
    </div>
  )
}
