import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Package,
  MapPin,
  CreditCard,
  Smartphone,
  Truck,
  Ban,
  RefreshCw,
  ShoppingBag,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ordersApi } from '@/api/orders'
import { cancelReturn } from '@/api/returns'
import { ApiError, type Order, type OrderStatus } from '@/api/types'
import { formatVND, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ReturnRequestDialog } from '@/components/ReturnRequestDialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

// Status styling & configuration mapping
interface StatusInfo {
  label: string
  badgeClass: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

const returnStatusMap: Record<
  string,
  { label: string; badgeClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending_approval: {
    label: 'Chờ xét duyệt',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
    icon: Clock,
  },
  approved: {
    label: 'Đã duyệt trả hàng',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200/80',
    icon: CheckCircle2,
  },
  received: {
    label: 'Shop đã nhận hàng',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200/80',
    icon: Package,
  },
  refunded: {
    label: 'Đã hoàn tiền',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Từ chối trả hàng',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200/80',
    icon: XCircle,
  },
  cancelled: {
    label: 'Đã hủy yêu cầu',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200/80',
    icon: RotateCcw,
  },
}

const returnReasonLabels: Record<string, string> = {
  defective: 'Sản phẩm lỗi / hư hỏng',
  not_as_described: 'Không giống mô tả',
  wrong_or_missing: 'Giao sai sản phẩm / thiếu phụ kiện',
  changed_mind: 'Không còn nhu cầu sử dụng',
}

const statusMap: Record<OrderStatus, StatusInfo> = {
  pending_confirmation: {
    label: 'Chờ xác nhận',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
    icon: Clock,
    description: 'Đơn hàng đang chờ xác nhận. Bạn có thể tự hủy đơn trong vòng 30 phút kể từ khi đặt.',
  },
  confirmed: {
    label: 'Đã xác nhận',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200/80',
    icon: CheckCircle2,
    description: 'Đơn hàng đã được xác nhận. Bạn vẫn có thể hủy đơn ngay trước khi cửa hàng chuẩn bị hàng.',
  },
  preparing: {
    label: 'Đang chuẩn bị hàng',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
    icon: Package,
    description: 'Cửa hàng đang chuẩn bị sản phẩm. Bạn có thể gửi yêu cầu hủy để người bán xét duyệt.',
  },
  cancel_requested: {
    label: 'Chờ duyệt hủy',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200/80',
    icon: AlertTriangle,
    description: 'Đang chờ người bán xác nhận hủy. Bạn có thể hoàn tác yêu cầu hủy nếu muốn tiếp tục nhận hàng.',
  },
  shipped: {
    label: 'Đang giao hàng',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200/80',
    icon: Truck,
    description: 'Đơn hàng đã được giao cho đơn vị vận chuyển và đang trên đường tới bạn.',
  },
  delivered: {
    label: 'Đã giao hàng',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    icon: CheckCircle2,
    description: 'Đơn hàng đã được giao thành công.',
  },
  cancelled: {
    label: 'Đã hủy',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200/80',
    icon: XCircle,
    description: 'Đơn hàng đã bị hủy.',
  },
  partially_returned: {
    label: 'Trả hàng một phần',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200/80',
    icon: RotateCcw,
    description: 'Đơn hàng đã được hoàn tiền một phần các sản phẩm đã trả.',
  },
  returned: {
    label: 'Trả hàng',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200/80',
    icon: RotateCcw,
    description: 'Đơn hàng đã được hoàn trả.',
  },
}

// Countdown timer component for pending_confirmation
function CountdownTimer({ cancellableUntil }: { cancellableUntil: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const target = new Date(cancellableUntil).getTime()
    return Math.max(0, Math.floor((target - Date.now()) / 1000))
  })

