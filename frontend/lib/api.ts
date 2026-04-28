import type { Physician, ReferralDetail, ReferralStatus, ReferralSummary } from './types'

const BASE = '/api'

export async function getQueue(
  opts: { action?: string; status?: string; assignedToMe?: boolean } = {},
): Promise<ReferralSummary[]> {
  const params = new URLSearchParams({ limit: '200' })
  if (opts.action) params.set('action', opts.action)
  if (opts.status) params.set('status', opts.status)
  if (opts.assignedToMe) params.set('assigned_to_me', 'true')
  const url = `${BASE}/referrals?${params.toString()}`
  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(`Failed to fetch queue: ${res.status}`)
  return res.json()
}

export async function getReferral(id: string): Promise<ReferralDetail> {
  const res = await fetch(`${BASE}/referrals/${id}`, { cache: 'no-store' })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (res.status === 403) throw new Error('FORBIDDEN')
  if (res.status === 404) throw new Error('NOT_FOUND')
  if (!res.ok) throw new Error(`Failed to fetch referral: ${res.status}`)
  return res.json()
}

export async function uploadReferral(
  file: File,
): Promise<{ referral_id: string; status: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/referrals/upload`, { method: 'POST', body: form })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json()
}

export async function getPdfUrl(id: string): Promise<string> {
  const res = await fetch(`${BASE}/referrals/${id}/pdf`, { cache: 'no-store' })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (res.status === 403) throw new Error('FORBIDDEN')
  if (res.status === 404) throw new Error('NOT_FOUND')
  if (!res.ok) throw new Error(`Failed to get PDF URL: ${res.status}`)
  const data = await res.json()
  return data.url
}

export async function updateStatus(
  id: string,
  status: ReferralStatus,
  extra?: { scheduling_window?: string },
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/referrals/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, ...extra }),
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(`Failed to update status: ${res.status}`)
  return res.json()
}

export async function respondToReferral(
  id: string,
  data: { physician_note: string; scheduling_window: string },
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/referrals/${id}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (res.status === 403) throw new Error('FORBIDDEN')
  if (!res.ok) throw new Error(`Failed to submit response: ${res.status}`)
  return res.json()
}

export async function getPhysicians(): Promise<Physician[]> {
  const res = await fetch(`${BASE}/users/physicians`, { cache: 'no-store' })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(`Failed to fetch physicians: ${res.status}`)
  return res.json()
}

export async function routeReferral(
  id: string,
  physicianId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/referrals/${id}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ physician_id: physicianId }),
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (res.status === 403) throw new Error('FORBIDDEN')
  if (!res.ok) throw new Error(`Failed to escalate referral: ${res.status}`)
  return res.json()
}
