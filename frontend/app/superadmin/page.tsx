'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

interface Clinic {
  id: string
  name: string
  slug: string
  specialty: string
  criteria: { urgent_criteria: string[] } | null
  active_users: number
  total_referrals: number
  created_at: string
}

const DEFAULT_CRITERIA: Record<string, string[]> = {
  ENT: [
    'Confirmed or suspected cancer/malignancy',
    'Rapidly growing neck or oral lesions',
    'Nasal fractures (1-2 week surgical window)',
    'Sudden hearing loss',
    'Airway compromise or obstruction',
    'Tongue ties in infants with feeding issues',
    'Peritonsillar abscess',
    'Foreign body in ear/nose/throat',
  ],
  Cardiology: [
    'Confirmed or suspected cardiac malignancy',
    'Acute heart failure or decompensation',
    'Unstable angina or NSTEMI',
    'Severe symptomatic valvular disease',
    'Life-threatening arrhythmia',
  ],
  Orthopedics: [
    'Confirmed or suspected bone malignancy',
    'Fracture requiring urgent surgical intervention',
    'Acute compartment syndrome',
    'Spinal cord compromise',
    'Open fracture or dislocation',
  ],
}

type Modal = 'create-clinic' | 'create-admin' | null

export default function SuperadminPage() {
  const { user, authLoading, logout } = useAuth()
  const router = useRouter()

  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)

  // Create clinic form
  const [clinicName, setClinicName] = useState('')
  const [clinicSlug, setClinicSlug] = useState('')
  const [clinicSpecialty, setClinicSpecialty] = useState('ENT')
  const [criteriaItems, setCriteriaItems] = useState<string[]>(DEFAULT_CRITERIA['ENT'])
  const [newCriterion, setNewCriterion] = useState('')

  // Create admin form
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')

  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  const fetchClinics = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch('/api/admin/clinics', {
        headers: { Authorization: `Bearer ${user.idToken}` },
      })
      if (res.ok) setClinics(await res.json())
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    if (user.role !== 'superadmin') { router.replace('/'); return }
    fetchClinics()
  }, [authLoading, user, router, fetchClinics])

  function onSpecialtyChange(specialty: string) {
    setClinicSpecialty(specialty)
    setCriteriaItems(DEFAULT_CRITERIA[specialty] ?? [])
  }

  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleCreateClinic(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFormLoading(true)
    try {
      const res = await fetch('/api/admin/clinics', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user!.idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clinicName,
          slug: clinicSlug,
          specialty: clinicSpecialty,
          urgent_criteria: criteriaItems,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.detail); return }
      setModal(null)
      setClinicName(''); setClinicSlug(''); setClinicSpecialty('ENT')
      setCriteriaItems(DEFAULT_CRITERIA['ENT'])
      fetchClinics()
    } catch { setFormError('Something went wrong. Please try again.') }
    finally { setFormLoading(false) }
  }

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedClinic) return
    setFormError(null)
    setFormLoading(true)
    try {
      const res = await fetch(`/api/admin/clinics/${selectedClinic.id}/admins`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user!.idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: adminName, email: adminEmail }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.detail); return }
      setModal(null)
      setAdminName(''); setAdminEmail('')
      fetchClinics()
    } catch { setFormError('Something went wrong. Please try again.') }
    finally { setFormLoading(false) }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <span className="material-symbols-outlined text-primary animate-spin" style={{ fontSize: '32px' }}>sync</span>
      </div>
    )
  }

  const inputClass = "block w-full rounded border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md shadow-header">
        <div className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black uppercase tracking-tighter text-primary">TriageAI</span>
            <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded">Superadmin</span>
          </div>
          <button onClick={() => { logout(); router.replace('/login') }}
            className="text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-primary">Clinics</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">{clinics.length} clinic{clinics.length !== 1 ? 's' : ''} on the platform</p>
          </div>
          <button onClick={() => { setFormError(null); setModal('create-clinic') }}
            className="flex items-center gap-2 bg-primary text-on-primary text-sm font-medium px-4 py-2 rounded hover:bg-primary-container transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
            New Clinic
          </button>
        </div>

        {clinics.length === 0 ? (
          <div className="py-24 flex flex-col items-center text-center">
            <span className="material-symbols-outlined text-outline mb-4" style={{ fontSize: '32px' }}>corporate_fare</span>
            <p className="text-sm font-semibold text-on-surface">No clinics yet</p>
            <p className="text-xs text-on-surface-variant mt-1">Create your first clinic to get started.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {clinics.map((clinic) => (
              <div key={clinic.id} className="bg-surface-container-lowest rounded-lg border border-outline-variant/15 border-l-[3px] border-l-primary-container p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-sm font-bold text-on-surface">{clinic.name}</h2>
                      <span className="text-xs text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded font-mono">{clinic.slug}.usetriageai.com</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>medical_services</span>
                        {clinic.specialty}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>group</span>
                        {clinic.active_users} active user{clinic.active_users !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>description</span>
                        {clinic.total_referrals} referral{clinic.total_referrals !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setSelectedClinic(clinic); setFormError(null); setModal('create-admin') }}
                    className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/30 px-3 py-1.5 rounded hover:bg-primary-fixed/10 transition-colors">
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>person_add</span>
                    Add Admin
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Clinic Modal */}
      {modal === 'create-clinic' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-surface-container-lowest rounded-xl w-full max-w-lg p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-on-surface">New Clinic</h2>
              <button onClick={() => setModal(null)} className="text-outline hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>
            <form onSubmit={handleCreateClinic} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Clinic Name</label>
                <input required value={clinicName} onChange={(e) => { setClinicName(e.target.value); setClinicSlug(slugify(e.target.value)) }}
                  placeholder="Sacramento ENT" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Subdomain</label>
                <div className="flex items-center gap-0">
                  <input required value={clinicSlug} onChange={(e) => setClinicSlug(e.target.value)}
                    placeholder="sacent" className={inputClass + ' rounded-r-none'} />
                  <span className="bg-surface-container-high border border-l-0 border-outline-variant/40 px-3 py-2 text-xs text-on-surface-variant rounded-r font-mono whitespace-nowrap">.usetriageai.com</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Specialty</label>
                <select value={clinicSpecialty} onChange={(e) => onSpecialtyChange(e.target.value)} className={inputClass}>
                  {Object.keys(DEFAULT_CRITERIA).map((s) => <option key={s}>{s}</option>)}
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-2">
                  Urgent Triage Criteria
                  <span className="ml-1 text-outline font-normal">({criteriaItems.length} items)</span>
                </label>
                <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto">
                  {criteriaItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-surface-container-low rounded px-2 py-1.5">
                      <span className="flex-1 text-on-surface">{item}</span>
                      <button type="button" onClick={() => setCriteriaItems(criteriaItems.filter((_, j) => j !== i))}
                        className="text-outline hover:text-error transition-colors shrink-0">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newCriterion} onChange={(e) => setNewCriterion(e.target.value)}
                    placeholder="Add criterion…" className={inputClass + ' text-xs'} />
                  <button type="button"
                    onClick={() => { if (newCriterion.trim()) { setCriteriaItems([...criteriaItems, newCriterion.trim()]); setNewCriterion('') } }}
                    className="shrink-0 bg-surface-container-high border border-outline-variant/40 text-on-surface-variant px-3 py-2 rounded text-xs hover:bg-surface-container transition-colors">
                    Add
                  </button>
                </div>
              </div>
              {formError && <p className="text-xs text-error">{formError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)}
                  className="flex-1 py-2 rounded border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={formLoading}
                  className="flex-1 py-2 rounded bg-primary text-on-primary text-sm font-medium hover:bg-primary-container disabled:opacity-50 transition-colors">
                  {formLoading ? 'Creating…' : 'Create Clinic'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Admin Modal */}
      {modal === 'create-admin' && selectedClinic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-surface-container-lowest rounded-xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-on-surface">Add Admin</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">{selectedClinic.name}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-outline hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Full Name</label>
                <input required value={adminName} onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Dr. Jane Smith" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Email Address</label>
                <input required type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@clinic.com" className={inputClass} />
              </div>
              <p className="text-xs text-on-surface-variant">An invite email with a temporary password will be sent automatically.</p>
              {formError && <p className="text-xs text-error">{formError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)}
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
