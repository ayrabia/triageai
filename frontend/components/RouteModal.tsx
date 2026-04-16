'use client'

import { useEffect, useState } from 'react'
import { getPhysicians, routeReferral } from '@/lib/api'
import type { Physician } from '@/lib/types'

interface Props {
  referralId: string
  token: string
  isOpen: boolean
  onClose: () => void
  onRouted: () => void
}

export default function RouteModal({ referralId, token, isOpen, onClose, onRouted }: Props) {
  const [physicians, setPhysicians] = useState<Physician[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setSelected(null)
    setError(null)
    setFetching(true)
    getPhysicians(token)
      .then(setPhysicians)
      .catch(() => setError('Could not load physicians. Please try again.'))
      .finally(() => setFetching(false))
  }, [isOpen, token])

  async function handleRoute() {
    if (!selected) return
    setLoading(true)
    setError(null)
    try {
      await routeReferral(referralId, selected, token)
      onRouted()
      onClose()
    } catch {
      setError('Failed to route referral. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const selectedPhysician = physicians.find((p) => p.id === selected)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-on-surface/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-surface-container-lowest rounded-lg border border-outline-variant/20 shadow-[0_16px_48px_-8px_rgba(0,36,68,0.12)] w-full max-w-sm flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/15">
          <div>
            <h2 className="text-base font-bold tracking-tight text-on-surface">Route to Physician</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Select the physician for this referral</p>
          </div>
          <button
            onClick={onClose}
            className="text-outline hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 flex flex-col gap-3">
          {fetching ? (
            <div className="flex items-center justify-center py-8 gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: '20px' }}>sync</span>
              <span className="text-sm">Loading physicians…</span>
            </div>
          ) : physicians.length === 0 ? (
            <div className="py-8 text-center">
              <span className="material-symbols-outlined text-outline mb-2 block" style={{ fontSize: '24px' }}>person_off</span>
              <p className="text-sm text-on-surface-variant">No physicians provisioned at this clinic.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {physicians.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded border transition-all text-left ${
                    selected === p.id
                      ? 'border-primary bg-primary-fixed/20 text-on-surface'
                      : 'border-outline-variant/20 bg-surface-container-low hover:border-primary/40 hover:bg-surface-container text-on-surface'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{p.email}</p>
                  </div>
                  {selected === p.id && (
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>check_circle</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-error">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/15">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant border border-outline-variant/40 rounded hover:bg-surface-container-low transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRoute}
            disabled={!selected || loading}
            className="px-4 py-2 text-sm font-medium bg-primary text-on-primary rounded hover:bg-primary-container transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Routing…' : selectedPhysician ? `Route to ${selectedPhysician.name.split(' ')[0]}` : 'Route'}
          </button>
        </div>
      </div>
    </div>
  )
}
