import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LoginPage } from './LoginPage'
import { useAuth } from '@/context/AuthContext'
import { ApiError } from '@/api/types'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

describe('LoginPage', () => {
  const mockLogin = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      role: null,
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
      logout: vi.fn(),
    })
  })

  it('renders login form elements properly', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    expect(screen.getByText('AuraPhone Admin')).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Mật khẩu/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Đăng nhập/i })).toBeInTheDocument()
  })

  it('validates empty inputs before calling login', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/Mật khẩu/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }))

    expect(mockLogin).not.toHaveBeenCalled()
    expect(screen.getByText(/Vui lòng nhập đầy đủ email và mật khẩu/i)).toBeInTheDocument()
  })

  it('calls login with email and password upon submission', async () => {
    mockLogin.mockResolvedValueOnce(undefined)

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'admin@auraphone.vn' },
    })
    fireEvent.change(screen.getByLabelText(/Mật khẩu/i), {
      target: { value: 'AdminSecret123!' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin@auraphone.vn', 'AdminSecret123!')
    })
  })

  it('displays Vietnamese error message when login fails', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Tài khoản không có quyền truy cập trang quản trị'))

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'customer@auraphone.vn' },
    })
    fireEvent.change(screen.getByLabelText(/Mật khẩu/i), {
      target: { value: 'Customer123!' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }))

    await waitFor(() => {
      expect(screen.getByText('Tài khoản không có quyền truy cập trang quản trị')).toBeInTheDocument()
    })
  })

  it('redirects to dashboard if already authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'admin-1', email: 'admin@auraphone.vn', role: 'admin' },
      role: 'admin',
      isAuthenticated: true,
      isLoading: false,
      login: mockLogin,
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Trang Chủ Quản Trị</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Trang Chủ Quản Trị')).toBeInTheDocument()
  })

  it('displays the locked account message on 403 account_locked and stays on the login page', async () => {
    mockLogin.mockRejectedValueOnce(
      new ApiError(403, {
        code: 'account_locked',
        message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ bộ phận hỗ trợ.',
      })
    )

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Trang tổng quan</div>} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'locked@auraphone.vn' } })
    fireEvent.change(screen.getByLabelText(/Mật khẩu/i), { target: { value: 'Password123' } })
    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }))

    await waitFor(() => {
      expect(screen.getByText('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ bộ phận hỗ trợ.')).toBeInTheDocument()
    })
    expect(screen.queryByText('Trang tổng quan')).not.toBeInTheDocument()
  })
})
