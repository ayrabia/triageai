'use client'

/**
 * Auth context for TriageAI.
 *
 * Login calls the Next.js /api/login route (Cognito server-side, no CORS).
 * Tokens are stored in sessionStorage — cleared when the tab closes.
 * The IdToken auto-refreshes 5 minutes before expiry using the RefreshToken.
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

const SESSION_KEY = 'triageai_session'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  clinicId: string
  clinicName: string
  clinicSpecialty: string
  idToken: string
  refreshToken: string
  idTokenExpiry: number  // ms epoch — when the IdToken expires
}

interface AuthContextValue {
  user: AuthUser | null
  authLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Decode the `exp` claim from a JWT without a library. */
function getTokenExpiry(jwt: string): number {
  try {
    const payload = jwt.split('.')[1]
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return decoded.exp * 1000  // convert seconds → ms
  } catch {
    return Date.now() + 60 * 60 * 1000  // fallback: 1 hour
  }
}

async function cognitoLogin(email: string, password: string): Promise<{ idToken: string; refreshToken: string }> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Login failed. Please try again.')
  return { idToken: data.idToken, refreshToken: data.refreshToken }
}

async function fetchMe(idToken: string): Promise<Omit<AuthUser, 'idToken' | 'refreshToken' | 'idTokenExpiry'>> {
  const res = await fetch('/api/users/me', {
    headers: { Authorization: `Bearer ${idToken}` },
  })
  if (!res.ok) throw new Error('Failed to load user profile.')
  const me = await res.json()
  return {
    id: me.id,
    email: me.email,
    name: me.name,
    role: me.role,
    clinicId: me.clinic_id,
    clinicName: me.clinic_name,
    clinicSpecialty: me.clinic_specialty,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function persistUser(authUser: AuthUser) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(authUser))
    setUser(authUser)
  }

  const logout = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    sessionStorage.removeItem(SESSION_KEY)
    setUser(null)
  }, [])

  const scheduleRefresh = useCallback((authUser: AuthUser) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)

    const msUntilRefresh = authUser.idTokenExpiry - Date.now() - 5 * 60 * 1000  // 5 min before expiry
    if (msUntilRefresh <= 0) return  // already expired

    refreshTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: authUser.refreshToken }),
        })
        const data = await res.json()
        if (!res.ok) { logout(); return }

        const newIdToken: string = data.idToken
        const updated: AuthUser = {
          ...authUser,
          idToken: newIdToken,
          idTokenExpiry: getTokenExpiry(newIdToken),
        }
        persistUser(updated)
        scheduleRefresh(updated)
      } catch {
        logout()
      }
    }, msUntilRefresh)
  }, [logout])

  // Restore session from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY)
      if (stored) {
        const parsed: AuthUser = JSON.parse(stored)
        // If the stored token is already expired, don't restore it
        if (parsed.idTokenExpiry && parsed.idTokenExpiry > Date.now()) {
          setUser(parsed)
          scheduleRefresh(parsed)
        } else {
          sessionStorage.removeItem(SESSION_KEY)
        }
      }
    } catch {
      // Corrupted storage — start fresh
    } finally {
      setAuthLoading(false)
    }
  }, [scheduleRefresh])

  const login = useCallback(async (email: string, password: string) => {
    setAuthLoading(true)
    try {
      const { idToken, refreshToken } = await cognitoLogin(email, password)
      const profile = await fetchMe(idToken)
      const authUser: AuthUser = {
        ...profile,
        idToken,
        refreshToken,
        idTokenExpiry: getTokenExpiry(idToken),
      }
      persistUser(authUser)
      scheduleRefresh(authUser)
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
