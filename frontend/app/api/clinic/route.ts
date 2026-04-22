import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../_lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const slug = request.headers.get('x-clinic-slug')
  if (!slug) return NextResponse.json({ error: 'No clinic context' }, { status: 400 })

  const rows = await sql<{ name: string; specialty: string }[]>`
    SELECT name, specialty FROM clinics WHERE slug = ${slug} LIMIT 1
  `
  if (rows.length === 0) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 })

  return NextResponse.json({ name: rows[0].name, specialty: rows[0].specialty, slug })
}
