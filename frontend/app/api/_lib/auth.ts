/**
 * Cognito JWT verification for Next.js Route Handlers.
 *
 * Uses aws-jwt-verify (purpose-built for Cognito) rather than a generic JOSE
 * library. Key advantage: automatically validates token_use === 'id', which
 * rejects Access Tokens that might accidentally be sent instead of ID Tokens.
 *
 * The verifier caches the Cognito JWKS in memory — same behaviour as the
 * Python @lru_cache in app/auth.py.
 */

import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { NextRequest, NextResponse } from 'next/server'
import { sql, type DbUser } from './db'

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? ''
const CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID ?? process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID ?? ''

if (!USER_POOL_ID || !CLIENT_ID) {
  console.warn('[auth] COGNITO_USER_POOL_ID or COGNITO_APP_CLIENT_ID is not set')
}

// Module-level singleton — JWKS is cached after first fetch
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'id',      // Rejects Access Tokens; only ID Tokens are accepted
  clientId: CLIENT_ID,
})

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ detail: err.message }, { status: err.status })
  }
  // Do not include error details in the response — avoids leaking internals
  console.error('[route-handler]', err instanceof Error ? err.message : err)
  return NextResponse.json({ detail: 'Internal server error' }, { status: 500 })
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

/**
 * Verify the Bearer token from the request and return the authenticated user.
 *
 * Throws ApiError 401 if the token is missing or invalid.
 * Throws ApiError 403 if the token is valid but the user is not provisioned in TriageAI.
 *
 * Mirrors FastAPI's get_current_user dependency — clinic_id is always derived
 * from this user object, never from request parameters.
 */
export async function withAuth(request: NextRequest): Promise<DbUser> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new ApiError(401, 'Missing or invalid Authorization header')
  }

  const token = authHeader.slice(7)

  let sub: string
  try {
    const payload = await verifier.verify(token)
    sub = payload.sub
  } catch {
    throw new ApiError(401, 'Invalid or expired token')
  }

  const rows = await sql<DbUser[]>`
    SELECT id, clinic_id, auth_provider_id, role, name, email
    FROM users
    WHERE auth_provider_id = ${sub}
    LIMIT 1
  `

  if (rows.length === 0) {
    throw new ApiError(403, 'User not provisioned — contact your clinic administrator')
  }

  return rows[0]
}

/**
 * Assert that the authenticated user has one of the required roles.
 * Throws ApiError 403 if not.
 */
export function requireRole(user: DbUser, ...roles: string[]): void {
  if (!roles.includes(user.role)) {
    throw new ApiError(403, 'Insufficient permissions for this action')
  }
}
