import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ForgotPasswordPage } from './ForgotPasswordPage'
import { ToastProvider } from '@/context/ToastContext'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/types'

vi.mock('@/api/auth', () => ({
  authApi: {
    forgotPassword: vi.fn(),
  },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/login" element={<div>Login Target</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  )
}

describe('ForgotPasswordPage (Req 3.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email input, submit button, and back-to-login link', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /Quên Mật Khẩu/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Gửi mã xác thực/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Quay lại đăng nhập/i })).toHaveAttribute('href', '/login')
  })

  it('validates empty or invalid email before calling forgotPassword', () => {
    renderPage()

    const form = screen.getByRole('button', { name: /Gửi mã xác thực/i }).closest('form')!
    fireEvent.submit(form)

    expect(authApi.forgotPassword).not.toHaveBeenCalled()
    expect(screen.getByText(/Vui lòng nhập địa chỉ email hợp lệ/i)).toBeInTheDocument()
  })

  it('calls forgotPassword and navigates to /reset-password with email and cooldownSeconds state', async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValueOnce({ cooldownSeconds: 60 })
    renderPage()

    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'recovery@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Gửi mã xác thực/i }))

    await waitFor(() => {
      expect(authApi.forgotPassword).toHaveBeenCalledWith('recovery@example.com')
      expect(mockNavigate).toHaveBeenCalledWith('/reset-password', {
        state: { email: 'recovery@example.com', cooldownSeconds: 60 },
      })
    })
  })

  it('displays inline rate-limit error on 429 otp_rate_limited', async () => {
    vi.mocked(authApi.forgotPassword).mockRejectedValueOnce(
      new ApiError(429, {
        code: 'otp_rate_limited',
        message: 'Bạn đã yêu cầu mã xác thực quá nhiều lần. Vui lòng thử lại sau 15 phút.',
      })
    )
    renderPage()

    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'ratelimit@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Gửi mã xác thực/i }))

    await waitFor(() => {
      expect(
        screen.getByText('Bạn đã yêu cầu mã xác thực quá nhiều lần. Vui lòng thử lại sau 15 phút.')
      ).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('displays inline delivery error on 502 email_delivery_failed', async () => {
    vi.mocked(authApi.forgotPassword).mockRejectedValueOnce(
      new ApiError(502, {
        code: 'email_delivery_failed',
        message: 'Không thể gửi email xác thực lúc này. Vui lòng thử lại sau.',
      })
    )
    renderPage()

    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'recovery@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Gửi mã xác thực/i }))

    await waitFor(() => {
      expect(
        screen.getByText('Không thể gửi email xác thực lúc này. Vui lòng thử lại sau.')
      ).toBeInTheDocument()
    })
  })

  it('displays validation error from server fields.email on 400 validation_error', async () => {
    vi.mocked(authApi.forgotPassword).mockRejectedValueOnce(
      new ApiError(400, {
        code: 'validation_error',
        message: 'Dữ liệu không hợp lệ',
        fields: { email: 'Địa chỉ email không hợp lệ' },
      })
    )
    renderPage()

    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'bad@test.local' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Gửi mã xác thực/i }))

    await waitFor(() => {
      expect(screen.getByText('Địa chỉ email không hợp lệ')).toBeInTheDocument()
    })
  })
})
