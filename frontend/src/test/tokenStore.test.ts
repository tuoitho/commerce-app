import { describe, it, expect, beforeEach, vi } from 'vitest'
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

  it('notifies subscribers on setToken and clearToken', () => {
    const listener = vi.fn()
    const unsubscribe = tokenStore.subscribe(listener)

    tokenStore.setToken('token-1')
    expect(listener).toHaveBeenCalledWith('token-1')

    tokenStore.clearToken()
    expect(listener).toHaveBeenCalledWith(null)

    unsubscribe()
    tokenStore.setToken('token-2')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stores, retrieves and clears cached user profile', () => {
    expect(tokenStore.getUser()).toBeNull()
    const mockUser = { id: 'u1', email: 'test@example.com', role: 'customer' }
    tokenStore.setUser(mockUser)
    expect(tokenStore.getUser()).toEqual(mockUser)

    tokenStore.clearToken()
    expect(tokenStore.getUser()).toBeNull()
  })
})

