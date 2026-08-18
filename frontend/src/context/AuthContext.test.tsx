import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './AuthContext'
import { authApi } from '@/api/auth'
import { tokenStore } from '@/api/tokenStore'

vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
}))

describe('AuthContext (Customer Store)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tokenStore.clearToken()
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  )

  it('restores customer session on initial load if token exists and getMe succeeds', async () => {
    const customerUser = { id: 'user-1', email: 'customer@auraphone.vn', role: 'customer' }
    tokenStore.setToken('token-customer-123')
    vi.mocked(authApi.getMe).mockResolvedValueOnce(customerUser)

    const { result } = renderHook(() => useAuth(), { wrapper })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(customerUser)
    expect(result.current.role).toBe('customer')
    expect(tokenStore.getToken()).toBe('token-customer-123')
  })

  it('rejects session on load if restored user has admin role', async () => {
    const adminUser = { id: 'admin-1', email: 'admin@auraphone.vn', role: 'admin' }
    tokenStore.setToken('token-admin-123')
    vi.mocked(authApi.getMe).mockResolvedValueOnce(adminUser)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(tokenStore.getToken()).toBeNull()
  })

  it('logs in successfully with customer credentials', async () => {
    tokenStore.clearToken()
    const customerUser = { id: 'user-1', email: 'customer@auraphone.vn', role: 'customer' }
    vi.mocked(authApi.login).mockResolvedValueOnce({
      user: customerUser,
      accessToken: 'jwt-customer-token',
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.login('customer@auraphone.vn', 'password123')
    })

    expect(authApi.login).toHaveBeenCalledWith('customer@auraphone.vn', 'password123')
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(customerUser)
    expect(result.current.role).toBe('customer')
    expect(tokenStore.getToken()).toBe('jwt-customer-token')
  })

  it('rejects login with Vietnamese error if user role is admin', async () => {
    const adminUser = { id: 'admin-1', email: 'admin@auraphone.vn', role: 'admin' }
    vi.mocked(authApi.login).mockResolvedValueOnce({
      user: adminUser,
      accessToken: 'jwt-admin-token',
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let errorThrown: unknown
    await act(async () => {
      try {
        await result.current.login('admin@auraphone.vn', 'password123')
      } catch (err) {
        errorThrown = err
      }
    })

    expect(errorThrown).toBeDefined()
    expect((errorThrown as Error).message).toContain('Tài khoản quản trị không thể đăng nhập vào trang khách hàng')
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(tokenStore.getToken()).toBeNull()
  })

  it('logs out and clears authentication state and tokens', async () => {
    const customerUser = { id: 'user-1', email: 'customer@auraphone.vn', role: 'customer' }
    tokenStore.setToken('token-customer-123')
    vi.mocked(authApi.getMe).mockResolvedValueOnce(customerUser)
    vi.mocked(authApi.logout).mockResolvedValueOnce()

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true)
    })

    await act(async () => {
      await result.current.logout()
    })

    expect(authApi.logout).toHaveBeenCalled()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(result.current.role).toBeNull()
    expect(tokenStore.getToken()).toBeNull()
  })
})