  useEffect(() => {
    const target = new Date(cancellableUntil).getTime()
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((target - Date.now()) / 1000))
      setTimeLeft(remaining)
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [cancellableUntil])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  return (
    <div className="inline-flex items-center gap-1.5 rounded-xl bg-amber-100/70 px-3 py-1.5 text-xs font-semibold text-amber-900 border border-amber-200">
      <Clock className="h-3.5 w-3.5 text-amber-700 animate-pulse" />
      <span>Thời gian hủy tự động:</span>
      <span className="font-mono font-bold text-amber-950 tabular-nums">{formatted}</span>
    </div>
  )
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { success, error: toastError } = useToast()

  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isNotFound, setIsNotFound] = useState(false)

  // Dialog state for actions
  const [dialogType, setDialogType] = useState<'cancel' | 'request_cancel' | 'undo_cancel' | null>(null)
  const [isSubmittingAction, setIsSubmittingAction] = useState(false)
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false)
  const [isCancelReturnDialogOpen, setIsCancelReturnDialogOpen] = useState(false)
  const [isSubmittingReturnCancel, setIsSubmittingReturnCancel] = useState(false)

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate(`/login?redirect=/orders/${id || ''}`)
    }
  }, [authLoading, isAuthenticated, navigate, id])

  // Fetch order data
  const fetchOrderDetail = useCallback(async () => {
    if (!id || !isAuthenticated) return
    try {
      setIsLoading(true)
      setErrorMessage(null)
      setIsNotFound(false)
      const data = await ordersApi.getOrder(id)
      setOrder(data)
    } catch (err: unknown) {
      if (err instanceof ApiError && (err.status === 404 || err.code === 'order_not_found')) {
        setIsNotFound(true)
      } else if (err instanceof ApiError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('Không thể tải thông tin đơn hàng. Vui lòng kiểm tra lại kết nối.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [id, isAuthenticated])

  useEffect(() => {
    if (isAuthenticated && id) {
      fetchOrderDetail()
    }
  }, [isAuthenticated, id, fetchOrderDetail])

  // Handle Cancel / Request Cancel action
  const handleConfirmCancelOrRequest = async () => {
    if (!order) return
    try {
      setIsSubmittingAction(true)
      const updatedOrder = await ordersApi.cancelOrder(order.id)
      setOrder(updatedOrder)
      setDialogType(null)

      if (updatedOrder.status === 'cancelled') {
        success('Hủy đơn thành công', 'Đơn hàng của bạn đã được hủy.')
      } else if (updatedOrder.status === 'cancel_requested') {
        success('Đã gửi yêu cầu', 'Yêu cầu hủy đơn hàng đã được gửi đến người bán.')
      } else {
        success('Thành công', 'Đã cập nhật trạng thái đơn hàng.')
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError('Thao tác thất bại', err.message)
      } else {
        toastError('Lỗi', 'Không thể thực hiện yêu cầu hủy.')
      }
    } finally {
      setIsSubmittingAction(false)
    }
  }

  // Handle Undo Cancel Request action
  const handleConfirmUndoCancel = async () => {
    if (!order) return
    try {
      setIsSubmittingAction(true)
      const updatedOrder = await ordersApi.undoCancelOrder(order.id)
      setOrder(updatedOrder)
      setDialogType(null)
      success('Hoàn tác thành công', 'Yêu cầu hủy đơn hàng đã được rút lại.')
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError('Thao tác thất bại', err.message)
      } else {
        toastError('Lỗi', 'Không thể hoàn tác yêu cầu hủy.')
      }
    } finally {
      setIsSubmittingAction(false)
    }
  }

  // Handle Cancel Return Request action
  const handleConfirmCancelReturn = async () => {
    if (!order || !order.latestReturnRequest) return
    try {
      setIsSubmittingReturnCancel(true)
      await cancelReturn(order.id, order.latestReturnRequest.id)
      setIsCancelReturnDialogOpen(false)
      success('Hủy yêu cầu thành công', 'Yêu cầu trả hàng của bạn đã được rút lại.')
      fetchOrderDetail()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError('Thao tác thất bại', err.message)
      } else {
        toastError('Lỗi', 'Không thể hủy yêu cầu trả hàng.')
      }
    } finally {
      setIsSubmittingReturnCancel(false)
    }
  }

  // Loading skeleton
  if (authLoading || (isLoading && !order && !isNotFound && !errorMessage)) {
    return (
      <div className="min-h-screen bg-slate-50/60 pb-24">
        <div className="border-b border-slate-200 bg-white py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-4">
            <Skeleton className="h-6 w-32 rounded-lg" />
            <Skeleton className="h-10 w-72 rounded-xl" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-6">
              <Skeleton className="h-40 w-full rounded-3xl" />
              <Skeleton className="h-64 w-full rounded-3xl" />
              <Skeleton className="h-32 w-full rounded-3xl" />
            </div>
            <div className="lg:col-span-4 space-y-6">
              <Skeleton className="h-72 w-full rounded-3xl" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 404 Not Found State
  if (isNotFound) {
    return (
      <div className="min-h-screen bg-slate-50/60 pb-24">
        <div className="mx-auto max-w-2xl px-4 py-20 text-center space-y-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-50 text-rose-500 mx-auto border border-rose-100 shadow-xs">
            <Ban className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
              Không tìm thấy đơn hàng
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-md mx-auto">
              Đơn hàng không tồn tại hoặc bạn không có quyền truy cập vào thông tin đơn hàng này.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <Link to="/orders">
              <Button variant="primary" className="rounded-xl font-semibold gap-2">
                <ShoppingBag className="h-4 w-4" />
                <span>Xem danh sách đơn hàng</span>
              </Button>
            </Link>
            <Link to="/">
              <Button variant="outline" className="rounded-xl font-semibold">
                <span>Về trang chủ</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Generic Error State
  if (errorMessage || !order) {
    return (
      <div className="min-h-screen bg-slate-50/60 pb-24">
        <div className="mx-auto max-w-2xl px-4 py-20 text-center space-y-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-50 text-amber-600 mx-auto border border-amber-100">
            <AlertTriangle className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold text-slate-900">Không thể tải đơn hàng</h1>
            <p className="text-sm text-slate-600">{errorMessage || 'Có lỗi xảy ra khi tải dữ liệu.'}</p>
          </div>
          <Button
            variant="primary"
            onClick={fetchOrderDetail}
            className="rounded-xl font-semibold gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Thử lại</span>
          </Button>
        </div>
      </div>
    )
  }

  const currentStatusInfo = statusMap[order.status] || {
    label: order.status,
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
    icon: Package,
    description: '',
  }
  const StatusIcon = currentStatusInfo.icon

  return (
    <div className="min-h-screen bg-slate-50/60 pb-24">
      {/* Header Bar */}
      <div className="border-b border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <Link
                to="/orders"
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition mt-0.5 sm:mt-0"
                title="Quay lại danh sách đơn hàng"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                    Chi tiết đơn hàng
                  </h1>
                  <Badge
                    variant="outline"
                    className={`font-bold text-xs px-2.5 py-1 ${currentStatusInfo.badgeClass}`}
                  >
                    <StatusIcon className="h-3.5 w-3.5 mr-1 inline" />
                    {currentStatusInfo.label}
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 font-mono">
                  Mã đơn: <span className="text-slate-800 font-semibold">{order.id}</span> • Ngày đặt:{' '}
                  <span className="text-slate-800 font-sans">{formatDateTime(order.createdAt)}</span>
                </p>
              </div>
            </div>

            {/* Quick Actions in Header */}
            <div className="flex items-center gap-2 self-start sm:self-center">
              <Link to="/orders">
                <Button variant="outline" size="sm" className="rounded-xl text-xs gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span>Danh sách đơn</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Status Notice Banner */}
        <div className="mb-8 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${currentStatusInfo.badgeClass}`}
              >
                <StatusIcon className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>Trạng thái: {currentStatusInfo.label}</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {currentStatusInfo.description}
                </p>
              </div>
            </div>

            {/* Countdown timer for pending_confirmation */}
            {order.status === 'pending_confirmation' && order.cancellableUntil && (
              <div className="sm:self-center shrink-0">
                <CountdownTimer cancellableUntil={order.cancellableUntil} />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Details, Products & Shipping */}
          <div className="lg:col-span-8 space-y-6">
            {/* Return Request Banner / Card if exists */}
            {order.latestReturnRequest && (
              <div className="rounded-3xl border border-indigo-200 bg-white p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                      <RotateCcw className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        Thông tin trả hàng & hoàn tiền
                      </h2>
                      <p className="text-xs text-slate-500">
                        Cập nhật ngày {formatDateTime(order.latestReturnRequest.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`font-bold text-xs px-2.5 py-1 ${
                      returnStatusMap[order.latestReturnRequest.status]?.badgeClass || 'bg-slate-100'
                    }`}
                  >
                    {returnStatusMap[order.latestReturnRequest.status]?.label ||
                      order.latestReturnRequest.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">Lý do trả hàng:</span>
                    <p className="font-semibold text-slate-800 mt-0.5">
                      {returnReasonLabels[order.latestReturnRequest.reasonCode] ||
                        order.latestReturnRequest.reasonCode}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Tiền hoàn:</span>
                    <p className="font-bold text-indigo-700 text-sm mt-0.5">
                      {order.latestReturnRequest.refundAmountVnd
                        ? formatVND(order.latestReturnRequest.refundAmountVnd)
                        : formatVND(order.latestReturnRequest.expectedRefundVnd) + ' (dự kiến)'}
                    </p>
                  </div>
                  {order.latestReturnRequest.description && (
                    <div className="sm:col-span-2">
                      <span className="text-slate-500">Ghi chú của bạn:</span>
                      <p className="text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-0.5">
                        {order.latestReturnRequest.description}
                      </p>
                    </div>
                  )}
                  {order.latestReturnRequest.rejectReason && (
                    <div className="sm:col-span-2">
                      <span className="text-rose-600 font-semibold">Lý do từ chối của người bán:</span>
                      <p className="text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200 mt-0.5 font-medium">
                        {order.latestReturnRequest.rejectReason}
                      </p>
                    </div>
                  )}
                </div>

                {order.latestReturnRequest.status === 'pending_approval' && (
                  <div className="pt-2 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsCancelReturnDialogOpen(true)}
                      className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 rounded-xl"
                    >
                      Hủy yêu cầu trả hàng
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* 1. Recipient & Shipping Information */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Thông tin nhận hàng</h2>
                  <p className="text-xs text-slate-500">
                    Địa chỉ và người nhận hàng được ghi nhận tại thời điểm đặt đơn
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm text-slate-700">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-bold text-slate-900 text-base">{order.recipientName}</span>
                  <span className="font-mono text-slate-500">({order.phone})</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  {order.detailAddress}, {order.wardName}, {order.provinceName}
                </p>
              </div>
            </div>

            {/* 2. Order Items List */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Danh sách sản phẩm ({order.items.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Sản phẩm được lưu theo ảnh chụp tại thời điểm đặt hàng
                    </p>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {order.items.map((item) => {
                  const isReturnedItem = order.latestReturnRequest?.items?.some(
                    (ri) => ri.orderItemId === item.id
                  )
                  return (
                    <div
                      key={item.id}
                      className="py-4 first:pt-1 last:pb-1 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        {/* Image */}
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 p-1.5 overflow-hidden">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.productName}
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <Smartphone className="h-6 w-6 text-slate-300" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-400 uppercase">
                              {item.brandName}
                            </span>
                            {item.model && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                ({item.model})
                              </span>
                            )}
                            {isReturnedItem && (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-indigo-700 border-indigo-200 bg-indigo-50 font-medium"
                              >
                                Đã yêu cầu trả
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
                            <Link
                              to={`/products/${item.productId}`}
                              className="hover:text-emerald-600 transition"
                            >
                              {item.productName}
                            </Link>
                          </h3>

                          {/* Options */}
                          {item.options && item.options.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {item.options.map((opt, idx) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="text-[10px] font-normal"
                                >
                                  {opt.groupLabel}:{' '}
                                  <span className="font-semibold ml-0.5">{opt.valueLabel}</span>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Price and Quantity */}
                      <div className="text-right shrink-0">
                        <div className="font-bold text-slate-900 text-sm sm:text-base tabular-nums">
                          {formatVND(item.lineTotalVnd)}
                        </div>
                        <div className="text-xs text-slate-500 tabular-nums mt-0.5">
                          {formatVND(item.unitPriceVnd)} x {item.quantity}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 3. Payment Method */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Phương thức thanh toán</h2>
                  <p className="text-xs text-slate-500">Hình thức thanh toán áp dụng cho đơn hàng</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">
                      Thanh toán khi nhận hàng (COD)
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-purple-700 border-purple-200 bg-purple-50"
                    >
                      Tiền mặt
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Thanh toán trực tiếp cho nhân viên giao hàng khi nhận được bưu kiện.
                  </p>
                </div>
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
              </div>
            </div>
          </div>

          {/* Right Column: Financial Summary & Actions */}
          <div className="lg:col-span-4 space-y-6">
            {/* Financial Summary Card */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-6">
              <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
                Tổng kết đơn hàng
              </h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Tạm tính ({order.items.length} món):</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {formatVND(order.subtotalVnd)}
                  </span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>Phí vận chuyển:</span>
                  <span className="font-semibold text-emerald-600">
                    {!order.shippingFeeVnd || order.shippingFeeVnd === '0'
                      ? 'Miễn phí'
                      : formatVND(order.shippingFeeVnd)}
                  </span>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-between items-baseline">
                  <span className="font-bold text-slate-900 text-base">Tổng thanh toán:</span>
                  <span className="font-extrabold text-xl sm:text-2xl text-emerald-700 tabular-nums">
                    {formatVND(order.totalVnd)}
                  </span>
                </div>
              </div>

              {/* Status Action Buttons */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                {/* 1. Pending Confirmation: Hủy đơn */}
                {order.status === 'pending_confirmation' && (
                  <Button
                    variant="destructive"
                    size="lg"
                    onClick={() => setDialogType('cancel')}
                    className="w-full rounded-2xl font-bold gap-2"
                  >
                    <Ban className="h-4 w-4" />
                    <span>Hủy đơn</span>
                  </Button>
                )}

                {/* 2. Confirmed: Hủy đơn */}
                {order.status === 'confirmed' && (
                  <Button
                    variant="destructive"
                    size="lg"
                    onClick={() => setDialogType('cancel')}
                    className="w-full rounded-2xl font-bold gap-2"
                  >
                    <Ban className="h-4 w-4" />
                    <span>Hủy đơn</span>
                  </Button>
                )}

                {/* 3. Preparing: Yêu cầu hủy */}
                {order.status === 'preparing' && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setDialogType('request_cancel')}
                    className="w-full rounded-2xl font-bold text-amber-700 border-amber-300 hover:bg-amber-50 gap-2"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    <span>Yêu cầu hủy</span>
                  </Button>
                )}

                {/* 4. Cancel Requested: Hoàn tác yêu cầu hủy */}
                {order.status === 'cancel_requested' && (
                  <div className="space-y-2">
                    <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200 text-center font-medium">
                      Đang chờ người bán xác nhận hủy
                    </div>
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={() => setDialogType('undo_cancel')}
                      className="w-full rounded-2xl font-bold gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>Hoàn tác yêu cầu hủy</span>
                    </Button>
                  </div>
                )}

                {/* Return Action button when eligible */}
                {order.returnEligibility?.eligible && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setIsReturnDialogOpen(true)}
                    className="w-full rounded-2xl font-bold text-indigo-700 border-indigo-300 hover:bg-indigo-50 gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Yêu cầu trả hàng</span>
                  </Button>
                )}

                {/* Notice when delivered but return expired */}
                {order.status === 'delivered' &&
                  order.returnEligibility &&
                  !order.returnEligibility.eligible &&
                  !order.latestReturnRequest && (
                    <div className="text-center py-2 text-xs text-slate-400">
                      Đã hết thời hạn 7 ngày để yêu cầu trả hàng
                    </div>
                  )}

                {/* 5. Terminal / In-transit statuses: No cancel button */}
                {['shipped', 'cancelled', 'returned', 'partially_returned'].includes(
                  order.status
                ) && (
                  <div className="text-center py-2 text-xs text-slate-400">
                    Đơn hàng ở trạng thái không thể hủy
                  </div>
                )}
              </div>
            </div>

            {/* Timeline / Additional details */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-3 text-xs text-slate-500">
              <h4 className="font-bold text-slate-800 text-sm">Lịch sử thời gian</h4>
              <div className="space-y-2 divide-y divide-slate-100">
                <div className="flex justify-between pt-1">
                  <span>Thời gian tạo:</span>
                  <span className="font-mono text-slate-700">{formatDateTime(order.createdAt)}</span>
                </div>
                {order.confirmedAt && (
                  <div className="flex justify-between pt-2">
                    <span>Thời gian xác nhận:</span>
                    <span className="font-mono text-slate-700">
                      {formatDateTime(order.confirmedAt)}
                    </span>
                  </div>
                )}
                {order.deliveredAt && (
                  <div className="flex justify-between pt-2">
                    <span>Thời gian giao hàng:</span>
                    <span className="font-mono text-emerald-600">
                      {formatDateTime(order.deliveredAt)}
                    </span>
                  </div>
                )}
                {order.cancelledAt && (
                  <div className="flex justify-between pt-2">
                    <span>Thời gian hủy:</span>
                    <span className="font-mono text-rose-600">
                      {formatDateTime(order.cancelledAt)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Return Request Dialog */}
      {order && (
        <ReturnRequestDialog
          order={order}
          isOpen={isReturnDialogOpen}
          onClose={() => setIsReturnDialogOpen(false)}
          onSuccess={() => fetchOrderDetail()}
        />
      )}

      {/* Cancel Return Request Confirmation Dialog */}
      <Dialog
        open={isCancelReturnDialogOpen}
        onOpenChange={(open) => !open && setIsCancelReturnDialogOpen(false)}
      >
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-2">
              <RotateCcw className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">
              Hủy yêu cầu trả hàng
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Bạn có chắc chắn muốn rút lại yêu cầu trả hàng này không? Sau khi hủy, bạn vẫn có thể gửi lại yêu cầu nếu còn trong thời hạn 7 ngày.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsCancelReturnDialogOpen(false)}
              disabled={isSubmittingReturnCancel}
              className="rounded-xl font-semibold"
            >
              Đóng
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancelReturn}
              isLoading={isSubmittingReturnCancel}
              disabled={isSubmittingReturnCancel}
              className="rounded-xl font-semibold gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Xác nhận hủy yêu cầu</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Order Dialog */}
      <Dialog
        open={dialogType === 'cancel'}
        onOpenChange={(open) => !open && setDialogType(null)}
      >
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 mb-2">
              <Ban className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">
              Xác nhận hủy đơn hàng
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Bạn có chắc chắn muốn hủy đơn hàng này không? Sau khi hủy, đơn hàng sẽ chuyển sang trạng
              thái đã hủy và số lượng tồn kho sẽ được khôi phục.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDialogType(null)}
              disabled={isSubmittingAction}
              className="rounded-xl font-semibold"
            >
              Đóng
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancelOrRequest}
              isLoading={isSubmittingAction}
              disabled={isSubmittingAction}
              className="rounded-xl font-semibold gap-1.5"
            >
              <Ban className="h-4 w-4" />
              <span>Xác nhận hủy</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Cancel Dialog */}
      <Dialog
        open={dialogType === 'request_cancel'}
        onOpenChange={(open) => !open && setDialogType(null)}
      >
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-2">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">
              Gửi yêu cầu hủy đơn hàng
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Đơn hàng đang được người bán chuẩn bị. Bạn có muốn gửi yêu cầu hủy để người bán duyệt không?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDialogType(null)}
              disabled={isSubmittingAction}
              className="rounded-xl font-semibold"
            >
              Đóng
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmCancelOrRequest}
              isLoading={isSubmittingAction}
              disabled={isSubmittingAction}
              className="rounded-xl font-semibold gap-1.5"
            >
              <AlertTriangle className="h-4 w-4" />
              <span>Gửi yêu cầu hủy</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Undo Cancel Request Dialog */}
      <Dialog
        open={dialogType === 'undo_cancel'}
        onOpenChange={(open) => !open && setDialogType(null)}
      >
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-2">
              <RotateCcw className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">
              Hoàn tác yêu cầu hủy đơn
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Bạn có muốn rút lại yêu cầu hủy đơn và tiếp tục để cửa hàng chuẩn bị hàng cho bạn không?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDialogType(null)}
              disabled={isSubmittingAction}
              className="rounded-xl font-semibold"
            >
              Đóng
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmUndoCancel}
              isLoading={isSubmittingAction}
              disabled={isSubmittingAction}
              className="rounded-xl font-semibold gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Xác nhận hoàn tác</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default OrderDetailPage
