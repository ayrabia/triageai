'use client'

import type { ReferralDetail, ReferralNote } from '@/lib/types'

const ROLE_LABEL: Record<string, string> = {
  physician:   'MD',
  reviewer:    'Triage Team',
  coordinator: 'Scheduler',
  admin:       'Admin',
  superadmin:  'Admin',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

const TIER_LABEL: Record<string, string> = {
  'PRIORITY REVIEW':    'PRIORITY REVIEW',
  'SECONDARY APPROVAL': 'SECONDARY APPROVAL',
  'STANDARD QUEUE':     'STANDARD QUEUE',
}

interface Props {
  referral: ReferralDetail
  notes: ReferralNote[]
}

export default function EpicPanel({ referral, notes }: Props) {
  return (
    <div
      id="epic-panel"
      className="bg-white border border-outline-variant/30 rounded-lg overflow-hidden"
    >
      {/* Header */}
      <div className="bg-surface-container-low border-b border-outline-variant/20 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>assignment</span>
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Epic Export</span>
        </div>
        <span className="text-xs text-outline">Screenshot and upload to Epic</span>
      </div>

      <div className="px-6 py-5 flex flex-col gap-5">

        {/* Patient info */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide mb-0.5">Patient Name</p>
            <p className="text-sm font-semibold text-on-surface">{referral.patient_name ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide mb-0.5">Date of Birth</p>
            <p className="text-sm text-on-surface">{referral.patient_dob ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide mb-0.5">Referring Provider</p>
            <p className="text-sm text-on-surface">{referral.referring_provider ?? '—'}</p>
          </div>
        </div>

        <div className="h-px bg-outline-variant/15" />

        {/* Referral info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide mb-0.5">Referral Received</p>
            <p className="text-sm text-on-surface">{formatDate(referral.received_at)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide mb-0.5">Filename</p>
            <p className="text-sm text-on-surface">{referral.filename ?? '—'}</p>
          </div>
        </div>

        <div className="h-px bg-outline-variant/15" />

        {/* AI Classification */}
        <div>
          <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide mb-2">AI Triage Classification</p>
          <div className="flex items-center gap-2 mb-2">
            {referral.action && (
              <span className={`rounded px-2 py-0.5 text-xs font-bold ${
                referral.action === 'PRIORITY REVIEW'
                  ? 'bg-[#FFEBEE] text-[#B71C1C]'
                  : referral.action === 'SECONDARY APPROVAL'
                  ? 'bg-[#FFF8E1] text-[#E65100]'
                  : 'bg-[#E8F5E9] text-[#1B5E20]'
              }`}>
                {TIER_LABEL[referral.action]}
              </span>
            )}
          </div>
          {referral.referral_reason && (
            <p className="text-sm font-medium text-on-surface mb-1">{referral.referral_reason}</p>
          )}
          {referral.summary && (
            <p className="text-sm text-on-surface-variant leading-relaxed">{referral.summary}</p>
          )}
        </div>

        {/* Matched criteria */}
        {referral.matched_criteria && referral.matched_criteria.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5">Matched Urgent Criteria</p>
            <ul className="flex flex-col gap-1">
              {referral.matched_criteria.map((c, i) => (
                <li key={i} className="text-sm text-on-surface flex items-start gap-1.5">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#B71C1C] shrink-0" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Scheduling window */}
        {(referral.scheduling_window || referral.recommended_window) && (
          <div>
            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Scheduling Window</p>
            <p className="text-sm font-medium text-on-surface">
              {referral.scheduling_window ?? referral.recommended_window}
            </p>
          </div>
        )}

        {/* Notes thread */}
        {notes.length > 0 && (
          <>
            <div className="h-px bg-outline-variant/15" />
            <div>
              <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide mb-3">
                Communication Log ({notes.length} {notes.length === 1 ? 'note' : 'notes'})
              </p>
              <div className="flex flex-col gap-3">
                {notes.map((note, i) => (
                  <div key={note.id} className={`flex flex-col gap-0.5 ${i < notes.length - 1 ? 'pb-3 border-b border-outline-variant/10' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-on-surface">{note.author_name}</span>
                      <span className="text-[10px] text-outline">
                        {ROLE_LABEL[note.author_role] ?? note.author_role}
                      </span>
                      <span className="text-[10px] text-outline">{formatTime(note.created_at)}</span>
                    </div>
                    <p className="text-sm text-on-surface leading-relaxed">{note.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="h-px bg-outline-variant/15" />
        <div className="flex justify-between items-center text-[10px] text-outline">
          <span>Generated by TriageAI · ID: {referral.id.slice(0, 8)}…</span>
          <span>Processed {referral.processed_at ? formatDate(referral.processed_at) : '—'}</span>
        </div>
      </div>
    </div>
  )
}
