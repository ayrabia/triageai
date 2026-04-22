/**
 * POST /api/admin/clinics/[id]/admins
 *
 * SUPERADMIN creates the first ADMIN account for a clinic.
 * Creates Cognito user (sends invite email) + inserts into users table.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { sql } from '../../../../_lib/db'
import { withAuth, requireRole, handleError, ApiError } from '../../../../_lib/auth'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION ?? 'us-east-1' })
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await withAuth(request)
    requireRole(user, 'superadmin')

    const { id: clinicId } = params
    const body = await request.json() as { name: string; email: string }
    const { name, email } = body

    if (!name || !email) throw new ApiError(400, 'name and email are required')

    const clinic = await sql`SELECT id, name FROM clinics WHERE id = ${clinicId} LIMIT 1`
    if (clinic.length === 0) throw new ApiError(404, 'Clinic not found')

    // Create Cognito user — omitting SUPPRESS sends the invite email
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
    if (!sub) throw new ApiError(500, 'Failed to get Cognito sub for new user')

    await sql`
      INSERT INTO users (id, email, name, role, clinic_id, auth_provider_id, is_active)
      VALUES (${crypto.randomUUID()}, ${email}, ${name}, 'admin', ${clinicId}, ${sub}, true)
    `

    return NextResponse.json({ ok: true, email }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
