/**
 * GET  /api/referrals/[id]/notes  — fetch the notes thread for a referral
 * POST /api/referrals/[id]/notes  — add a note to the thread
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sql } from '../../../_lib/db'
import { withAuth, handleError, ApiError } from '../../../_lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await withAuth(request)
    const { id } = params

    // Confirm referral belongs to this clinic
    const ref = await sql`
      SELECT id FROM referrals WHERE id = ${id} AND clinic_id = ${user.clinic_id} LIMIT 1
    `
    if (ref.length === 0) throw new ApiError(404, 'Referral not found')

    const notes = await sql`
      SELECT id, referral_id, clinic_id, author_id, author_name, author_role, body, created_at
      FROM referral_notes
      WHERE referral_id = ${id} AND clinic_id = ${user.clinic_id}
      ORDER BY created_at ASC
    `

    return NextResponse.json(notes)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await withAuth(request)
    const { id } = params
    const body = await request.json() as { body?: string }

    if (!body.body?.trim()) throw new ApiError(400, 'Note body is required')

    // Confirm referral belongs to this clinic
    const ref = await sql`
      SELECT id FROM referrals WHERE id = ${id} AND clinic_id = ${user.clinic_id} LIMIT 1
    `
    if (ref.length === 0) throw new ApiError(404, 'Referral not found')

    const noteId = crypto.randomUUID()
    await sql`
      INSERT INTO referral_notes (id, referral_id, clinic_id, author_id, author_name, author_role, body)
      VALUES (
        ${noteId},
        ${id},
        ${user.clinic_id},
        ${user.id},
        ${user.name},
        ${user.role},
        ${body.body.trim()}
      )
    `

    const [note] = await sql`
      SELECT id, referral_id, clinic_id, author_id, author_name, author_role, body, created_at
      FROM referral_notes WHERE id = ${noteId}
    `

    return NextResponse.json(note, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
