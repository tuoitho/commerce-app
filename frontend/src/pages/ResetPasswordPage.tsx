import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Mail, Lock, KeyRound, ArrowRight, ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/types'
import { useToast } from '@/context/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_PATTERN = /^\d{6}$/

interface ResetLocationState {
  email?: string
  cooldownSeconds?: number
}

export function ResetPasswordPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { success } = useToast()

  const locationState = (location.state as ResetLocationState | null) ?? null
  const initialEmail = locationState?.email || searchParams.get('email') || ''
  const initialCooldown =
    typeof locationState?.cooldownSeconds === 'number' && locationState.cooldownSeconds > 0
      ? locationState.cooldownSeconds
      : 0

  const [email, setEmail] = useState(initialEmail)
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [cooldown, setCooldown] = useState(initialCooldown)
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev > 1 ? prev - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return
    setErrorMessage(null)
    setFieldErrors({})

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
      const msg = 'Vui lòng nhập địa chỉ email hợp lệ để gửi lại mã.'
      setFieldErrors({ email: msg })
      setErrorMessage(msg)
      return
    }

    setIsResending(true)
    try {
      const res = await authApi.forgotPassword(trimmedEmail)
      setCooldown(res.cooldownSeconds ?? 60)
      success('Đã gửi lại mã OTP', 'Vui lòng kiểm tra hộp thư để nhận mã xác thực mới.')
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.isValidationError() && err.fields) {
          setFieldErrors(err.fields)
          setErrorMessage(Object.values(err.fields)[0] || err.message)
        } else {
          setErrorMessage(err.message || 'Không thể gửi lại mã lúc này. Vui lòng thử lại.')
        }
      } else {
        setErrorMessage('Đã xảy ra lỗi kết nối. Vui lòng thử lại.')
      }
    } finally {
      setIsResending(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setFieldErrors({})

    const trimmedEmail = email.trim()
    const trimmedOtp = otp.trim()

    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
      const msg = 'Vui lòng nhập địa chỉ email hợp lệ.'
      setFieldErrors({ email: msg })
      setErrorMessage(msg)
      return
    }

    if (!OTP_PATTERN.test(trimmedOtp)) {
      const msg = 'Mã OTP phải gồm đúng 6 chữ số.'
      setFieldErrors({ otp: msg })
      setErrorMessage(msg)
      return
    }

    if (newPassword.length < 8 || newPassword.length > 72) {
      const msg = 'Mật khẩu mới phải từ 8 đến 72 ký tự.'
      setFieldErrors({ newPassword: msg })
      setErrorMessage(msg)
      return
    }

    if (newPassword !== confirmPassword) {
      const msg = 'Mật khẩu xác nhận không khớp.'
      setFieldErrors({ confirmPassword: msg })
      setErrorMessage(msg)
      return
    }

    setIsLoading(true)
    try {
      await authApi.resetPassword({
        email: trimmedEmail,
        otp: trimmedOtp,
        newPassword,
      })
      success('Đặt lại mật khẩu thành công!', 'Vui lòng đăng nhập bằng mật khẩu mới.')
      navigate('/login', {
        replace: true,
        state: { passwordResetSuccess: true },
      })
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.isValidationError() && err.fields) {
          setFieldErrors(err.fields)
          setErrorMessage(Object.values(err.fields)[0] || err.message)
        } else {
          setErrorMessage(err.message || 'Không thể đặt lại mật khẩu. Vui lòng thử lại.')
        }
      } else {
        setErrorMessage('Đã xảy ra lỗi kết nối. Vui lòng thử lại.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12 bg-[#f7f7f5]">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-3 font-bold text-2xl text-zinc-950">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white">
              <span className="font-display text-sm font-extrabold tracking-tighter text-emerald-400">
                AP
              </span>
            </div>
            <span className="font-display tracking-tight">AuraPhone</span>
          </Link>
          <p className="text-xs text-zinc-500">Xác nhận mã OTP và thiết lập mật khẩu mới</p>
        </div>

        <Card className="rounded-2xl border-zinc-200 shadow-xs">
          <CardHeader className="space-y-1.5 pb-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 text-center">
              OTP VERIFICATION
            </p>
            <CardTitle className="text-xl font-bold text-center text-zinc-950">
              Đặt Lại Mật Khẩu
            </CardTitle>
            <CardDescription className="text-center text-xs text-zinc-500">
              Nhập mã OTP 6 chữ số đã gửi qua email và mật khẩu mới của bạn
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {errorMessage && (
                <div
                  role="alert"
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium animate-fade-in"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="reset-email" className="text-xs font-bold text-zinc-700">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    error={Boolean(fieldErrors.email)}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      clearFieldError('email')
                    }}
                    className="pl-10 h-11 text-sm rounded-xl"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="reset-otp" className="text-xs font-bold text-zinc-700">
                    Mã OTP
                  </label>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={cooldown > 0 || isResending}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline disabled:text-zinc-400 disabled:no-underline disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`h-3 w-3 ${isResending ? 'animate-spin' : ''}`} />
                    <span>{cooldown > 0 ? `Gửi lại mã (${cooldown}s)` : 'Gửi lại mã'}</span>
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    id="reset-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={otp}
                    error={Boolean(fieldErrors.otp)}
                    onChange={(e) => {
                      setOtp(e.target.value)
                      clearFieldError('otp')
                    }}
                    className="pl-10 h-11 text-sm font-mono tracking-[0.25em] rounded-xl"
                    autoComplete="one-time-code"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="reset-new-password" className="text-xs font-bold text-zinc-700">
                  Mật khẩu mới
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    id="reset-new-password"
                    type="password"
                    placeholder="Tối thiểu 8 ký tự"
                    value={newPassword}
                    error={Boolean(fieldErrors.newPassword)}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      clearFieldError('newPassword')
                    }}
                    className="pl-10 h-11 text-sm rounded-xl"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="reset-confirm-password" className="text-xs font-bold text-zinc-700">
                  Xác nhận mật khẩu mới
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    id="reset-confirm-password"
                    type="password"
                    placeholder="Nhập lại mật khẩu mới"
                    value={confirmPassword}
                    error={Boolean(fieldErrors.confirmPassword)}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      clearFieldError('confirmPassword')
                    }}
                    className="pl-10 h-11 text-sm rounded-xl"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isLoading}
                className="w-full h-12 rounded-xl font-bold text-sm gap-2 mt-2"
              >
                <span>Đặt lại mật khẩu</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex items-center justify-between border-t border-zinc-100 pt-4 text-xs text-zinc-500">
            <Link
              to="/forgot-password"
              className="font-semibold text-emerald-700 hover:underline"
            >
              Đổi email nhận mã
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 font-semibold text-zinc-700 hover:text-emerald-700 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Quay lại đăng nhập</span>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
