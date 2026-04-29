import { NextRequest, NextResponse } from 'next/server'

const NON_CLINIC_SUBDOMAINS = new Set(['www', 'api', ''])

export function middleware(request: NextRequest) {
  // x-forwarded-host is set by the ALB and reflects the public hostname;
  // host can be the internal ECS hostname behind a proxy
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '').split(':')[0]
  const subdomain = getSubdomain(host)

  if (!subdomain || NON_CLINIC_SUBDOMAINS.has(subdomain) || subdomain === 'app') return NextResponse.next()

  const headers = new Headers(request.headers)
  headers.set('x-clinic-slug', subdomain)
  return NextResponse.next({ request: { headers } })
}

function getSubdomain(hostname: string): string | null {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return null
  const parts = hostname.split('.')
  if (parts.length < 3) return null
  return parts[0]
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
