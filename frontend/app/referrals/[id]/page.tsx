'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { getReferral, getPdfUrl } from '@/lib/api'
import PriorityBadge from '@/components/PriorityBadge'
import ActionButtons from '@/components/ActionButtons'
import { ACTION_CONFIG, STATUS_CONFIG, formatDateTime, formatRelativeTime } from '@/lib/utils'
import type { ReferralDetail } from '@/lib/types'

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

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/login')
      return
    }

    getReferral(params.id, user.idToken)
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
        <p className="text-sm font-medium text-slate-600">Referral not found.</p>
        <Link href="/" className="text-sm text-indigo-600 hover:underline">Back to queue</Link>
      </div>
    )
  }

  if (!referral) return null

  const cfg = referral.action ? ACTION_CONFIG[referral.action] : null
  const statusCfg = STATUS_CONFIG[referral.status]

  async function handleTogglePdf() {
    if (pdfOpen) {
      setPdfOpen(false)
      return
    }
    if (pdfUrl) {
      setPdfOpen(true)
      return
    }
    setPdfLoading(true)
    setPdfError(null)
    try {
      const url = await getPdfUrl(params.id, user!.idToken)
      setPdfUrl(url)
      setPdfOpen(true)
    } catch {
      setPdfError('Could not load the document. Please try again.')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Queue
              </Link>
              <span className="text-slate-200">/</span>
              <PriorityBadge action={referral.action} />
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Referral reason title */}
        <div className={`mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm border-l-4 ${cfg?.borderColor ?? 'border-l-slate-200'}`}>
          <p className="mb-1 text-xs text-slate-400">Referral Reason</p>
          <h2 className="text-lg font-semibold leading-snug text-slate-900">
            {referral.referral_reason ?? 'No referral reason extracted'}
          </h2>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
            <span>Received {formatRelativeTime(referral.received_at)} · {formatDateTime(referral.received_at)}</span>
            {referral.processed_at && <span>Processed {formatRelativeTime(referral.processed_at)}</span>}
            {referral.processing_time_ms && <span>{(referral.processing_time_ms / 1000).toFixed(1)}s pipeline</span>}
          </div>
        </div>

        {/* AI Summary */}
        {referral.summary && (
          <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50 p-5">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-500">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              AI Summary
            </p>
            <p className="text-sm leading-relaxed text-indigo-900">{referral.summary}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-6">

            {/* Classification */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Classification
              </h3>

              {referral.reasoning && (
                <div className="mb-4">
                  <p className="mb-1 text-xs font-medium text-slate-500">Reasoning</p>
                  <p className="text-sm leading-relaxed text-slate-700">{referral.reasoning}</p>
                </div>
              )}

              {referral.matched_criteria && referral.matched_criteria.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium text-slate-500">Matched Criteria</p>
                  <ul className="flex flex-col gap-1.5">
                    {referral.matched_criteria.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {referral.evidence && referral.evidence.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500">Supporting Evidence</p>
                  <ul className="flex flex-col gap-2">
                    {referral.evidence.map((e, i) => (
                      <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-xs italic leading-relaxed text-slate-600">
                        "{e}"
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Provider label vs TriageAI — especially important for SECONDARY APPROVAL */}
            {referral.provider_urgency_label && (
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Urgency Labels
                </h3>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Referring provider</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize
                      ${['urgent', 'stat'].includes(referral.provider_urgency_label.label.toLowerCase())
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                      }`}>
                      {referral.referring_clinic_classification ?? referral.provider_urgency_label.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">TriageAI</span>
                    <PriorityBadge action={referral.action} size="sm" />
                  </div>
                  {referral.action === 'SECONDARY APPROVAL' && (
                    <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                      Provider marked urgent but no clinical criteria matched. Secondary review required before scheduling.
                    </p>
                  )}
                  <p className="text-xs text-slate-400">
                    Label found in: {referral.provider_urgency_label.source}
                  </p>
                </div>
              </section>
            )}

            {/* Next Steps */}
            {referral.next_steps && (
              <section className={`rounded-xl border p-5 shadow-sm ${cfg?.headerBg ?? 'bg-white'} border-slate-200`}>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Next Steps
                </h3>
                <p className="text-sm font-medium leading-relaxed text-slate-800">{referral.next_steps}</p>
                {referral.recommended_window && (
                  <div className="mt-3 flex items-center gap-2">
                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5" />
                    </svg>
                    <span className="text-xs font-medium text-slate-600">
                      Schedule: {referral.recommended_window}
                    </span>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-6">

            {referral.relevant_clinical_findings && referral.relevant_clinical_findings.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Relevant Clinical Findings
                </h3>
                <ul className="flex flex-col gap-2">
                  {referral.relevant_clinical_findings.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-slate-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      {f}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {referral.imaging_summary && (
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Imaging</h3>
                <p className="text-sm leading-relaxed text-slate-700">{referral.imaging_summary}</p>
              </section>
            )}

            {referral.missing_information && referral.missing_information.length > 0 && (
              <section className="rounded-xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-600">
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  Missing Information
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {referral.missing_information.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-orange-800">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Actions</h3>
              <ActionButtons
                referralId={referral.id}
                currentStatus={referral.status}
                token={user!.idToken}
              />
            </section>
          </div>
        </div>

        {/* PDF viewer */}
        <div className="mt-6">
          <button
            onClick={handleTogglePdf}
            disabled={pdfLoading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            {pdfLoading ? 'Loading…' : pdfOpen ? 'Hide Referral Document' : 'View Referral Document'}
            {!pdfLoading && (
              <svg
                className={`h-3.5 w-3.5 text-slate-400 transition-transform ${pdfOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            )}
          </button>
          {pdfError && <p className="mt-2 text-xs text-red-600">{pdfError}</p>}
          {pdfOpen && pdfUrl && (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <iframe
                src={pdfUrl}
                title="Referral document"
                className="h-[800px] w-full"
              />
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-4 border-t border-slate-200 pt-6 text-xs text-slate-400">
          <span>ID: {referral.id}</span>
          <span>Model: {referral.model_used ?? '—'}</span>
          <span>Pipeline: {referral.pipeline_version ?? '—'}</span>
          {referral.reviewed_at && <span>Reviewed: {formatDateTime(referral.reviewed_at)}</span>}
        </div>
      </main>
    </div>
  )
}
