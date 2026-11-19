import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ResetPasswordPage } from './ResetPasswordPage'
import { ToastProvider } from '@/context/ToastContext'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/types'

vi.mock('@/api/auth', () => ({
  authApi: {
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
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

function renderResetPage(initialEntry: string | { pathname: string; state?: unknown } = '/reset-password') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  )
}

describe('ResetPasswordPage (Req 3.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('prefills email from route state and allows editing it directly', () => {
    renderResetPage({
      pathname: '/reset-password',
      state: { email: 'recovery@example.com', cooldownSeconds: 60 },
    })

    const emailInput = screen.getByLabelText(/Email/i) as HTMLInputElement
    expect(emailInput.value).toBe('recovery@example.com')

    fireEvent.change(emailInput, { target: { value: 'edited@example.com' } })
    expect(emailInput.value).toBe('edited@example.com')
  })

  it('prefills email from query param when state is absent', () => {
    renderResetPage('/reset-password?email=query@example.com')

    const emailInput = screen.getByLabelText(/Email/i) as HTMLInputElement
    expect(emailInput.value).toBe('query@example.com')
  })

  it('validates that confirmPassword matches newPassword before submitting', () => {
    renderResetPage({
      pathname: '/reset-password',
      state: { email: 'recovery@example.com', cooldownSeconds: 60 },
    })

    fireEvent.change(screen.getByLabelText(/Mã OTP/i), { target: { value: '025431' } })
    fireEvent.change(screen.getByLabelText(/^Mật khẩu mới$/i), {
      target: { value: 'NewPassword123@' },
    })
    fireEvent.change(screen.getByLabelText(/Xác nhận mật khẩu mới/i), {
      target: { value: 'Mismatch123@' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Đặt lại mật khẩu/i }))

    expect(authApi.resetPassword).not.toHaveBeenCalled()
    expect(screen.getByText(/Mật khẩu xác nhận không khớp/i)).toBeInTheDocument()
  })

  it('validates 6-digit OTP format before calling resetPassword', () => {
    renderResetPage({
      pathname: '/reset-password',
      state: { email: 'recovery@example.com', cooldownSeconds: 60 },
    })

    fireEvent.change(screen.getByLabelText(/Mã OTP/i), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText(/^Mật khẩu mới$/i), {
      target: { value: 'NewPassword123@' },
    })
    fireEvent.change(screen.getByLabelText(/Xác nhận mật khẩu mới/i), {
      target: { value: 'NewPassword123@' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Đặt lại mật khẩu/i }))

    expect(authApi.resetPassword).not.toHaveBeenCalled()
    expect(screen.getByText(/Mã OTP phải gồm đúng 6 chữ số/i)).toBeInTheDocument()
  })

  it('displays server 400 invalid_or_expired_otp error clearly', async () => {
    vi.mocked(authApi.resetPassword).mockRejectedValueOnce(
      new ApiError(400, {
        code: 'invalid_or_expired_otp',
        message: 'Mã xác thực không chính xác hoặc đã hết hạn',
      })
    )

    renderResetPage({
      pathname: '/reset-password',
      state: { email: 'recovery@example.com', cooldownSeconds: 60 },
    })

    fireEvent.change(screen.getByLabelText(/Mã OTP/i), { target: { value: '000000' } })
    fireEvent.change(screen.getByLabelText(/^Mật khẩu mới$/i), {
      target: { value: 'NewPassword123@' },
    })
    fireEvent.change(screen.getByLabelText(/Xác nhận mật khẩu mới/i), {
      target: { value: 'NewPassword123@' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Đặt lại mật khẩu/i }))

    await waitFor(() => {
      expect(screen.getByText('Mã xác thực không chính xác hoặc đã hết hạn')).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('submits resetPassword and redirects to /login with success notification', async () => {
    vi.mocked(authApi.resetPassword).mockResolvedValueOnce({ reset: true })

    renderResetPage({
      pathname: '/reset-password',
      state: { email: 'recovery@example.com', cooldownSeconds: 60 },
    })

    fireEvent.change(screen.getByLabelText(/Mã OTP/i), { target: { value: '025431' } })
    fireEvent.change(screen.getByLabelText(/^Mật khẩu mới$/i), {
      target: { value: 'NewPassword123@' },
    })
    fireEvent.change(screen.getByLabelText(/Xác nhận mật khẩu mới/i), {
      target: { value: 'NewPassword123@' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Đặt lại mật khẩu/i }))

    await waitFor(() => {
      expect(authApi.resetPassword).toHaveBeenCalledWith({
        email: 'recovery@example.com',
        otp: '025431',
        newPassword: 'NewPassword123@',
      })
      expect(mockNavigate).toHaveBeenCalledWith('/login', {
        replace: true,
        state: {
          passwordResetSuccess: true,
        },
      })
    })
  })

  it('counts down 60s on Gửi lại mã button and allows resending after countdown finishes', async () => {
    vi.useFakeTimers()
    vi.mocked(authApi.forgotPassword).mockResolvedValueOnce({ cooldownSeconds: 60 })

    renderResetPage({
      pathname: '/reset-password',
      state: { email: 'recovery@example.com', cooldownSeconds: 60 },
    })

    const resendBtn = screen.getByRole('button', { name: /Gửi lại mã/i })
    expect(resendBtn).toBeDisabled()
    expect(resendBtn).toHaveTextContent(/60s/)

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(resendBtn).not.toBeDisabled()
    expect(resendBtn).toHaveTextContent(/^Gửi lại mã$/)

    await act(async () => {
      fireEvent.click(resendBtn)
    })

    expect(authApi.forgotPassword).toHaveBeenCalledWith('recovery@example.com')
    expect(resendBtn).toBeDisabled()
    expect(resendBtn).toHaveTextContent(/60s/)
  })
})
