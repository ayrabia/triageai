import { getQueue } from '@/lib/api'
import QueueCard from '@/components/QueueCard'
import AutoRefresh from '@/components/AutoRefresh'
import type { ReferralAction, ReferralSummary } from '@/lib/types'
import { ACTION_CONFIG } from '@/lib/utils'

const TIERS: ReferralAction[] = [
  'FLAGGED FOR PRIORITY REVIEW',
  'SECONDARY APPROVAL NEEDED',
  'STANDARD QUEUE',
]

function countByTier(referrals: ReferralSummary[]) {
  return {
    'FLAGGED FOR PRIORITY REVIEW': referrals.filter((r) => r.action === 'FLAGGED FOR PRIORITY REVIEW').length,
    'SECONDARY APPROVAL NEEDED': referrals.filter((r) => r.action === 'SECONDARY APPROVAL NEEDED').length,
    'STANDARD QUEUE': referrals.filter((r) => r.action === 'STANDARD QUEUE').length,
    unprocessed: referrals.filter((r) => !r.action).length,
  }
}

export default async function QueuePage() {
  let referrals: ReferralSummary[] = []
  let fetchError = false

  try {
    referrals = await getQueue()
  } catch {
    fetchError = true
  }

  const counts = countByTier(referrals)
  const total = referrals.length

  return (
    <div className="min-h-screen bg-slate-50">
      <AutoRefresh />
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-semibold text-slate-900">TriageAI</h1>
                <p className="text-xs text-slate-400">Sacramento ENT</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                Live
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                {total} referral{total !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {fetchError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-700">Could not connect to the API.</p>
            <p className="mt-1 text-xs text-red-500">Make sure the FastAPI server is running on port 8000.</p>
          </div>
        ) : (
          <>
            {/* Tier summary stats */}
            <div className="mb-8 grid grid-cols-3 gap-3">
              {TIERS.map((tier) => {
                const cfg = ACTION_CONFIG[tier]
                return (
                  <div key={tier} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${cfg.dotColor}`} />
                      <span className="text-xs font-medium text-slate-500">{cfg.shortLabel}</span>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{counts[tier]}</p>
                  </div>
                )
              })}
            </div>

            {/* Queue */}
            {referrals.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-sm text-slate-400">No referrals in the queue.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {referrals.map((referral) => (
                  <QueueCard key={referral.id} referral={referral} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
