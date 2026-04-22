/**
 * POST /api/referrals/upload
 *
 * Accepts a PDF upload from the drag-and-drop UI, saves it to S3, creates
 * the referral DB row, and returns immediately. The S3 ObjectCreated event
 * triggers the Lambda pipeline — this handler does NOT call the pipeline.
 *
 * clinic_id is derived from the authenticated user's JWT — never from the request.
 */

import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import crypto from 'crypto'
import { sql, writeAuditLog } from '../../_lib/db'
import { withAuth, handleError } from '../../_lib/auth'

export const dynamic = 'force-dynamic'

const S3_BUCKET = process.env.S3_BUCKET ?? 'triageai-test-referrals'
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1'
const MAX_FILE_SIZE = 50 * 1024 * 1024  // 50 MB

const s3 = new S3Client({ region: AWS_REGION })

export async function POST(request: NextRequest) {
  try {
    const user = await withAuth(request)

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ detail: 'Expected multipart/form-data' }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ detail: 'No file provided' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ detail: 'Only PDF files are accepted.' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    if (buffer.length === 0) {
      return NextResponse.json({ detail: 'Uploaded file is empty.' }, { status: 400 })
    }
    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json({ detail: 'File too large. Maximum size is 50 MB.' }, { status: 413 })
    }

    // Pre-generate UUID so it's both the referral ID and the S3 key — Lambda
    // parses the UUID from the key to avoid a race-condition DB lookup
    const referralId = crypto.randomUUID()
    const s3Key = `ui-uploads/${referralId}.pdf`
    const safeFilename = (file.name || 'upload.pdf').replace(/[/\\]/g, '_').replace(/\.\./g, '')

    // Upload to S3 first — if this fails, no DB row is created
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: 'application/pdf',
    }))

    // Insert referral row
    await sql`
      INSERT INTO referrals (id, clinic_id, s3_key, filename, status, received_at)
      VALUES (
        ${referralId},
        ${user.clinic_id},
        ${s3Key},
        ${safeFilename},
        'pending',
        NOW()
      )
    `

    await writeAuditLog(
      referralId,
      user.id,
      'uploaded',
      null,
      { filename: safeFilename, bytes: buffer.length, s3_key: s3Key },
    )

    return NextResponse.json({ referral_id: referralId, status: 'processing' }, { status: 202 })
  } catch (err) {
    return handleError(err)
  }
}
