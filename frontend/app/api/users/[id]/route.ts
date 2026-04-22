/**
 * PATCH /api/users/[id] — activate or deactivate a team member (ADMIN only)
 *
 * Deactivation: disables in Cognito AND sets is_active=false in users table.
 * Reactivation: re-enables in Cognito AND sets is_active=true.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  CognitoIdentityProviderClient,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { sql } from '../../_lib/db'
import { withAuth, requireRole, handleError, ApiError } from '../../_lib/auth'

export const dynamic = 'force-dynamic'

const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION ?? 'us-east-1' })
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const actor = await withAuth(request)
    requireRole(actor, 'admin', 'superadmin')

    const { id } = params
    const body = await request.json() as { is_active: boolean }

    if (typeof body.is_active !== 'boolean') {
      throw new ApiError(400, 'is_active (boolean) is required')
    }

    // Fetch the target user — must belong to same clinic
    const rows = await sql`
      SELECT id, email, role, auth_provider_id, clinic_id FROM users WHERE id = ${id} LIMIT 1
    `
    if (rows.length === 0) throw new ApiError(404, 'User not found')

    const target = rows[0]

    // Admins can only manage users in their own clinic
    if (actor.role === 'admin' && target.clinic_id !== actor.clinic_id) {
      throw new ApiError(403, 'You can only manage users in your clinic')
    }

    // Cannot deactivate another admin or superadmin
    if (['admin', 'superadmin'].includes(target.role) && !body.is_active) {
      throw new ApiError(403, 'Cannot deactivate an admin account')
    }

    // Sync with Cognito
    if (body.is_active) {
      await cognito.send(new AdminEnableUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: target.email,
      }))
    } else {
      await cognito.send(new AdminDisableUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: target.email,
      }))
    }

    await sql`UPDATE users SET is_active = ${body.is_active} WHERE id = ${id}`

    return NextResponse.json({ ok: true, is_active: body.is_active })
  } catch (err) {
    return handleError(err)
  }
}
