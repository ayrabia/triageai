'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

type Step = 'login' | 'set-password'

export default function LoginPage() {
  const { user, authLoading, login } = useAuth()
  const router = useRouter()

  const [step, setStep] = useState<Step>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [session, setSession] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [clinicName, setClinicName] = useState<string | null>(null)
  const [clinicNotFound, setClinicNotFound] = useState(false)

  useEffect(() => {
    if (!authLoading && user) router.replace('/')
  }, [user, authLoading, router])

  useEffect(() => {
    fetch('/api/clinic')
      .then((res) => {
        if (res.status === 404) { setClinicNotFound(true); return null }
        if (!res.ok) return null
        return res.json()
      })
      .then((data) => { if (data) setClinicName(data.name) })
      .catch(() => {})
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }

      if (data.challenge === 'NEW_PASSWORD_REQUIRED') {
        setSession(data.session)
        setStep('set-password')
        setPassword('')
        return
      }

      await login(email, password)
    } catch {
      setError('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, session, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      // Password set — now do the full login to get profile + store session
      await login(email, newPassword)
    } catch {
      setError('Failed to set password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) return null

  if (clinicNotFound) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <span className="block text-3xl font-black uppercase tracking-tighter text-primary mb-8">TriageAI</span>
          <div className="bg-surface-container-lowest rounded-xl p-8"
            style={{ boxShadow: '0 4px 24px rgba(0, 36, 68, 0.04)', border: '1px solid rgba(195, 198, 207, 0.15)' }}>
            <span className="material-symbols-outlined text-outline mb-4 block" style={{ fontSize: '32px' }}>domain_disabled</span>
            <p className="text-sm font-semibold text-on-surface mb-1">Clinic not found</p>
            <p className="text-xs text-on-surface-variant">This portal address doesn&apos;t match any active clinic. Check the URL or contact your administrator.</p>
          </div>
        </div>
      </div>
    )
  }

  const inputClass = `
    block w-full border-0 border-b border-outline-variant bg-transparent
    py-2.5 px-0 text-sm text-on-surface placeholder:text-outline
    focus:border-primary focus:border-b-2 focus:ring-0 focus:outline-none
    transition-colors duration-150
  `

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <span className="block text-3xl font-black uppercase tracking-tighter text-primary mb-2">TriageAI</span>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            {step === 'login'
              ? clinicName ? `Sign in to ${clinicName}` : 'Sign in to TriageAI Admin'
              : 'Set your password to get started'}
          </p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-8 relative overflow-hidden"
          style={{ boxShadow: '0 4px 24px rgba(0, 36, 68, 0.04)', border: '1px solid rgba(195, 198, 207, 0.15)' }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />

          {step === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-on-surface-variant mb-2">Email Address</label>
                <input id="email" type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="clinician@clinic.org" className={inputClass} />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-on-surface-variant mb-2">Password</label>
                <div className="relative">
                  <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" className={inputClass + ' pr-8'} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant transition-colors focus:outline-none">
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>
              {error && (
                <div className="rounded border border-error/20 bg-error-container/20 px-3 py-2">
                  <p className="text-xs font-medium text-error">{error}</p>
                </div>
              )}
              <div className="pt-2">
                <button type="submit" disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 rounded text-sm font-medium bg-primary text-on-primary hover:bg-primary-container focus:outline-none disabled:opacity-50 transition-colors duration-150">
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSetPassword} className="space-y-6">
              <div className="rounded border border-primary/20 bg-primary-fixed/10 px-3 py-2 text-xs text-on-surface-variant">
                You're signing in for the first time. Set a permanent password to continue.
              </div>
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-on-surface-variant mb-2">New Password</label>
                <input id="new-password" type="password" autoComplete="new-password" required
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters" className={inputClass} />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-on-surface-variant mb-2">Confirm Password</label>
                <input id="confirm-password" type="password" autoComplete="new-password" required
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••" className={inputClass} />
              </div>
              {error && (
                <div className="rounded border border-error/20 bg-error-container/20 px-3 py-2">
                  <p className="text-xs font-medium text-error">{error}</p>
                </div>
              )}
              <div className="pt-2">
                <button type="submit" disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 rounded text-sm font-medium bg-primary text-on-primary hover:bg-primary-container focus:outline-none disabled:opacity-50 transition-colors duration-150">
                  {loading ? 'Setting password…' : 'Set Password & Sign In'}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-on-surface-variant opacity-70">
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>lock</span>
          <span className="text-xs">Secure, HIPAA-compliant access</span>
        </div>
      </div>
    </div>
  )
}
