import { NextRequest, NextResponse } from 'next/server'

// Subdomains that are not clinic portals
const NON_CLINIC_SUBDOMAINS = new Set(['app', 'www', 'api', ''])

export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').split(':')[0]
  const slug = extractClinicSlug(host)

  if (!slug) return NextResponse.next()

  const headers = new Headers(request.headers)
  headers.set('x-clinic-slug', slug)
  return NextResponse.next({ request: { headers } })
}

function extractClinicSlug(hostname: string): string | null {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return null

  const parts = hostname.split('.')
  if (parts.length < 3) return null

  const subdomain = parts[0]
  return NON_CLINIC_SUBDOMAINS.has(subdomain) ? null : subdomain
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
