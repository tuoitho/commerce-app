import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../App'
import { authApi } from '@/api/auth'
import { tokenStore } from '@/api/tokenStore'

vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
}))

describe('Full Authentication Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tokenStore.clearToken()
    window.history.pushState({}, '', '/')
  })

  it('redirects unauthenticated user from / to /login', async () => {
    vi.mocked(authApi.refresh).mockRejectedValueOnce(new Error('Unauthorized'))

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Đăng nhập/i })).toBeInTheDocument()
    })
    expect(screen.getByText('AuraPhone Admin')).toBeInTheDocument()
  })

  it('allows admin login, redirects to dashboard, shows admin badge and email, and supports logout', async () => {
    vi.mocked(authApi.refresh).mockRejectedValueOnce(new Error('Unauthorized'))
    const adminUser = { id: 'admin-1', email: 'admin@auraphone.vn', role: 'admin' }

    vi.mocked(authApi.login).mockResolvedValueOnce({
      user: adminUser,
      accessToken: 'jwt-admin-token-123',
    })
    vi.mocked(authApi.logout).mockResolvedValueOnce()

    render(<App />)

    // Wait for login page
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Đăng nhập/i })).toBeInTheDocument()
    })

    // Fill form
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'admin@auraphone.vn' },
    })
    fireEvent.change(screen.getByLabelText(/Mật khẩu/i), {
      target: { value: 'Secret123!' },
    })

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }))

    // Expect dashboard shell to render with admin email and logout button
    await waitFor(() => {
      expect(screen.getByText('Bảng điều khiển quản trị hệ thống AuraPhone')).toBeInTheDocument()
    })
    expect(screen.getAllByText('admin@auraphone.vn').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Đăng xuất/i })).toBeInTheDocument()

    // Test logout button
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Đăng nhập/i })).toBeInTheDocument()
    })
  })

  it('denies access to non-admin user with Vietnamese error message', async () => {
    vi.mocked(authApi.refresh).mockRejectedValueOnce(new Error('Unauthorized'))
    const customerUser = { id: 'customer-1', email: 'customer@auraphone.vn', role: 'customer' }

    vi.mocked(authApi.login).mockResolvedValueOnce({
      user: customerUser,
      accessToken: 'jwt-customer-token',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Đăng nhập/i })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'customer@auraphone.vn' },
    })
    fireEvent.change(screen.getByLabelText(/Mật khẩu/i), {
      target: { value: 'CustomerPass123' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }))

    await waitFor(() => {
      expect(screen.getByText(/Tài khoản không có quyền truy cập trang quản trị/i)).toBeInTheDocument()
    })

    // Confirm we are still on the login page and not dashboard
    expect(screen.queryByText('Bảng điều khiển quản trị hệ thống AuraPhone')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Đăng nhập/i })).toBeInTheDocument()
  })
})
