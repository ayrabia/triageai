'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  coordinator: 'Coordinator',
  reviewer: 'Reviewer',
  physician: 'Physician',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'text-primary bg-primary-fixed/20',
  coordinator: 'text-tertiary bg-tertiary-container/30',
  reviewer: 'text-secondary bg-secondary-container/30',
  physician: 'text-on-surface bg-surface-container-high',
}

const INVITABLE_ROLES = ['coordinator', 'reviewer', 'physician'] as const

export default function TeamPage() {
  const { user, authLoading, logout } = useAuth()
  const router = useRouter()

  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)

  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<typeof INVITABLE_ROLES[number]>('coordinator')
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${user.idToken}` },
      })
      if (res.ok) setMembers(await res.json())
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    if (!['admin', 'superadmin'].includes(user.role)) { router.replace('/'); return }
    fetchMembers()
  }, [authLoading, user, router, fetchMembers])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFormLoading(true)
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user!.idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: inviteName, email: inviteEmail, role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.detail ?? data.error); return }
      setShowInvite(false)
      setInviteName(''); setInviteEmail(''); setInviteRole('coordinator')
      fetchMembers()
    } catch { setFormError('Something went wrong. Please try again.') }
    finally { setFormLoading(false) }
  }

  async function handleToggle(member: TeamMember) {
    setTogglingId(member.id)
    try {
      const res = await fetch(`/api/users/${member.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user!.idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !member.is_active }),
      })
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) => m.id === member.id ? { ...m, is_active: !m.is_active } : m)
        )
      }
    } finally {
      setTogglingId(null)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <span className="material-symbols-outlined text-primary animate-spin" style={{ fontSize: '32px' }}>sync</span>
      </div>
    )
  }

  const inputClass = "block w-full rounded border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"

  const active = members.filter((m) => m.is_active)
  const inactive = members.filter((m) => !m.is_active)

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md shadow-header">
        <div className="mx-auto max-w-4xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-xl font-black uppercase tracking-tighter text-primary">TriageAI</button>
            <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded">Team</span>
          </div>
          <button onClick={() => { logout(); router.replace('/login') }}
            className="text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-primary">Team</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">{active.length} active member{active.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => { setFormError(null); setShowInvite(true) }}
            className="flex items-center gap-2 bg-primary text-on-primary text-sm font-medium px-4 py-2 rounded hover:bg-primary-container transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>person_add</span>
            Invite Member
          </button>
        </div>

        {members.length === 0 ? (
          <div className="py-24 flex flex-col items-center text-center">
            <span className="material-symbols-outlined text-outline mb-4" style={{ fontSize: '32px' }}>group</span>
            <p className="text-sm font-semibold text-on-surface">No team members yet</p>
            <p className="text-xs text-on-surface-variant mt-1">Invite your first team member to get started.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {active.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-3">Active</h2>
                <div className="flex flex-col gap-2">
                  {active.map((m) => (
                    <MemberRow key={m.id} member={m} toggling={togglingId === m.id} onToggle={handleToggle} currentUserId={user!.id} />
                  ))}
                </div>
              </section>
            )}
            {inactive.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-3">Deactivated</h2>
                <div className="flex flex-col gap-2">
                  {inactive.map((m) => (
                    <MemberRow key={m.id} member={m} toggling={togglingId === m.id} onToggle={handleToggle} currentUserId={user!.id} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-surface-container-lowest rounded-xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-on-surface">Invite Team Member</h2>
              <button onClick={() => setShowInvite(false)} className="text-outline hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Full Name</label>
                <input required value={inviteName} onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Dr. Jane Smith" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Email Address</label>
                <input required type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="jane@clinic.com" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as typeof INVITABLE_ROLES[number])} className={inputClass}>
                  {INVITABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-on-surface-variant">An invite email with a temporary password will be sent automatically.</p>
              {formError && <p className="text-xs text-error">{formError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowInvite(false)}
                  className="flex-1 py-2 rounded border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={formLoading}
                  className="flex-1 py-2 rounded bg-primary text-on-primary text-sm font-medium hover:bg-primary-container disabled:opacity-50 transition-colors">
                  {formLoading ? 'Sending invite…' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function MemberRow({
  member,
  toggling,
  onToggle,
  currentUserId,
}: {
  member: TeamMember
  toggling: boolean
  onToggle: (m: TeamMember) => void
  currentUserId: string
}) {
  const isAdmin = ['admin', 'superadmin'].includes(member.role)
  const isSelf = member.id === currentUserId

  return (
    <div className={`bg-surface-container-lowest rounded-lg border border-outline-variant/15 p-4 flex items-center gap-4 ${!member.is_active ? 'opacity-60' : ''}`}>
      <div className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '20px' }}>person</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-on-surface truncate">{member.name}</span>
          {isSelf && <span className="text-xs text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded">you</span>}
        </div>
        <span className="text-xs text-on-surface-variant truncate">{member.email}</span>
      </div>
      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${ROLE_COLORS[member.role] ?? 'text-on-surface bg-surface-container-high'}`}>
        {ROLE_LABELS[member.role] ?? member.role}
      </span>
      {!isSelf && !isAdmin && (
        <button
          onClick={() => onToggle(member)}
          disabled={toggling}
          className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded border transition-colors disabled:opacity-50 ${
            member.is_active
              ? 'border-error/30 text-error hover:bg-error-container/20'
              : 'border-primary/30 text-primary hover:bg-primary-fixed/10'
          }`}>
          {toggling ? '…' : member.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
      )}
    </div>
  )
}
