/**
 * GET /api/referrals/[id]/pdf
 *
 * Returns a short-lived (5 min) presigned S3 URL for the referral PDF.
 *
 * The presigned URL is generated server-side so AWS credentials are never
 * exposed to the browser. The URL is only served to authenticated users
 * whose clinic_id matches the referral.
 *
 * s3_key is treated as PHI (it maps directly to a document containing PHI)
 * and is never included in client-facing responses outside this endpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { sql, writeAuditLog } from '../../../_lib/db'
import { withAuth, handleError, ApiError } from '../../../_lib/auth'

export const dynamic = 'force-dynamic'

const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1'
const S3_BUCKET = process.env.S3_BUCKET ?? 'triageai-test-referrals'

// SDK v3 — uses instance role / env credentials automatically
const s3 = new S3Client({ region: AWS_REGION })

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await withAuth(request)
    const { id } = params

    // Fetch s3_key — verify clinic ownership before exposing the key
    const rows = await sql`
      SELECT id, clinic_id, s3_key, filename
      FROM referrals
      WHERE id = ${id} AND clinic_id = ${user.clinic_id}
      LIMIT 1
    `

    if (rows.length === 0) {
      throw new ApiError(404, 'Referral not found')
    }

    const referral = rows[0]

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: referral.s3_key,
      ResponseContentDisposition: `inline; filename="${referral.filename ?? 'referral.pdf'}"`,
      ResponseContentType: 'application/pdf',
    })

    // 5-minute URL — long enough for the browser to load the PDF viewer
    const url = await getSignedUrl(s3, command, { expiresIn: 300 })

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    await writeAuditLog(id, user.id, 'pdf_accessed', null, null, ip)

    return NextResponse.json({ url })
  } catch (err) {
    return handleError(err)
  }
}
