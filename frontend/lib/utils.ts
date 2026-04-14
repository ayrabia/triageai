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
  badgeBg: string
  badgeText: string
  borderColor: string
  headerBg: string
  dotColor: string
}> = {
  'PRIORITY REVIEW': {
    label: 'Priority Review',
    shortLabel: 'Priority',
    badgeBg: 'bg-red-600',
    badgeText: 'text-white',
    borderColor: 'border-l-red-500',
    headerBg: 'bg-red-50',
    dotColor: 'bg-red-500',
  },
  'SECONDARY APPROVAL': {
    label: 'Secondary Approval',
    shortLabel: 'Secondary',
    badgeBg: 'bg-amber-500',
    badgeText: 'text-white',
    borderColor: 'border-l-amber-400',
    headerBg: 'bg-amber-50',
    dotColor: 'bg-amber-500',
  },
  'STANDARD QUEUE': {
    label: 'Standard Queue',
    shortLabel: 'Standard',
    badgeBg: 'bg-slate-400',
    badgeText: 'text-white',
    borderColor: 'border-l-slate-300',
    headerBg: 'bg-slate-50',
    dotColor: 'bg-slate-400',
  },
}

export const STATUS_CONFIG: Record<ReferralStatus, { label: string; color: string }> = {
  pending:   { label: 'Pending',    color: 'text-slate-500 bg-slate-100' },
  failed:    { label: 'Failed',     color: 'text-red-700 bg-red-100' },
  reviewed:  { label: 'Reviewed',   color: 'text-blue-700 bg-blue-100' },
  approved:  { label: 'Approved',   color: 'text-green-700 bg-green-100' },
  escalated: { label: 'Escalated',  color: 'text-red-700 bg-red-100' },
  archived:  { label: 'Archived',   color: 'text-slate-400 bg-slate-100' },
}
