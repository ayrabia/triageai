export type ReferralAction =
  | 'PRIORITY REVIEW'
  | 'SECONDARY APPROVAL'
  | 'STANDARD QUEUE'

export type ReferralStatus =
  | 'pending'
  | 'failed'
  | 'ready'
  | 'reviewed'
  | 'approved'
  | 'escalated'
  | 'escalated_to_md'
  | 'md_reviewed'
  | 'approved_for_scheduling'
  | 'scheduled'
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
  scheduling_window: string | null
  missing_information: string[] | null
  received_at: string
  processed_at: string | null
  routed_to: string | null
}

export interface ReferralNote {
  id: string
  referral_id: string
  clinic_id: string
  author_id: string | null
  author_name: string
  author_role: string
  body: string
  created_at: string
}

export interface ArchivedReferral {
  id: string
  filename: string | null
  action: ReferralAction | null
  referral_reason: string | null
  summary: string | null
  received_at: string
  patient_name: string | null
  patient_dob: string | null
  referring_provider: string | null
}

export interface PatientRecord {
  patient_name: string | null
  patient_dob: string | null
  referring_provider: string | null
  referral_count: number
  last_referral_at: string
  referrals: ArchivedReferral[]
}

export interface ReferralDetail {
  id: string
  clinic_id: string
  s3_key: string
  status: ReferralStatus
  action: ReferralAction | null
  filename: string | null
  patient_name: string | null
  patient_dob: string | null
  referring_provider: string | null
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
  scheduling_window: string | null
  physician_note: string | null
  escalated_by: string | null
  escalated_by_name: string | null
  next_steps: string | null
  summary: string | null
  model_used: string | null
  processing_time_ms: number | null
  pipeline_version: string | null
  received_at: string
  processed_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  reviewed_by_name: string | null
  routed_to: string | null
  routed_to_name: string | null
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
