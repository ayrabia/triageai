import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../_lib/db'
import { withAuth, handleError } from '../../_lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await withAuth(request)

    const physicians = await sql`
      SELECT id, name, email
      FROM users
      WHERE clinic_id = ${user.clinic_id} AND LOWER(role) = 'physician'
      ORDER BY name ASC
    `

    return NextResponse.json(physicians)
  } catch (err) {
    return handleError(err)
  }
}
