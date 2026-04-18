/**
 * POST /api/referrals/[id]/respond
 *
 * PHYSICIAN submits their scheduling decision on an escalated referral.
 * Sets status → 'md_reviewed', stores physician_note and scheduling_window.
 * Restricted to PHYSICIAN (must be the assigned physician) and ADMIN.
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
    requireRole(user, 'physician', 'admin')

    const { id } = params
    const { physician_note, scheduling_window } = await request.json() as {
      physician_note?: string
      scheduling_window?: string
    }

    if (!scheduling_window) {
      throw new ApiError(400, 'scheduling_window is required')
    }

    const rows = await sql`
      SELECT id, clinic_id, status, routed_to
      FROM referrals
      WHERE id = ${id} AND clinic_id = ${user.clinic_id}
      LIMIT 1
    `

    if (rows.length === 0) {
      throw new ApiError(404, 'Referral not found')
    }

    const referral = rows[0]

    if (user.role === 'physician' && referral.routed_to !== user.id) {
      throw new ApiError(403, 'This referral is not assigned to you')
    }

    if (referral.status !== 'escalated_to_md') {
      throw new ApiError(400, `Expected status 'escalated_to_md', got '${referral.status}'`)
    }

    await sql`
      UPDATE referrals
      SET status            = 'md_reviewed',
          physician_note    = ${physician_note ?? null},
          scheduling_window = ${scheduling_window}
      WHERE id = ${id}
    `

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    await writeAuditLog(
      id,
      user.id,
      'md_decision_submitted',
      { status: 'escalated_to_md' },
      { status: 'md_reviewed', scheduling_window, physician_note: physician_note ?? null },
      ip,
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
