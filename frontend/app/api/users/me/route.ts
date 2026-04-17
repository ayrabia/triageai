import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../_lib/db'
import { withAuth, handleError } from '../../_lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await withAuth(request)

    const clinics = await sql`
      SELECT name, specialty FROM clinics WHERE id = ${user.clinic_id} LIMIT 1
    `
    if (clinics.length === 0) {
      return NextResponse.json({ detail: "User's clinic not found" }, { status: 500 })
    }

    const clinic = clinics[0]
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      clinic_id: user.clinic_id,
      clinic_name: clinic.name,
      clinic_specialty: clinic.specialty,
    })
  } catch (err) {
    return handleError(err)
  }
}
