'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateStatus } from '@/lib/api'
import type { ReferralStatus } from '@/lib/types'

interface Props {
  referralId: string
  currentStatus: ReferralStatus
  token: string
}

const ACTIONS: { status: ReferralStatus; label: string; variant: 'primary' | 'ghost' | 'danger' | 'muted' }[] = [
  { status: 'reviewed',  label: 'Mark Reviewed',  variant: 'ghost' },
  { status: 'approved',  label: 'Approve & Route', variant: 'primary' },
  { status: 'escalated', label: 'Escalate',        variant: 'danger' },
  { status: 'archived',  label: 'Archive',         variant: 'muted' },
]

const variantClass: Record<string, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-container transition-colors',
  ghost:   'bg-transparent border border-outline-variant/50 text-on-surface hover:bg-surface-container-low transition-colors',
  danger:  'bg-tertiary-container/10 text-tertiary-container border border-tertiary-container/20 hover:bg-tertiary-container/20 transition-colors',
  muted:   'bg-transparent border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-low transition-colors',
}

export default function ActionButtons({ referralId, currentStatus, token }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<ReferralStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (currentStatus === 'failed') {
    return (
      <p className="text-xs text-error">
        Pipeline failed — check the audit trail for the error, then re-upload the PDF.
      </p>
    )
  }

  async function handleAction(status: ReferralStatus) {
    setLoading(status)
    setError(null)
    try {
      await updateStatus(referralId, status, token)
      router.refresh()
    } catch {
      setError('Failed to update status. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  const available = ACTIONS.filter((a) => a.status !== currentStatus)

  return (
    <div className="flex flex-col gap-3">
      {/* Primary action first, full width */}
      {available.filter((a) => a.variant === 'primary').map((action) => (
        <button
          key={action.status}
          onClick={() => handleAction(action.status)}
          disabled={loading !== null}
          className={`w-full py-2.5 px-4 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${variantClass.primary}`}
        >
          {loading === action.status ? 'Saving…' : action.label}
        </button>
      ))}
      {/* Secondary actions in a grid */}
      <div className="grid grid-cols-2 gap-2">
        {available.filter((a) => a.variant !== 'primary').map((action) => (
          <button
            key={action.status}
            onClick={() => handleAction(action.status)}
            disabled={loading !== null}
            className={`py-2 px-3 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${variantClass[action.variant]}`}
          >
            {loading === action.status ? 'Saving…' : action.label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
