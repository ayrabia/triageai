/**
 * GET /api/referrals/[id]  — full referral detail + writes an audit log entry
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, writeAuditLog } from '../../_lib/db'
import { withAuth, handleError, ApiError } from '../../_lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await withAuth(request)
    const { id } = params

    const rows = await sql`
      SELECT
        r.*,
        u_reviewed.name   AS reviewed_by_name,
        u_routed.name     AS routed_to_name
      FROM referrals r
      LEFT JOIN users u_reviewed ON u_reviewed.id = r.reviewed_by
      LEFT JOIN users u_routed   ON u_routed.id   = r.routed_to
      WHERE r.id = ${id}
        AND r.clinic_id = ${user.clinic_id}
      LIMIT 1
    `

    if (rows.length === 0) {
      throw new ApiError(404, 'Referral not found')
    }

    // Record that this user viewed the referral (HIPAA audit requirement)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    await writeAuditLog(id, user.id, 'viewed', null, null, ip)

    return NextResponse.json(rows[0])
  } catch (err) {
    return handleError(err)
  }
}
