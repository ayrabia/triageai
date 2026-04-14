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

const ACTIONS: { status: ReferralStatus; label: string; style: string }[] = [
  {
    status: 'reviewed',
    label: 'Mark Reviewed',
    style: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  },
  {
    status: 'escalated',
    label: 'Escalate',
    style: 'bg-red-600 hover:bg-red-700 text-white',
  },
  {
    status: 'approved',
    label: 'Approve & Schedule',
    style: 'bg-green-600 hover:bg-green-700 text-white',
  },
  {
    status: 'archived',
    label: 'Archive',
    style: 'border border-slate-300 hover:bg-slate-50 text-slate-600',
  },
]

export default function ActionButtons({ referralId, currentStatus, token }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<ReferralStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  // Failed referrals need pipeline retry, not a status action
  if (currentStatus === 'failed') {
    return (
      <p className="text-xs text-red-600">
        Pipeline failed — check the audit trail for the error, then re-upload the PDF.
      </p>
    )
  }

  const available = ACTIONS.filter((a) => a.status !== currentStatus)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {available.map((action) => (
          <button
            key={action.status}
            onClick={() => handleAction(action.status)}
            disabled={loading !== null}
            className={`
              rounded-lg px-4 py-2 text-sm font-medium transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              ${action.style}
            `}
          >
            {loading === action.status ? 'Saving…' : action.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
