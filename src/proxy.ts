import { NextResponse, type NextRequest } from 'next/server'

import { basicAuthHeaders, evaluateBasicAuth } from '@/lib/basic-auth'

const PUBLIC_PATHS = new Set(['/api/health', '/api/worker/health'])

export default function proxy(request: NextRequest) {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next()
  }

  const decision = evaluateBasicAuth(request)
  if (decision.allowed) {
    return NextResponse.next()
  }

  const message = decision.reason === 'missing-config'
    ? 'Manjv Studio access control is not configured.'
    : 'Authentication required.'

  return new NextResponse(message, {
    status: decision.status,
    headers: basicAuthHeaders(decision),
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
