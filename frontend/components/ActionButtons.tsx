'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateStatus } from '@/lib/api'
import type { ReferralStatus } from '@/lib/types'

interface Props {
  referralId: string
  currentStatus: ReferralStatus
  token: string
  userRole: string
  onRouteClick?: () => void
}

// Actions available to coordinators/admins (non-route)
const COORDINATOR_ACTIONS: { status: ReferralStatus; label: string; variant: 'ghost' | 'danger' | 'muted' }[] = [
  { status: 'reviewed',  label: 'Mark Reviewed', variant: 'ghost' },
  { status: 'escalated', label: 'Escalate',       variant: 'danger' },
  { status: 'archived',  label: 'Archive',        variant: 'muted' },
]

// Actions available to physicians
const PHYSICIAN_ACTIONS: { status: ReferralStatus; label: string; variant: 'ghost' | 'muted' }[] = [
  { status: 'reviewed', label: 'Mark Reviewed', variant: 'ghost' },
  { status: 'archived', label: 'Archive',       variant: 'muted' },
]

const variantClass: Record<string, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-container transition-colors',
  ghost:   'bg-transparent border border-outline-variant/50 text-on-surface hover:bg-surface-container-low transition-colors',
  danger:  'bg-tertiary-container/10 text-tertiary-container border border-tertiary-container/20 hover:bg-tertiary-container/20 transition-colors',
  muted:   'bg-transparent border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-low transition-colors',
}

export default function ActionButtons({ referralId, currentStatus, token, userRole, onRouteClick }: Props) {
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

  async function handleAction(newStatus: ReferralStatus) {
    setLoading(newStatus)
    setError(null)
    try {
      await updateStatus(referralId, newStatus, token)
      router.refresh()
    } catch {
      setError('Failed to update status. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  const isPhysician = userRole === 'physician'

  if (isPhysician) {
    const available = PHYSICIAN_ACTIONS.filter((a) => a.status !== currentStatus)
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          {available.map((action) => (
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

  // Coordinator / Admin view
  const available = COORDINATOR_ACTIONS.filter((a) => a.status !== currentStatus)
  const showRoute = currentStatus !== 'routed' && currentStatus !== 'archived'

  return (
    <div className="flex flex-col gap-3">
      {/* Approve & Route — primary CTA */}
      {showRoute && (
        <button
          onClick={onRouteClick}
          disabled={loading !== null}
          className={`w-full py-2.5 px-4 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${variantClass.primary}`}
        >
          Approve &amp; Route
        </button>
      )}

      {/* Secondary actions */}
      <div className="grid grid-cols-2 gap-2">
        {available.map((action) => (
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
