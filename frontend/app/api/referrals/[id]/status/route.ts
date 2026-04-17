/**
 * PATCH /api/referrals/[id]/status
 *
 * Allowed transitions:
 *   ready         → reviewed  (coordinator marks reviewed)
 *   ready         → archived  (coordinator dismisses)
 *   reviewed      → archived
 *   routed        → reviewed  (physician marks reviewed)
 *   routed        → archived
 *   failed        → archived  (dismiss failed referral)
 *
 * Physicians may not escalate or change the action.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, writeAuditLog } from '../../../_lib/db'
import { withAuth, handleError, ApiError } from '../../../_lib/auth'

export const dynamic = 'force-dynamic'

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ready:    ['reviewed', 'archived'],
  routed:   ['reviewed', 'archived'],
  reviewed: ['archived'],
  failed:   ['archived'],
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await withAuth(request)
    const { id } = params
    const { status: newStatus } = await request.json() as { status?: string }

    if (!newStatus) {
      throw new ApiError(400, 'status is required')
    }

    // Fetch current referral (also verifies clinic_id ownership)
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
    const currentStatus: string = referral.status

    // Validate the transition is permitted
    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? []
    if (!allowed.includes(newStatus)) {
      throw new ApiError(400, `Cannot transition from '${currentStatus}' to '${newStatus}'`)
    }

    // Physicians may only act on referrals routed to them
    if (user.role === 'physician' && referral.routed_to !== user.id) {
      throw new ApiError(403, 'You can only update referrals assigned to you')
    }

    const updateFields =
      newStatus === 'reviewed'
        ? sql`status = ${newStatus}, reviewed_at = NOW(), reviewed_by = ${user.id}`
        : sql`status = ${newStatus}`

    await sql`UPDATE referrals SET ${updateFields} WHERE id = ${id}`

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    await writeAuditLog(
      id,
      user.id,
      `status_changed_to_${newStatus}`,
      { status: currentStatus },
      { status: newStatus },
      ip,
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
