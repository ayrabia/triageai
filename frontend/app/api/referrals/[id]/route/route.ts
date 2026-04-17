/**
 * POST /api/referrals/[id]/route
 *
 * Routes a referral to a physician. Restricted to COORDINATOR and ADMIN roles.
 * Sets status → 'routed', records routed_to and routed_at.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, writeAuditLog } from '../../../_lib/db'
import { withAuth, handleError, requireRole, ApiError } from '../../../_lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await withAuth(request)
    requireRole(user, 'coordinator', 'admin')

    const { id } = params
    const { physician_id } = await request.json() as { physician_id?: string }

    if (!physician_id) {
      throw new ApiError(400, 'physician_id is required')
    }

    // Verify the target physician exists and belongs to the same clinic
    const physicianRows = await sql`
      SELECT id FROM users
      WHERE id = ${physician_id}
        AND clinic_id = ${user.clinic_id}
        AND role = 'physician'
      LIMIT 1
    `

    if (physicianRows.length === 0) {
      throw new ApiError(404, 'Physician not found in your clinic')
    }

    // Verify the referral belongs to the same clinic
    const referralRows = await sql`
      SELECT id, clinic_id, status, routed_to
      FROM referrals
      WHERE id = ${id} AND clinic_id = ${user.clinic_id}
      LIMIT 1
    `

    if (referralRows.length === 0) {
      throw new ApiError(404, 'Referral not found')
    }

    const referral = referralRows[0]

    await sql`
      UPDATE referrals
      SET status    = 'routed',
          routed_to = ${physician_id},
          routed_at = NOW()
      WHERE id = ${id}
    `

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    await writeAuditLog(
      id,
      user.id,
      'routed_to_physician',
      { status: referral.status, routed_to: referral.routed_to },
      { status: 'routed', routed_to: physician_id },
      ip,
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
