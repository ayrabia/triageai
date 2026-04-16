export type ReferralAction =
  | 'PRIORITY REVIEW'
  | 'SECONDARY APPROVAL'
  | 'STANDARD QUEUE'

export type ReferralStatus =
  | 'pending'
  | 'failed'
  | 'reviewed'
  | 'approved'
  | 'escalated'
  | 'archived'
  | 'routed'

export interface Physician {
  id: string
  name: string
  email: string
}

export interface ProviderUrgencyLabel {
  label: string
  source: string
}

export interface ReferralSummary {
  id: string
  clinic_id: string
  status: ReferralStatus
  action: ReferralAction | null
  filename: string | null
  referral_reason: string | null
  summary: string | null
  recommended_window: string | null
  missing_information: string[] | null
  received_at: string
  processed_at: string | null
  routed_to: string | null
}

export interface ReferralDetail {
  id: string
  clinic_id: string
  s3_key: string
  status: ReferralStatus
  action: ReferralAction | null
  referral_reason: string | null
  relevant_clinical_findings: string[] | null
  imaging_summary: string | null
  missing_information: string[] | null
  provider_urgency_label: ProviderUrgencyLabel | null
  referring_clinic_classification: string | null
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

export interface AuditEntry {
  id: string
  referral_id: string | null
  user_id: string | null
  action: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}
