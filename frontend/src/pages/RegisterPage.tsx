import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

export function RegisterPage() {
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'
  const navigate = useNavigate()
  const { register } = useAuth()
  const { success } = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!email || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ email và mật khẩu.')
      return
    }

    if (password.length < 8) {
      setErrorMessage('Mật khẩu phải có tối thiểu 8 ký tự.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Mật khẩu xác nhận không khớp.')
      return
    }

    setIsLoading(true)
    try {
      await register(email, password)
      success('Tạo tài khoản thành công!', 'Chào mừng bạn đến với AuraPhone.')
      navigate(redirect, { replace: true })
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'email_in_use') {
          setErrorMessage('Email này đã được sử dụng. Vui lòng đăng nhập hoặc dùng email khác.')
        } else if (err.fields) {
          const firstFieldErr = Object.values(err.fields)[0]
          setErrorMessage(firstFieldErr || err.message)
        } else {
          setErrorMessage(err.message || 'Đăng ký thất bại. Vui lòng thử lại.')
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
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-3 font-bold text-2xl text-zinc-950">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white">
              <span className="font-display text-sm font-extrabold tracking-tighter text-emerald-400">
                AP
              </span>
            </div>
            <span className="font-display tracking-tight">AuraPhone</span>
          </Link>
          <p className="text-xs text-zinc-500">Tạo tài khoản mới để nhận nhiều ưu đãi</p>
        </div>

        <Card className="rounded-2xl border-zinc-200 shadow-xs">
          <CardHeader className="space-y-1.5 pb-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 text-center">
              ATELIER REGISTRATION
            </p>
            <CardTitle className="text-xl font-bold text-center text-zinc-950">Đăng Ký Tài Khoản</CardTitle>
            <CardDescription className="text-center text-xs text-zinc-500">
              Điền thông tin để bắt đầu trải nghiệm mua sắm
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium animate-fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 text-sm rounded-xl"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700">Mật khẩu</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    type="password"
                    placeholder="Tối thiểu 8 ký tự"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-11 text-sm rounded-xl"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700">Xác nhận mật khẩu</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    type="password"
                    placeholder="Nhập lại mật khẩu"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 h-11 text-sm rounded-xl"
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
                <span>Tạo tài khoản</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col items-center justify-center border-t border-zinc-100 pt-4 text-xs text-zinc-500">
            <div>
              Đã có tài khoản?{' '}
              <Link
                to={`/login${redirect !== '/' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}
                className="font-bold text-emerald-700 hover:underline"
              >
                Đăng nhập ngay
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
