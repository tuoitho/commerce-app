import { describe, it, expect, beforeEach } from 'vitest'
import { tokenStore } from '@/api/tokenStore'

describe('tokenStore', () => {
  beforeEach(() => {
    tokenStore.clearToken()
  })

  it('stores and retrieves token correctly in memory', () => {
    expect(tokenStore.getToken()).toBeNull()
    tokenStore.setToken('test-access-token')
    expect(tokenStore.getToken()).toBe('test-access-token')
    tokenStore.clearToken()
    expect(tokenStore.getToken()).toBeNull()
  })
})
