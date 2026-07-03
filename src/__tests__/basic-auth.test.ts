import { describe, expect, it } from 'vitest'

import { basicAuthHeaders, evaluateBasicAuth, isBasicAuthRequired } from '@/lib/basic-auth'

function requestWithAuth(value?: string) {
  return new Request('http://localhost:3100/projects', {
    headers: value ? { authorization: value } : undefined,
  })
}

function basic(user: string, password: string) {
  return `Basic ${btoa(`${user}:${password}`)}`
}

describe('Basic Auth deployment guard', () => {
  it('默认只在 production 要求认证', () => {
    expect(isBasicAuthRequired({ NODE_ENV: 'development' })).toBe(false)
    expect(isBasicAuthRequired({ NODE_ENV: 'test' })).toBe(false)
    expect(isBasicAuthRequired({ NODE_ENV: 'production' })).toBe(true)
  })

  it('允许显式开关覆盖默认环境策略', () => {
    expect(isBasicAuthRequired({ NODE_ENV: 'production', APP_AUTH_REQUIRED: 'false' })).toBe(false)
    expect(isBasicAuthRequired({ NODE_ENV: 'development', APP_AUTH_REQUIRED: 'true' })).toBe(true)
  })

  it('production 未配置用户名密码时 fail closed', () => {
    expect(evaluateBasicAuth(requestWithAuth(), { NODE_ENV: 'production' })).toEqual({
      allowed: false,
      status: 503,
      reason: 'missing-config',
    })
  })

  it('认证缺失或错误时返回 401 challenge', () => {
    const env = {
      NODE_ENV: 'production',
      APP_BASIC_AUTH_USER: 'admin',
      APP_BASIC_AUTH_PASSWORD: 'secret',
    }

    const decision = evaluateBasicAuth(requestWithAuth(basic('admin', 'wrong')), env)
    expect(decision).toEqual({ allowed: false, status: 401, reason: 'unauthorized' })

    expect(basicAuthHeaders(decision)).toMatchObject({
      'Cache-Control': 'no-store',
      'WWW-Authenticate': 'Basic realm="Manjv Studio", charset="UTF-8"',
    })
  })

  it('用户名密码匹配时放行', () => {
    const env = {
      NODE_ENV: 'production',
      APP_BASIC_AUTH_USER: 'admin',
      APP_BASIC_AUTH_PASSWORD: 'secret',
    }

    expect(evaluateBasicAuth(requestWithAuth(basic('admin', 'secret')), env)).toEqual({ allowed: true })
  })
})
