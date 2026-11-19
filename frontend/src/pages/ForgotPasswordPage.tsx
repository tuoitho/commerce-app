import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Mail, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/types'
import { useToast } from '@/context/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface ForgotLocationState {
  email?: string
}

export function ForgotPasswordPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { success } = useToast()

  const initialEmail =
    (location.state as ForgotLocationState | null)?.email ||
    searchParams.get('email') ||
    ''

  const [email, setEmail] = useState(initialEmail)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setEmailError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
      const msg = 'Vui lòng nhập địa chỉ email hợp lệ.'
      setEmailError(msg)
      setErrorMessage(msg)
      return
    }

    setIsLoading(true)
    try {
      const res = await authApi.forgotPassword(trimmedEmail)
      success(
        'Đã gửi mã xác thực',
        'Nếu email tồn tại trong hệ thống, mã OTP đặt lại mật khẩu đã được gửi.'
      )
      navigate('/reset-password', {
        state: {
          email: trimmedEmail,
          cooldownSeconds: res.cooldownSeconds ?? 60,
        },
      })
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.isValidationError() && err.fields?.email) {
          setEmailError(err.fields.email)
          setErrorMessage(err.fields.email)
        } else {
          setErrorMessage(err.message || 'Không thể gửi yêu cầu lúc này. Vui lòng thử lại.')
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
          <p className="text-xs text-zinc-500">Khôi phục quyền truy cập tài khoản qua Email OTP</p>
        </div>

        <Card className="rounded-2xl border-zinc-200 shadow-xs">
          <CardHeader className="space-y-1.5 pb-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 text-center">
              PASSWORD RECOVERY
            </p>
            <CardTitle className="text-xl font-bold text-center text-zinc-950">
              Quên Mật Khẩu
            </CardTitle>
            <CardDescription className="text-center text-xs text-zinc-500">
              Nhập email đã đăng ký để nhận mã xác thực OTP gồm 6 chữ số
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
                <label htmlFor="forgot-email" className="text-xs font-bold text-zinc-700">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    error={Boolean(emailError)}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (emailError) setEmailError(null)
                    }}
                    className="pl-10 h-11 text-sm rounded-xl"
                    autoComplete="email"
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
                <span>Gửi mã xác thực</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col items-center justify-center border-t border-zinc-100 pt-4 text-xs text-zinc-500">
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
