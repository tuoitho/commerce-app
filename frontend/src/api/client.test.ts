import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, createApiClient, parseApiJson, serializeApiJson } from './client'
import { tokenStore } from './tokenStore'

const response = (body: unknown = { ok: true }) => new Response(JSON.stringify(body), { status: 200 })

describe('shared api client methods', () => {
  beforeEach(() => {
    tokenStore.set('access-token')
    vi.restoreAllMocks()
  })

  afterEach(() => tokenStore.set(null))

  it.each([
    ['put', api.put],
    ['patch', api.patch],
    ['delete', api.delete],
  ] as const)('sends %s with credentials and bearer token', async (method, call) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response())
    await call('/items/1', { value: 2 })
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/items/1', expect.objectContaining({
      method: method.toUpperCase(),
      credentials: 'include',
      headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      body: JSON.stringify({ value: 2 }),
    }))
  })

  it.each([
    ['post', api.post],
    ['put', api.put],
    ['patch', api.patch],
    ['delete', api.delete],
  ] as const)('refreshes once after 401 and retries %s with the new bearer token', async (method, call) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'refreshed' }), { status: 200 }))
      .mockResolvedValueOnce(response({ value: 'ok' }))

    await expect(call('/items/1', { selected: true })).resolves.toEqual({ value: 'ok' })
    expect(tokenStore.get()).toBe('refreshed')
    expect(fetchSpy).toHaveBeenNthCalledWith(3, '/api/v1/items/1', expect.objectContaining({
      method: method.toUpperCase(),
      credentials: 'include',
      headers: expect.objectContaining({ Authorization: 'Bearer refreshed' }),
    }))
  })

  it('preserves int64 JSON integer lexemes above Number.MAX_SAFE_INTEGER', () => {
    const body = parseApiJson('{"stockQuantity":9223372036854775807,"quantity":9007199254740993,"totalUnits":9223372036854775807}') as Record<string, bigint>
    expect(body.stockQuantity).toBe(9223372036854775807n)
    expect(body.quantity).toBe(9007199254740993n)
    expect(body.totalUnits).toBe(9223372036854775807n)
  })

  it('serializes bigint mutation quantities as JSON numbers', () => {
    expect(serializeApiJson({ quantity: 9223372036854775807n })).toBe('{"quantity":9223372036854775807}')
  })

  it.each([
    '{"stockQuantity":1.5}',
    '{"quantity":9223372036854775808}',
  ])('rejects successful responses with malformed int64 fields: %s', async (body) => {
    const client = createApiClient({
      fetch: vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    })

    await expect(client.get('/products/1')).rejects.toThrow()
  })
})
