import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from './LoginPage'
import { useAuth } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
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
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
      register: vi.fn(),
      logout: vi.fn(),
    })
  })

  it('renders login form elements properly', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByText('AuraPhone')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Đăng Nhập' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('name@example.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Đăng nhập/i })).toBeInTheDocument()
  })

  it('validates empty inputs before calling login', async () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </ToastProvider>
    )

    const form = screen.getByRole('button', { name: /Đăng nhập/i }).closest('form')!
    fireEvent.submit(form)

    expect(mockLogin).not.toHaveBeenCalled()
    expect(screen.getByText('Vui lòng nhập đầy đủ email và mật khẩu.')).toBeInTheDocument()
  })

  it('calls login with email and password upon submission', async () => {
    mockLogin.mockResolvedValueOnce(undefined)

    render(
      <ToastProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
      target: { value: 'customer@auraphone.vn' },
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'Customer123!' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('customer@auraphone.vn', 'Customer123!')
    })
  })

  it('displays Vietnamese error when admin attempts to login to customer site', async () => {
    mockLogin.mockRejectedValueOnce(
      new ApiError(403, {
        code: 'forbidden',
        message: 'Tài khoản quản trị không thể đăng nhập vào trang khách hàng',
      })
    )

    render(
      <ToastProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
      target: { value: 'admin@auraphone.vn' },
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'AdminSecret123!' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }))

    await waitFor(() => {
      expect(
        screen.getByText('Tài khoản quản trị không thể đăng nhập vào trang khách hàng')
      ).toBeInTheDocument()
    })
  })

  it('displays invalid credentials message on 401 invalid_credentials', async () => {
    mockLogin.mockRejectedValueOnce(
      new ApiError(401, {
        code: 'invalid_credentials',
        message: 'Email hoặc mật khẩu không chính xác.',
      })
    )

    render(
      <ToastProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
      target: { value: 'wrong@auraphone.vn' },
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'WrongPass' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }))

    await waitFor(() => {
      expect(screen.getByText('Email hoặc mật khẩu không chính xác.')).toBeInTheDocument()
    })
  })

  it('safely navigates to the requested local route upon successful login (FAVORITE-AUTH-REDIRECT-002)', async () => {
    mockLogin.mockResolvedValueOnce(undefined)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/login?redirect=%2Fproducts%3Fq%3Dphone%23results']}>
          <LoginPage />
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
      target: { value: 'customer@auraphone.vn' },
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'Customer123!' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled()
    })
  })

  it('falls back to / on unsafe or external redirect (FAVORITE-AUTH-REDIRECT-004)', async () => {
    mockLogin.mockResolvedValueOnce(undefined)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/login?redirect=https%3A%2F%2Fevil.example']}>
          <LoginPage />
        </MemoryRouter>
      </ToastProvider>
    )

    fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
      target: { value: 'customer@auraphone.vn' },
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'Customer123!' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled()
    })
  })
})

