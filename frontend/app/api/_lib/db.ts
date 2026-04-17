/**
 * PostgreSQL connection pool for Next.js Route Handlers.
 *
 * Uses the `postgres` package (tagged template literals = natural parameterization,
 * no SQL injection possible when values are interpolated via ${}).
 *
 * The global singleton pattern prevents multiple pools during Next.js dev hot reloads.
 * In production (ECS, long-running process) there is always exactly one pool.
 */

import postgres from 'postgres'
import crypto from 'crypto'

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: ReturnType<typeof postgres> | undefined
}

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL environment variable is not set')

// Append sslmode=require if not already present — enforces encrypted transit to RDS
const dbUrl = DATABASE_URL.includes('sslmode') ? DATABASE_URL : `${DATABASE_URL}?sslmode=require`

export const sql = global._pgPool ?? postgres(dbUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: { rejectUnauthorized: false }, // RDS uses AWS-managed certs; sslmode=require is enforced above
})

if (process.env.NODE_ENV !== 'production') global._pgPool = sql

// ---------------------------------------------------------------------------
// DB row types (minimal — enough for the route handlers)
// ---------------------------------------------------------------------------

export interface DbUser {
  id: string
  clinic_id: string
  auth_provider_id: string
  role: string
  name: string
  email: string
}

export interface DbReferral {
  id: string
  clinic_id: string
  s3_key: string
  filename: string | null
  status: string
  action: string | null
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
  received_at: string
  processed_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  routed_to: string | null
  routed_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Audit log helper — used by every mutating route handler
// ---------------------------------------------------------------------------

export async function writeAuditLog(
  referralId: string | null,
  userId: string | null,
  action: string,
  oldValue?: Record<string, unknown> | null,
  newValue?: Record<string, unknown> | null,
  ipAddress?: string | null,
) {
  await sql`
    INSERT INTO audit_log (id, referral_id, user_id, action, old_value, new_value, ip_address)
    VALUES (
      ${crypto.randomUUID()},
      ${referralId},
      ${userId},
      ${action},
      ${oldValue ? sql.json(oldValue as unknown as Record<string, never>) : null},
      ${newValue ? sql.json(newValue as unknown as Record<string, never>) : null},
      ${ipAddress ?? null}
    )
  `
}
