/**
 * PATCH /api/referrals/[id]/status
 *
 * Status machine for the triage workflow:
 *
 *   ready                   → approved_for_scheduling (REVIEWER approves, requires scheduling_window)
 *                           → reviewed  (legacy)
 *                           → archived
 *   escalated_to_md         → archived  (recall — actual md_reviewed transition is via /respond)
 *   md_reviewed             → approved_for_scheduling (REVIEWER sends to scheduler, window already in DB)
 *                           → archived
 *   approved_for_scheduling → scheduled (COORDINATOR confirms)
 *                           → archived
 *   scheduled               → archived
 *   routed                  → reviewed | approved_for_scheduling | archived  (legacy)
 *   reviewed                → archived
 *   failed                  → archived
 *
 * Note: escalated_to_md is SET by POST /api/referrals/[id]/route (physician selection).
 *       md_reviewed is SET by POST /api/referrals/[id]/respond (physician decision).
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, writeAuditLog } from '../../../_lib/db'
import { withAuth, handleError, ApiError } from '../../../_lib/auth'

export const dynamic = 'force-dynamic'

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ready:                   ['approved_for_scheduling', 'reviewed', 'archived'],
  escalated_to_md:         ['archived'],
  md_reviewed:             ['approved_for_scheduling', 'archived'],
  approved_for_scheduling: ['scheduled', 'archived'],
  scheduled:               ['archived'],
  routed:                  ['reviewed', 'approved_for_scheduling', 'archived'],
  reviewed:                ['archived'],
  failed:                  ['archived'],
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await withAuth(request)
    const { id } = params
    const body = await request.json() as { status?: string; scheduling_window?: string }
    const { status: newStatus, scheduling_window } = body

    if (!newStatus) {
      throw new ApiError(400, 'status is required')
    }

    const rows = await sql`
      SELECT id, clinic_id, status, routed_to, scheduling_window AS existing_window
      FROM referrals
      WHERE id = ${id} AND clinic_id = ${user.clinic_id}
      LIMIT 1
    `

    if (rows.length === 0) {
      throw new ApiError(404, 'Referral not found')
    }

    const referral = rows[0]
    const currentStatus: string = referral.status

    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? []
    if (!allowed.includes(newStatus)) {
      throw new ApiError(400, `Cannot transition from '${currentStatus}' to '${newStatus}'`)
    }

    // Physicians may only act on referrals assigned to them
    if (user.role === 'physician' && referral.routed_to !== user.id) {
      throw new ApiError(403, 'You can only update referrals assigned to you')
    }

    // Build the update expression based on which status we're entering
    let updateSql
    if (newStatus === 'reviewed') {
      updateSql = sql`status = ${newStatus}, reviewed_at = NOW(), reviewed_by = ${user.id}`
    } else if (newStatus === 'approved_for_scheduling' && scheduling_window) {
      updateSql = sql`status = ${newStatus}, scheduling_window = ${scheduling_window}`
    } else {
      // For approved_for_scheduling from md_reviewed: window already in DB, leave it
      updateSql = sql`status = ${newStatus}`
    }

    await sql`UPDATE referrals SET ${updateSql} WHERE id = ${id}`

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    await writeAuditLog(
      id,
      user.id,
      `status_changed_to_${newStatus}`,
      { status: currentStatus },
      { status: newStatus, ...(scheduling_window ? { scheduling_window } : {}) },
      ip,
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
