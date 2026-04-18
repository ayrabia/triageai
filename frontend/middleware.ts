import { NextRequest, NextResponse } from 'next/server'

const NON_CLINIC_SUBDOMAINS = new Set(['www', 'api', ''])
const CLINIC_PORTAL_PATH = '/clinic-portal'

export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').split(':')[0]
  const subdomain = getSubdomain(host)

  if (subdomain === 'app') {
    const pathname = request.nextUrl.pathname
    if (pathname === CLINIC_PORTAL_PATH || pathname.startsWith('/api/')) return NextResponse.next()
    const url = request.nextUrl.clone()
    url.hostname = url.hostname.replace(/^app\./, 'sacent.')
    return NextResponse.redirect(url, 302)
  }

  if (!subdomain || NON_CLINIC_SUBDOMAINS.has(subdomain)) return NextResponse.next()

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
