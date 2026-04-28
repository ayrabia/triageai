'use client'

/**
 * Auth context for TriageAI.
 *
 * Tokens live exclusively in HttpOnly cookies set by the server — they are
 * never accessible to client-side JavaScript. The auth context holds only
 * the user profile and the token expiry timestamp (used to schedule refresh).
 *
 * Session restore on page load: call /api/users/me. If the id_token cookie
 * is still valid, the server returns the profile + expiry. If expired, try
 * /api/refresh (which uses the refresh_token cookie) and retry.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  clinicId: string
  clinicName: string
  clinicSpecialty: string
  idTokenExpiry: number  // in-memory only — drives the auto-refresh timer
}

interface AuthContextValue {
  user: AuthUser | null
  authLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfile(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/users/me', { cache: 'no-store' })
    if (!res.ok) return null
    const me = await res.json()
    return {
      id: me.id,
      email: me.email,
      name: me.name,
      role: me.role,
      clinicId: me.clinic_id,
      clinicName: me.clinic_name,
      clinicSpecialty: me.clinic_specialty,
      idTokenExpiry: me.expiresAt,
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const logout = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    setUser(null)
    fetch('/api/logout', { method: 'POST' }).catch(() => {})
  }, [])

  const scheduleRefresh = useCallback((authUser: AuthUser) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)

    const msUntilRefresh = authUser.idTokenExpiry - Date.now() - 5 * 60 * 1000
    if (msUntilRefresh <= 0) return

    refreshTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/refresh', { method: 'POST' })
        if (!res.ok) { logout(); return }
        const { expiresAt } = await res.json()
        const updated: AuthUser = { ...authUser, idTokenExpiry: expiresAt }
        setUser(updated)
        scheduleRefresh(updated)
      } catch {
        logout()
      }
    }, msUntilRefresh)
  }, [logout])

  // Restore session on mount
  useEffect(() => {
    async function restoreSession() {
      let profile = await fetchProfile()

      if (!profile) {
        // id_token may be expired — try refreshing with the refresh_token cookie
        const refreshRes = await fetch('/api/refresh', { method: 'POST' }).catch(() => null)
        if (refreshRes?.ok) {
          profile = await fetchProfile()
        }
      }

      if (profile) {
        setUser(profile)
        scheduleRefresh(profile)
      }

      setAuthLoading(false)
    }

    restoreSession()
  }, [scheduleRefresh])

  const login = useCallback(async (email: string, password: string) => {
    setAuthLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Login failed. Please try again.')
      if (data.challenge === 'NEW_PASSWORD_REQUIRED') {
        throw Object.assign(new Error('NEW_PASSWORD_REQUIRED'), { challenge: data })
      }

      const profile = await fetchProfile()
      if (!profile) throw new Error('Login succeeded but profile could not be loaded.')
      setUser(profile)
      scheduleRefresh(profile)
    } finally {
      setAuthLoading(false)
    }
  }, [scheduleRefresh])

  return (
    <AuthContext.Provider value={{ user, authLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
