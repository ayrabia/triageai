'use client'

import { useState } from 'react'
import { respondToReferral } from '@/lib/api'
import { SCHEDULING_WINDOWS } from '@/components/ActionButtons'

interface Props {
  referralId: string
  onSuccess: () => void
}

export default function PhysicianResponsePanel({ referralId, onSuccess }: Props) {
  const [schedulingWindow, setSchedulingWindow] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!schedulingWindow) return
    setLoading(true)
    setError(null)
    try {
      await respondToReferral(referralId, { physician_note: note, scheduling_window: schedulingWindow })
      onSuccess()
    } catch {
      setError('Failed to submit. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="bg-surface-container-lowest rounded-lg border border-outline-variant/15 p-5">
      <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4 pb-3 border-b border-outline-variant/15 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: '16px' }}>medical_services</span>
        MD Decision
      </h2>

      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
            Scheduling window <span className="text-error">*</span>
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

        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
            Clinical decision notes
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Suspected malignancy — schedule within the week for biopsy review. Priority over existing queue."
            rows={3}
            className="w-full rounded border border-outline-variant/50 bg-surface text-sm text-on-surface px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!schedulingWindow || loading}
          className="w-full py-2.5 px-4 rounded text-sm font-medium bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Submitting…' : 'Submit Decision'}
        </button>

        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    </section>
  )
}
