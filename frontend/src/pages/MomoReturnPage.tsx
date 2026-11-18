import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  RotateCcw,
  ShoppingBag,
  ReceiptText,
} from 'lucide-react'
import { ordersApi } from '@/api/orders'
import { ApiError, type MomoReturnPayload, type Order } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, formatVND } from '@/lib/utils'
import {
  canRetryMomoPayment,
  getPaymentStatusBadge,
  retryMomoAndRedirect,
} from '@/lib/payment'

type ReturnViewState = 'verifying' | 'paid' | 'failed' | 'error'

function parseMomoReturnPayload(search: string): {
  payload: MomoReturnPayload | null
  gatewayMessage: string
} {
  const params = new URLSearchParams(search)
  const partnerCode = params.get('partnerCode') ?? ''
  const orderId = params.get('orderId') ?? ''
  const requestId = params.get('requestId') ?? ''
  const amount = params.get('amount') ?? ''
  const orderInfo = params.get('orderInfo') ?? ''
  const orderType = params.get('orderType') ?? ''
  const transId = params.get('transId') ?? ''
  const resultCodeRaw = params.get('resultCode')
  const message = params.get('message') ?? ''
  const payType = params.get('payType') ?? ''
  const responseTime = params.get('responseTime') ?? ''
  const extraData = params.get('extraData') ?? ''
  const signature = params.get('signature') ?? ''

  const resultCode = resultCodeRaw !== null && resultCodeRaw !== '' ? Number(resultCodeRaw) : NaN
  if (!orderId || !signature || !Number.isInteger(resultCode)) {
    return { payload: null, gatewayMessage: message }
  }

  return {
    payload: {
      partnerCode,
      orderId,
      requestId,
      amount,
      orderInfo,
      orderType,
      transId,
      resultCode,
      message,
      payType,
      responseTime,
      extraData,
      signature,
    },
    gatewayMessage: message,
  }
}

