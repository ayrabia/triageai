/**
 * GET  /api/referrals  — paginated queue sorted by clinical priority
 * POST /api/referrals/upload is handled in ./upload/route.ts (separate file
 *   avoids a conflict with the [id] dynamic segment)
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../_lib/db'
import { withAuth, handleError } from '../_lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await withAuth(request)

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')
    const actionFilter = searchParams.get('action')
    const assignedToMe = searchParams.get('assigned_to_me') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
    const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0)

    // Build filters dynamically — postgres tagged templates handle parameterization
    const rows = await sql`
      SELECT
        id, clinic_id, status, action, filename,
        referral_reason, summary, recommended_window,
        scheduling_window, physician_note,
        missing_information, received_at, processed_at, routed_to
      FROM referrals
      WHERE clinic_id = ${user.clinic_id}
        ${statusFilter ? sql`AND status = ${statusFilter}` : sql``}
        ${actionFilter ? sql`AND action = ${actionFilter}` : sql``}
        ${assignedToMe ? sql`AND routed_to = ${user.id}` : sql``}
      ORDER BY
        CASE action
          WHEN 'PRIORITY REVIEW'    THEN 0
          WHEN 'SECONDARY APPROVAL' THEN 1
          WHEN 'STANDARD QUEUE'     THEN 2
          ELSE 3
        END ASC,
        received_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json(rows)
  } catch (err) {
    return handleError(err)
  }
}
