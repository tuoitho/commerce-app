import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Smartphone, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'
  const navigate = useNavigate()
  const { login } = useAuth()
  const { success } = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!email || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ email và mật khẩu.')
      return
    }

    setIsLoading(true)
    try {
      await login(email, password)
      success('Đăng nhập thành công!', 'Chào mừng bạn quay trở lại.')
      navigate(redirect, { replace: true })
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'invalid_credentials') {
          setErrorMessage('Email hoặc mật khẩu không chính xác.')
        } else {
          setErrorMessage(err.message || 'Đăng nhập thất bại. Vui lòng thử lại.')
        }
      } else {
        setErrorMessage('Đã xảy ra lỗi kết nối. Vui lòng thử lại.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12 bg-slate-50/60">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-2 font-bold text-2xl text-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <Smartphone className="h-5 w-5 text-emerald-400" />
            </div>
            <span>AuraPhone</span>
          </Link>
          <p className="text-xs text-slate-500">Đăng nhập tài khoản để quản lý giỏ hàng</p>
        </div>

        <Card className="rounded-3xl border-slate-200/90 shadow-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-bold text-center">Đăng Nhập</CardTitle>
            <CardDescription className="text-center text-xs">
              Nhập email và mật khẩu của bạn để tiếp tục
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
                <label className="text-xs font-bold text-slate-700">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
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
                <label className="text-xs font-bold text-slate-700">Mật khẩu</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                className="w-full h-12 rounded-xl font-bold text-sm shadow-md shadow-emerald-600/20 gap-2 mt-2"
              >
                <span>Đăng nhập</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col items-center justify-center border-t border-slate-100 pt-4 text-xs text-slate-500">
            <div>
              Chưa có tài khoản?{' '}
              <Link
                to={`/register${redirect !== '/' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}
                className="font-bold text-emerald-600 hover:underline"
              >
                Đăng ký ngay
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
