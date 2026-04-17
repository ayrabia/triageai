/**
 * POST /api/referrals/ingest
 *
 * Called by the Lambda pipeline handler after classification is complete.
 * Updates the referral row with all extracted fields and marks it as
 * 'ready', 'secondary_approval', or 'standard_queue'.
 *
 * This endpoint is authenticated with a shared PIPELINE_SECRET (Bearer token)
 * rather than a Cognito user token — Lambda has no user session.
 *
 * The Lambda handler already has the referral UUID (embedded in the S3 key),
 * so no DB lookup is needed here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, writeAuditLog } from '../../_lib/db'
import { handleError, ApiError } from '../../_lib/auth'

export const dynamic = 'force-dynamic'

interface IngestPayload {
  referral_id: string
  action: 'PRIORITY REVIEW' | 'SECONDARY APPROVAL' | 'STANDARD QUEUE'
  referral_reason: string | null
  relevant_clinical_findings: string[] | null
  imaging_summary: string | null
  missing_information: string[] | null
  provider_urgency_label: Record<string, string> | null
  matched_criteria: string[] | null
  evidence: string[] | null
  provider_label: string | null
  reasoning: string | null
  recommended_window: string | null
  next_steps: string | null
  summary: string | null
  model_used: string | null
  processing_time_ms: number | null
  pipeline_version: string | null
  error_message?: string | null
}

const PIPELINE_SECRET = process.env.PIPELINE_SECRET

export async function POST(request: NextRequest) {
  try {
    // Authenticate using shared secret — Lambda cannot use Cognito tokens
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      throw new ApiError(401, 'Missing Authorization header')
    }
    if (!PIPELINE_SECRET || authHeader.slice(7) !== PIPELINE_SECRET) {
      throw new ApiError(401, 'Invalid pipeline secret')
    }

    const body: IngestPayload = await request.json()
    const { referral_id, action, error_message, ...fields } = body

    if (!referral_id) {
      throw new ApiError(400, 'referral_id is required')
    }

    // Determine new status based on action
    let newStatus: string
    if (error_message) {
      newStatus = 'failed'
    } else if (action === 'PRIORITY REVIEW') {
      newStatus = 'ready'
    } else if (action === 'SECONDARY APPROVAL') {
      newStatus = 'ready'
    } else if (action === 'STANDARD QUEUE') {
      newStatus = 'ready'
    } else {
      newStatus = 'failed'
    }

    // Fetch current row for audit log old_value and clinic_id
    const existing = await sql`
      SELECT id, clinic_id, status, action FROM referrals
      WHERE id = ${referral_id}
      LIMIT 1
    `

    if (existing.length === 0) {
      throw new ApiError(404, 'Referral not found')
    }

    const row = existing[0]

    await sql`
      UPDATE referrals SET
        status               = ${newStatus},
        action               = ${action ?? null},
        referral_reason      = ${fields.referral_reason ?? null},
        relevant_clinical_findings = ${fields.relevant_clinical_findings
          ? sql.json(fields.relevant_clinical_findings)
          : null},
        imaging_summary      = ${fields.imaging_summary ?? null},
        missing_information  = ${fields.missing_information
          ? sql.json(fields.missing_information)
          : null},
        provider_urgency_label = ${fields.provider_urgency_label
          ? sql.json(fields.provider_urgency_label)
          : null},
        matched_criteria     = ${fields.matched_criteria
          ? sql.json(fields.matched_criteria)
          : null},
        evidence             = ${fields.evidence
          ? sql.json(fields.evidence)
          : null},
        provider_label       = ${fields.provider_label ?? null},
        reasoning            = ${fields.reasoning ?? null},
        recommended_window   = ${fields.recommended_window ?? null},
        next_steps           = ${fields.next_steps ?? null},
        summary              = ${fields.summary ?? null},
        model_used           = ${fields.model_used ?? null},
        processing_time_ms   = ${fields.processing_time_ms ?? null},
        pipeline_version     = ${fields.pipeline_version ?? null},
        processed_at         = NOW()
      WHERE id = ${referral_id}
    `

    await writeAuditLog(
      referral_id,
      null, // system action, no user
      'pipeline_completed',
      { status: row.status, action: row.action },
      { status: newStatus, action: action ?? null },
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
