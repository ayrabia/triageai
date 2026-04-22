/**
 * GET /api/users — list all users in the authenticated user's clinic (ADMIN only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../_lib/db'
import { withAuth, requireRole, handleError } from '../_lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await withAuth(request)
    requireRole(user, 'admin', 'superadmin')

    const users = await sql`
      SELECT id, name, email, role, is_active, created_at
      FROM users
      WHERE clinic_id = ${user.clinic_id}
      ORDER BY
        CASE role
          WHEN 'admin'       THEN 0
          WHEN 'reviewer'    THEN 1
          WHEN 'coordinator' THEN 2
          WHEN 'physician'   THEN 3
          ELSE 4
        END,
        name ASC
    `

    return NextResponse.json(users)
  } catch (err) {
    return handleError(err)
  }
}
