import type { ReferralAction, ReferralStatus } from './types'

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export const ACTION_CONFIG: Record<ReferralAction, {
  label: string
  shortLabel: string
  borderColor: string
  badgeBg: string
  badgeText: string
  sectionBg: string
  dotColor: string
}> = {
  'PRIORITY REVIEW': {
    label: 'Priority Review',
    shortLabel: 'Priority',
    borderColor:  'border-l-tertiary-container',
    badgeBg:      'bg-tertiary-container',
    badgeText:    'text-on-tertiary',
    sectionBg:    'bg-error-container/20',
    dotColor:     'bg-tertiary-container',
  },
  'SECONDARY APPROVAL': {
    label: 'Secondary Approval',
    shortLabel: 'Secondary',
    borderColor:  'border-l-[#D97706]',
    badgeBg:      'bg-secondary-container',
    badgeText:    'text-on-secondary-container',
    sectionBg:    'bg-secondary-container/20',
    dotColor:     'bg-[#D97706]',
  },
  'STANDARD QUEUE': {
    label: 'Standard Queue',
    shortLabel: 'Standard',
    borderColor:  'border-l-outline-variant',
    badgeBg:      'bg-surface-container-high',
    badgeText:    'text-on-surface-variant',
    sectionBg:    'bg-surface-container-low',
    dotColor:     'bg-outline-variant',
  },
}

export const STATUS_CONFIG: Record<ReferralStatus, { label: string; color: string }> = {
  pending:                 { label: 'Pending',            color: 'text-on-surface-variant bg-surface-container-high' },
  failed:                  { label: 'Failed',             color: 'text-on-error bg-error' },
  ready:                   { label: 'Ready',              color: 'text-on-surface-variant bg-surface-container-high' },
  reviewed:                { label: 'Reviewed',           color: 'text-on-secondary-container bg-secondary-container' },
  approved:                { label: 'Approved',           color: 'text-on-primary bg-primary-container' },
  escalated:               { label: 'Escalated',          color: 'text-on-tertiary bg-tertiary-container' },
  escalated_to_md:         { label: 'Awaiting MD',        color: 'text-on-surface border border-outline-variant/30 bg-surface-container-high' },
  md_reviewed:             { label: 'MD Responded',       color: 'text-primary bg-primary-fixed/30' },
  approved_for_scheduling: { label: 'Ready to Schedule',  color: 'text-on-primary-container bg-primary-container' },
  scheduled:               { label: 'Scheduled',          color: 'text-on-secondary-container bg-secondary-container' },
  archived:                { label: 'Archived',           color: 'text-outline bg-surface-container-high' },
  routed:                  { label: 'Routed',             color: 'text-primary bg-primary-fixed/30' },
}
