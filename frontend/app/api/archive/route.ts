/**
 * GET /api/archive — scheduled referrals for this clinic, accessible to coordinator and reviewer
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../_lib/db'
import { withAuth, handleError, ApiError } from '../_lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await withAuth(request)

    if (!['coordinator', 'reviewer', 'admin', 'superadmin'].includes(user.role)) {
      throw new ApiError(403, 'Forbidden')
    }

    const rows = await sql`
      SELECT
        id, filename, action, referral_reason, summary,
        patient_name, patient_dob, referring_provider,
        received_at
      FROM referrals
      WHERE clinic_id = ${user.clinic_id}
        AND status = 'scheduled'
      ORDER BY patient_name ASC NULLS LAST, received_at DESC
    `

    return NextResponse.json(rows)
  } catch (err) {
    return handleError(err)
  }
}
