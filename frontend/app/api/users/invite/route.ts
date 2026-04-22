/**
 * POST /api/users/invite
 *
 * ADMIN invites a team member (COORDINATOR / REVIEWER / PHYSICIAN).
 * Creates Cognito user (triggers invite email) + inserts into users table.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { sql } from '../../_lib/db'
import { withAuth, requireRole, handleError, ApiError } from '../../_lib/auth'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const INVITABLE_ROLES = ['coordinator', 'reviewer', 'physician']

const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION ?? 'us-east-1' })
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!

export async function POST(request: NextRequest) {
  try {
    const user = await withAuth(request)
    requireRole(user, 'admin', 'superadmin')

    const body = await request.json() as { name: string; email: string; role: string }
    const { name, email, role } = body

    if (!name || !email || !role) throw new ApiError(400, 'name, email and role are required')
    if (!INVITABLE_ROLES.includes(role)) {
      throw new ApiError(400, `role must be one of: ${INVITABLE_ROLES.join(', ')}`)
    }

    const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`
    if (existing.length > 0) throw new ApiError(409, 'A user with this email already exists')

    const cognitoResp = await cognito.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: name },
      ],
      DesiredDeliveryMediums: ['EMAIL'],
    }))

    const sub = cognitoResp.User?.Attributes?.find((a) => a.Name === 'sub')?.Value
    if (!sub) throw new ApiError(500, 'Failed to get Cognito sub for invited user')

    await sql`
      INSERT INTO users (id, email, name, role, clinic_id, auth_provider_id, is_active)
      VALUES (${crypto.randomUUID()}, ${email}, ${name}, ${role}, ${user.clinic_id}, ${sub}, true)
    `

    return NextResponse.json({ ok: true, email, role }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
