type AuthEnv = {
  APP_AUTH_REQUIRED?: string
  APP_BASIC_AUTH_USER?: string
  APP_BASIC_AUTH_PASSWORD?: string
  NODE_ENV?: string
}

export type BasicAuthDecision =
  | { allowed: true }
  | { allowed: false; status: 401 | 503; reason: 'missing-config' | 'unauthorized' }

export function isBasicAuthRequired(env: AuthEnv = process.env): boolean {
  const explicit = (env.APP_AUTH_REQUIRED || 'auto').toLowerCase()

  if (['true', '1', 'yes', 'on'].includes(explicit)) return true
  if (['false', '0', 'no', 'off'].includes(explicit)) return false

  return env.NODE_ENV === 'production'
}

export function evaluateBasicAuth(request: Pick<Request, 'headers'>, env: AuthEnv = process.env): BasicAuthDecision {
  if (!isBasicAuthRequired(env)) return { allowed: true }

  const expectedUser = env.APP_BASIC_AUTH_USER
  const expectedPassword = env.APP_BASIC_AUTH_PASSWORD
  if (!expectedUser || !expectedPassword) {
    return { allowed: false, status: 503, reason: 'missing-config' }
  }

  const credentials = parseBasicAuth(request.headers.get('authorization'))
  if (!credentials) {
    return { allowed: false, status: 401, reason: 'unauthorized' }
  }

  if (credentials.user !== expectedUser || credentials.password !== expectedPassword) {
    return { allowed: false, status: 401, reason: 'unauthorized' }
  }

  return { allowed: true }
}

export function basicAuthHeaders(reason: BasicAuthDecision): HeadersInit {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
  }

  if (typeof reason === 'object' && reason && 'reason' in reason && reason.reason === 'unauthorized') {
    headers['WWW-Authenticate'] = 'Basic realm="Manjv Studio", charset="UTF-8"'
  }

  return headers
}

function parseBasicAuth(header: string | null): { user: string; password: string } | null {
  if (!header?.startsWith('Basic ')) return null

  try {
    const decoded = decodeBase64(header.slice('Basic '.length).trim())
    const splitAt = decoded.indexOf(':')
    if (splitAt < 0) return null

    return {
      user: decoded.slice(0, splitAt),
      password: decoded.slice(splitAt + 1),
    }
  } catch {
    return null
  }
}

function decodeBase64(value: string): string {
  if (typeof globalThis.atob !== 'function') {
    throw new Error('Base64 decoder is unavailable')
  }

  return globalThis.atob(value)
}
