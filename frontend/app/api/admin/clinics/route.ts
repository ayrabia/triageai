/**
 * GET  /api/admin/clinics — list all clinics (SUPERADMIN only)
 * POST /api/admin/clinics — create a new clinic (SUPERADMIN only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../_lib/db'
import { withAuth, requireRole, handleError, ApiError } from '../../_lib/auth'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await withAuth(request)
    requireRole(user, 'superadmin')

    const clinics = await sql`
      SELECT
        c.id, c.name, c.slug, c.specialty, c.criteria, c.created_at,
        COUNT(u.id) FILTER (WHERE u.is_active) AS active_users,
        COUNT(r.id) AS total_referrals
      FROM clinics c
      LEFT JOIN users u ON u.clinic_id = c.id
      LEFT JOIN referrals r ON r.clinic_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `

    return NextResponse.json(clinics)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await withAuth(request)
    requireRole(user, 'superadmin')

    const body = await request.json() as {
      name: string
      slug: string
      specialty: string
      urgent_criteria: string[]
    }

    const { name, slug, specialty, urgent_criteria } = body

    if (!name || !slug || !specialty || !urgent_criteria?.length) {
      throw new ApiError(400, 'name, slug, specialty and urgent_criteria are required')
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new ApiError(400, 'slug must be lowercase alphanumeric with hyphens only')
    }

    const existing = await sql`SELECT id FROM clinics WHERE slug = ${slug} LIMIT 1`
    if (existing.length > 0) {
      throw new ApiError(409, `Subdomain '${slug}' is already taken`)
    }

    const clinicId = crypto.randomUUID()
    const criteria = { specialty, urgent_criteria }

    await sql`
      INSERT INTO clinics (id, name, slug, specialty, criteria)
      VALUES (${clinicId}, ${name}, ${slug}, ${specialty}, ${sql.json(criteria as never)})
    `

    return NextResponse.json({ id: clinicId, name, slug, specialty }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