export function MomoReturnPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { refreshCart } = useCart()
  const { error: toastError } = useToast()

  const [viewState, setViewState] = useState<ReturnViewState>('verifying')
  const [order, setOrder] = useState<Order | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isRetrying, setIsRetrying] = useState(false)

  const mountedRef = useRef(true)
  const submittedSearchRef = useRef<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated) {
      const target = encodeURIComponent(`${location.pathname}${location.search}`)
      navigate(`/login?redirect=${target}`, { replace: true })
      return
    }

    if (submittedSearchRef.current === location.search) return
    submittedSearchRef.current = location.search

    const { payload, gatewayMessage } = parseMomoReturnPayload(location.search)
    if (!payload) {
      setViewState('error')
      setErrorMessage('Thiếu thông tin xác thực giao dịch từ MoMo.')
      return
    }

    setViewState('verifying')
    setErrorMessage('')

    ordersApi
      .confirmMomoReturn(payload)
      .then(async (verifiedOrder) => {
        if (!mountedRef.current) return
        setOrder(verifiedOrder)
        await refreshCart()
        if (!mountedRef.current) return
        if (verifiedOrder.paymentStatus === 'paid') {
          setViewState('paid')
        } else {
          setViewState('failed')
          setErrorMessage(
            gatewayMessage ||
              'Giao dịch đã bị hủy hoặc chưa được thanh toán tại cổng MoMo.'
          )
        }
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return
        setViewState('error')
        if (err instanceof ApiError) {
          setErrorMessage(err.message || 'Dữ liệu xác thực thanh toán MoMo không hợp lệ')
        } else {
          setErrorMessage('Không thể kết nối máy chủ để xác thực thanh toán MoMo.')
        }
      })
  }, [authLoading, isAuthenticated, location.pathname, location.search, navigate, refreshCart])

  const handleRetryPayment = async () => {
    if (!order) return
    setIsRetrying(true)
    try {
      const { redirected, order: retried } = await retryMomoAndRedirect(order.id)
      if (redirected) return
      setOrder(retried)
      navigate(`/orders/${order.id}`)
    } catch (err: unknown) {
      toastError(
        'Thanh toán lại thất bại',
        err instanceof ApiError ? err.message : 'Không thể tạo liên kết thanh toán MoMo mới.'
      )
    } finally {
      setIsRetrying(false)
    }
  }

  const paymentBadge = order ? getPaymentStatusBadge(order.paymentStatus) : null
  const retryAllowed = order ? canRetryMomoPayment(order) : false

  return (
    <div className="min-h-screen bg-[#f7f7f5] py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          {viewState === 'verifying' && (
            <div className="px-6 py-16 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-50 text-[#ae2070]">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950">
                Đang xác thực thanh toán MoMo
              </h1>
              <p className="text-sm text-zinc-500 max-w-md mx-auto">
                Vui lòng đợi trong giây lát trong khi hệ thống kiểm tra chữ ký giao dịch và cập nhật trạng thái đơn hàng.
              </p>
            </div>
          )}

          {viewState === 'paid' && order && (
            <div>
              <div className="bg-emerald-50/80 border-b border-emerald-100 px-6 py-8 text-center space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div className="space-y-1">
                  <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950">
                    Thanh toán MoMo thành công
                  </h1>
                  <p className="text-sm text-emerald-900/80">
                    Đơn hàng của bạn đã được thanh toán và tự động xác nhận để chuẩn bị giao.
                  </p>
                </div>
              </div>

              <div className="p-6 sm:p-8 space-y-6">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-zinc-500">Mã đơn hàng</span>
                    <span className="font-mono font-bold text-zinc-950">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-zinc-500">Trạng thái thanh toán</span>
                    {paymentBadge && (
                      <Badge variant="outline" className={paymentBadge.className}>
                        {paymentBadge.label}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-zinc-500">Số tiền thanh toán</span>
                    <span className="text-base font-extrabold text-zinc-950 tabular-nums">
                      {formatVND(order.totalVnd)}
                    </span>
                  </div>
                  {order.paymentTransactionId && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-zinc-500">Mã giao dịch MoMo</span>
                      <span className="font-mono font-semibold text-zinc-900">
                        {order.paymentTransactionId}
                      </span>
                    </div>
                  )}
                  {order.paidAt && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-zinc-500">Thời gian thanh toán</span>
                      <span className="font-medium text-zinc-800">
                        {formatDateTime(order.paidAt)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Link to={`/orders/${order.id}`} className="flex-1">
                    <Button className="w-full rounded-xl gap-2 bg-zinc-950 text-white hover:bg-zinc-800">
                      <ReceiptText className="h-4 w-4" />
                      <span>Xem chi tiết đơn hàng</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to="/orders" className="flex-1">
                    <Button variant="outline" className="w-full rounded-xl">
                      Lịch sử đơn hàng
                    </Button>
                  </Link>
                  <Link to="/products">
                    <Button variant="outline" className="w-full sm:w-auto rounded-xl gap-2">
                      <ShoppingBag className="h-4 w-4" />
                      <span>Tiếp tục mua sắm</span>
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {viewState === 'failed' && order && (
            <div>
              <div className="bg-rose-50/80 border-b border-rose-100 px-6 py-8 text-center space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm">
                  <XCircle className="h-8 w-8" />
                </div>
                <div className="space-y-1">
                  <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950">
                    Thanh toán MoMo chưa hoàn tất
                  </h1>
                  <p className="text-sm text-rose-900/90 max-w-md mx-auto">
                    {errorMessage}
                  </p>
                </div>
              </div>

              <div className="p-6 sm:p-8 space-y-6">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-zinc-500">Mã đơn hàng</span>
                    <span className="font-mono font-bold text-zinc-950">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-zinc-500">Trạng thái thanh toán</span>
                    {paymentBadge && (
                      <Badge variant="outline" className={paymentBadge.className}>
                        {paymentBadge.label}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-zinc-500">Số tiền</span>
                    <span className="text-base font-extrabold text-zinc-950 tabular-nums">
                      {formatVND(order.totalVnd)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  {retryAllowed && (
                    <Button
                      onClick={handleRetryPayment}
                      disabled={isRetrying}
                      className="flex-1 rounded-xl gap-2 bg-[#ae2070] text-white hover:bg-[#931a5e]"
                    >
                      {isRetrying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      <span>Thanh toán lại qua MoMo</span>
                    </Button>
                  )}
                  <Link to={`/orders/${order.id}`} className="flex-1">
                    <Button variant="outline" className="w-full rounded-xl gap-2">
                      <ReceiptText className="h-4 w-4" />
                      <span>Xem chi tiết đơn hàng</span>
                    </Button>
                  </Link>
                  <Link to="/orders">
                    <Button variant="outline" className="w-full sm:w-auto rounded-xl">
                      Danh sách đơn hàng
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {viewState === 'error' && (
            <div>
              <div className="bg-amber-50/80 border-b border-amber-100 px-6 py-8 text-center space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-sm">
                  <XCircle className="h-8 w-8" />
                </div>
                <div className="space-y-1">
                  <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950">
                    Không thể xác thực thanh toán MoMo
                  </h1>
                  <p className="text-sm text-amber-900/90 max-w-md mx-auto">
                    {errorMessage}
                  </p>
                </div>
              </div>

              <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/orders">
                  <Button className="w-full sm:w-auto rounded-xl bg-zinc-950 text-white hover:bg-zinc-800">
                    Kiểm tra đơn hàng của tôi
                  </Button>
                </Link>
                <Link to="/">
                  <Button variant="outline" className="w-full sm:w-auto rounded-xl">
                    Quay lại trang chủ
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
