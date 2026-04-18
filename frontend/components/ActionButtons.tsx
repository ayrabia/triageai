'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateStatus } from '@/lib/api'
import type { ReferralAction, ReferralStatus } from '@/lib/types'

export const SCHEDULING_WINDOWS = [
  'ASAP — within 48 hours',
  '1–2 weeks',
  '2–4 weeks',
  '1–2 months',
  'Next available appointment',
]

interface Props {
  referralId: string
  currentStatus: ReferralStatus
  currentAction: ReferralAction | null
  token: string
  userRole: string
  onRouteClick?: () => void
}

const btn: Record<string, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary/90 transition-colors',
  ghost:   'bg-transparent border border-outline-variant/50 text-on-surface hover:bg-surface-container-low transition-colors',
  danger:  'bg-tertiary-container/10 text-tertiary-container border border-tertiary-container/20 hover:bg-tertiary-container/20 transition-colors',
  muted:   'bg-transparent border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-low transition-colors',
  success: 'bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80 transition-colors',
}

const BASE = 'py-2 px-3 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'
const WIDE = 'w-full py-2.5 px-4 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'

export default function ActionButtons({
  referralId, currentStatus, currentAction, token, userRole, onRouteClick,
}: Props) {
  const router = useRouter()
  const [schedulingWindow, setSchedulingWindow] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (currentStatus === 'failed') {
    return (
      <p className="text-xs text-error">
        Pipeline failed — check the audit trail for the error, then re-upload the PDF.
      </p>
    )
  }

  if (currentStatus === 'archived') {
    return <p className="text-xs text-on-surface-variant">This referral has been archived.</p>
  }

  if (currentStatus === 'scheduled') {
    return <p className="text-xs text-on-surface-variant">Patient has been scheduled.</p>
  }

  async function act(newStatus: ReferralStatus, extra?: { scheduling_window?: string }) {
    setLoading(newStatus)
    setError(null)
    try {
      await updateStatus(referralId, newStatus, token, extra)
      router.refresh()
    } catch {
      setError('Failed to update. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  const busy = loading !== null

  // ── PHYSICIAN ──────────────────────────────────────────────────────────────
  if (userRole === 'physician') {
    if (currentStatus === 'escalated_to_md') {
      return (
        <p className="text-xs text-on-surface-variant italic">
          Use the MD decision panel below to submit your response.
        </p>
      )
    }
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          {currentStatus !== 'reviewed' && (
            <button onClick={() => act('reviewed')} disabled={busy} className={`${BASE} ${btn.ghost}`}>
              {loading === 'reviewed' ? 'Saving…' : 'Mark Reviewed'}
            </button>
          )}
          <button onClick={() => act('archived')} disabled={busy} className={`${BASE} ${btn.muted}`}>
            {loading === 'archived' ? 'Saving…' : 'Archive'}
          </button>
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    )
  }

  // ── COORDINATOR ────────────────────────────────────────────────────────────
  if (userRole === 'coordinator') {
    if (currentStatus === 'approved_for_scheduling') {
      return (
        <div className="flex flex-col gap-3">
          <button onClick={() => act('scheduled')} disabled={busy} className={`${WIDE} ${btn.success}`}>
            {loading === 'scheduled' ? 'Saving…' : 'Confirm Scheduled'}
          </button>
          <button onClick={() => act('archived')} disabled={busy} className={`${WIDE} ${btn.muted}`}>
            {loading === 'archived' ? 'Saving…' : 'Archive'}
          </button>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => act('archived')} disabled={busy} className={`${BASE} ${btn.muted}`}>
          {loading === 'archived' ? 'Saving…' : 'Archive'}
        </button>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    )
  }

  // ── REVIEWER / ADMIN ───────────────────────────────────────────────────────

  // MD responded — route to scheduler (window already in DB from physician)
  if (currentStatus === 'md_reviewed') {
    return (
      <div className="flex flex-col gap-3">
        <button
          onClick={() => act('approved_for_scheduling')}
          disabled={busy}
          className={`${WIDE} ${btn.primary}`}
        >
          {loading === 'approved_for_scheduling' ? 'Saving…' : 'Send to Scheduler'}
        </button>
        <button onClick={() => act('archived')} disabled={busy} className={`${BASE} ${btn.muted}`}>
          {loading === 'archived' ? 'Saving…' : 'Archive'}
        </button>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    )
  }

  // Awaiting MD — can only archive (cancel escalation)
  if (currentStatus === 'escalated_to_md') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-on-surface-variant italic">Awaiting MD decision.</p>
        <button onClick={() => act('archived')} disabled={busy} className={`${BASE} ${btn.muted}`}>
          {loading === 'archived' ? 'Saving…' : 'Archive'}
        </button>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    )
  }

  // Approved for scheduling — admin can also confirm
  if (currentStatus === 'approved_for_scheduling') {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => act('scheduled')} disabled={busy} className={`${WIDE} ${btn.success}`}>
          {loading === 'scheduled' ? 'Saving…' : 'Confirm Scheduled'}
        </button>
        <button onClick={() => act('archived')} disabled={busy} className={`${WIDE} ${btn.muted}`}>
          {loading === 'archived' ? 'Saving…' : 'Archive'}
        </button>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    )
  }

  // Ready for triage — primary REVIEWER workflow
  if (currentStatus === 'ready' || currentStatus === 'routed') {
    const isPriority = currentAction === 'PRIORITY REVIEW'
    return (
      <div className="flex flex-col gap-3">
        {/* Scheduling window selector */}
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
            Scheduling window
          </label>
          <select
            value={schedulingWindow}
            onChange={(e) => setSchedulingWindow(e.target.value)}
            className="w-full rounded border border-outline-variant/50 bg-surface text-sm text-on-surface px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Select window…</option>
            {SCHEDULING_WINDOWS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => act('approved_for_scheduling', { scheduling_window: schedulingWindow })}
          disabled={busy || !schedulingWindow}
          className={`${WIDE} ${btn.primary}`}
        >
          {loading === 'approved_for_scheduling' ? 'Saving…' : 'Approve for Scheduling'}
        </button>

        {isPriority && (
          <button onClick={onRouteClick} disabled={busy} className={`${WIDE} ${btn.danger}`}>
            Escalate to MD
          </button>
        )}

        <button onClick={() => act('archived')} disabled={busy} className={`${BASE} ${btn.muted}`}>
          {loading === 'archived' ? 'Saving…' : 'Archive'}
        </button>

        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    )
  }

  // Fallback for any other status (reviewed, etc.)
  return (
    <div className="flex flex-col gap-3">
      <button onClick={() => act('archived')} disabled={busy} className={`${BASE} ${btn.muted}`}>
        {loading === 'archived' ? 'Saving…' : 'Archive'}
      </button>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
