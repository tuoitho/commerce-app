import { describe, expect, it } from 'vitest'

import { getInternalReturnPath } from './returnLocation'

describe('getInternalReturnPath', () => {
  it('preserves an internal pathname, search, and hash', () => {
    expect(getInternalReturnPath({ from: { pathname: '/cart', search: '?coupon=1', hash: '#summary' } })).toBe('/cart?coupon=1#summary')
  })

  it.each([
    'https://evil.example/path',
    '//evil.example/path',
    '/\\\\evil.example/path',
  ])('falls back for an unsafe return path: %s', (pathname) => {
    expect(getInternalReturnPath({ from: { pathname } })).toBe('/')
  })

  it('falls back when return state is missing or malformed', () => {
    expect(getInternalReturnPath(undefined)).toBe('/')
    expect(getInternalReturnPath({ from: { pathname: '/safe', search: { external: true } } })).toBe('/')
  })
})
