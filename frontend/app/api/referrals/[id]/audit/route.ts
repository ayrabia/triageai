/**
 * GET /api/referrals/[id]/audit
 *
 * Returns the audit trail for a referral, sorted oldest → newest.
 * Restricted to COORDINATOR and ADMIN roles (physicians do not need audit history).
 *
 * old_value and new_value may contain PHI (captured from referral fields)
 * and are only served to authenticated users with the correct clinic_id.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../_lib/db'
import { withAuth, handleError, requireRole, ApiError } from '../../../_lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await withAuth(request)
    requireRole(user, 'coordinator', 'admin')

    const { id } = params

    // Verify the referral belongs to this clinic before returning its audit log
    const ownershipCheck = await sql`
      SELECT id FROM referrals
      WHERE id = ${id} AND clinic_id = ${user.clinic_id}
      LIMIT 1
    `

    if (ownershipCheck.length === 0) {
      throw new ApiError(404, 'Referral not found')
    }

    const rows = await sql`
      SELECT
        al.id,
        al.action,
        al.old_value,
        al.new_value,
        al.ip_address,
        al.created_at,
        u.name  AS user_name,
        u.role  AS user_role,
        u.email AS user_email
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.referral_id = ${id}
      ORDER BY al.created_at ASC
    `

    return NextResponse.json(rows)
  } catch (err) {
    return handleError(err)
  }
}
