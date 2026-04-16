'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function LoginPage() {
  const { user, authLoading, login } = useAuth()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && user) router.replace('/')
  }, [user, authLoading, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) return null

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo + tagline */}
        <div className="mb-8 text-center">
          <span className="block text-3xl font-black uppercase tracking-tighter text-primary mb-2">TriageAI</span>
          <p className="text-sm text-on-surface-variant leading-relaxed">Sign in to your clinic portal</p>
        </div>

        {/* Card */}
        <div className="bg-surface-container-lowest rounded-xl p-8 relative overflow-hidden"
          style={{ boxShadow: '0 4px 24px rgba(0, 36, 68, 0.04)', border: '1px solid rgba(195, 198, 207, 0.15)' }}
        >
          {/* Left accent pulse */}
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-on-surface-variant mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="clinician@clinic.org"
                className="
                  block w-full border-0 border-b border-outline-variant bg-transparent
                  py-2.5 px-0 text-sm text-on-surface placeholder:text-outline
                  focus:border-primary focus:border-b-2 focus:ring-0 focus:outline-none
                  transition-colors duration-150
                "
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-on-surface-variant mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="
                    block w-full border-0 border-b border-outline-variant bg-transparent
                    py-2.5 px-0 pr-8 text-sm text-on-surface placeholder:text-outline
                    focus:border-primary focus:border-b-2 focus:ring-0 focus:outline-none
                    transition-colors duration-150
                  "
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant transition-colors focus:outline-none"
                  tabIndex={-1}
                >
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
              <button
                type="submit"
                disabled={loading}
                className="
                  w-full flex justify-center py-2.5 px-4 rounded text-sm font-medium
                  bg-primary text-on-primary hover:bg-primary-container
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors duration-150
                "
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-center gap-2 text-on-surface-variant opacity-70">
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>lock</span>
          <span className="text-xs">Secure, HIPAA-compliant access</span>
        </div>

      </div>
    </div>
  )
}
