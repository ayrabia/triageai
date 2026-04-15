import type { ReferralDetail, ReferralStatus, ReferralSummary } from './types'

// All calls go through the Next.js proxy (/api/* → FastAPI)
const BASE = '/api'

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export async function getQueue(
  token: string,
  action?: string,
  status?: string,
): Promise<ReferralSummary[]> {
  const params = new URLSearchParams({ limit: '200' })
  if (action) params.set('action', action)
  if (status) params.set('status', status)
  const url = `${BASE}/referrals?${params.toString()}`
  const res = await fetch(url, {
    headers: authHeaders(token),
    cache: 'no-store',
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(`Failed to fetch queue: ${res.status}`)
  return res.json()
}

export async function getReferral(id: string, token: string): Promise<ReferralDetail> {
  const res = await fetch(`${BASE}/referrals/${id}`, {
    headers: authHeaders(token),
    cache: 'no-store',
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (res.status === 403) throw new Error('FORBIDDEN')
  if (res.status === 404) throw new Error('NOT_FOUND')
  if (!res.ok) throw new Error(`Failed to fetch referral: ${res.status}`)
  return res.json()
}

export async function uploadReferral(
  file: File,
  token: string,
): Promise<{ referral_id: string; status: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/referrals/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json()
}

export async function getPdfUrl(id: string, token: string): Promise<string> {
  const res = await fetch(`${BASE}/referrals/${id}/pdf`, {
    headers: authHeaders(token),
    cache: 'no-store',
  })
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
  token: string,
): Promise<ReferralDetail> {
  const res = await fetch(`${BASE}/referrals/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ status }),
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(`Failed to update status: ${res.status}`)
  return res.json()
}
