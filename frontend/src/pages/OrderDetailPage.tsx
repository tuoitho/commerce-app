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
  Star,
  MessageCircle,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ordersApi } from '@/api/orders'
import { cancelReturn } from '@/api/returns'
import {
  ApiError,
  type Order,
  type OrderStatus,
  type OrderItem,
  type Review,
} from '@/api/types'
import { formatVND, formatDateTime } from '@/lib/utils'
import { orderToAttachedOrderCard } from '@/lib/chatUtils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ReturnRequestDialog } from '@/components/ReturnRequestDialog'
import { ReviewFormDialog } from '@/components/ReviewFormDialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

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
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Clock,
  },
  approved: {
    label: 'Đã duyệt trả hàng',
    badgeClass: 'bg-zinc-100 text-zinc-900 border-zinc-200',
    icon: CheckCircle2,
  },
  received: {
    label: 'Shop đã nhận hàng',
    badgeClass: 'bg-zinc-100 text-zinc-900 border-zinc-200',
    icon: Package,
  },
  refunded: {
    label: 'Đã hoàn tiền',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Từ chối trả hàng',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    icon: XCircle,
  },
  cancelled: {
    label: 'Đã hủy yêu cầu',
    badgeClass: 'bg-zinc-100 text-zinc-800 border-zinc-200',
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
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Clock,
    description: 'Đơn hàng đang chờ xác nhận. Bạn có thể tự hủy đơn trong vòng 30 phút kể từ khi đặt.',
  },
  confirmed: {
    label: 'Đã xác nhận',
    badgeClass: 'bg-zinc-100 text-zinc-900 border-zinc-200',
    icon: CheckCircle2,
    description: 'Đơn hàng đã được xác nhận. Bạn vẫn có thể hủy đơn ngay trước khi cửa hàng chuẩn bị hàng.',
  },
  preparing: {
    label: 'Đang chuẩn bị hàng',
    badgeClass: 'bg-zinc-100 text-zinc-900 border-zinc-200',
    icon: Package,
    description: 'Cửa hàng đang chuẩn bị sản phẩm. Bạn có thể gửi yêu cầu hủy để người bán xét duyệt.',
  },
  cancel_requested: {
    label: 'Chờ duyệt hủy',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: AlertTriangle,
    description: 'Đang chờ người bán xác nhận hủy. Bạn có thể hoàn tác yêu cầu hủy nếu muốn tiếp tục nhận hàng.',
  },
  shipped: {
    label: 'Đang giao hàng',
    badgeClass: 'bg-zinc-900 text-white border-zinc-900',
    icon: Truck,
    description: 'Đơn hàng đã được giao cho đơn vị vận chuyển và đang trên đường tới bạn.',
  },
  delivered: {
    label: 'Đã giao hàng',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: CheckCircle2,
    description: 'Đơn hàng đã được giao thành công.',
  },
  cancelled: {
    label: 'Đã hủy',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    icon: XCircle,
    description: 'Đơn hàng đã bị hủy.',
  },
  partially_returned: {
    label: 'Trả hàng một phần',
    badgeClass: 'bg-zinc-100 text-zinc-800 border-zinc-200',
    icon: RotateCcw,
    description: 'Đơn hàng đã được hoàn tiền một phần các sản phẩm đã trả.',
  },
  returned: {
    label: 'Trả hàng',
    badgeClass: 'bg-zinc-100 text-zinc-800 border-zinc-200',
    icon: RotateCcw,
    description: 'Đơn hàng đã được hoàn trả.',
  },
}

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
    <div className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 border border-amber-200">
      <Clock className="h-3.5 w-3.5 text-amber-700" />
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

  const [dialogType, setDialogType] = useState<'cancel' | 'request_cancel' | 'undo_cancel' | null>(null)
  const [isSubmittingAction, setIsSubmittingAction] = useState(false)
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false)
  const [isCancelReturnDialogOpen, setIsCancelReturnDialogOpen] = useState(false)
  const [isSubmittingReturnCancel, setIsSubmittingReturnCancel] = useState(false)

  const [reviewDialogState, setReviewDialogState] = useState<{
    isOpen: boolean
    item: OrderItem | null
    existingReview?: Review | null
  }>({
    isOpen: false,
    item: null,
    existingReview: null,
  })

  const handleReviewSuccess = (savedReview: Review) => {
    if (!order || !reviewDialogState.item) return
    const itemId = reviewDialogState.item.id

    setOrder((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.map((it) => {
          if (it.id !== itemId) return it
          return {
            ...it,
            reviewStatus: 'reviewed',
            review: savedReview,
          }
        }),
      }
    })
  }

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate(`/login?redirect=/orders/${id || ''}`)
    }
  }, [authLoading, isAuthenticated, navigate, id])

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

  const handleOpenChatWithOrder = () => {
    if (!order) return
    const card = orderToAttachedOrderCard(order)
    window.dispatchEvent(
      new CustomEvent('open-chat-with-order', {
        detail: {
          order: card,
          orderId: order.id,
        },
      })
    )
  }

  if (authLoading || (isLoading && !order && !isNotFound && !errorMessage)) {
    return (
      <div className="min-h-screen bg-[#f7f7f5] pb-24">
        <div className="border-b border-zinc-200 bg-white py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-4">
            <Skeleton className="h-6 w-32 rounded-lg" />
            <Skeleton className="h-10 w-72 rounded-xl" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-6">
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
              <Skeleton className="h-32 w-full rounded-2xl" />
            </div>
            <div className="lg:col-span-4 space-y-6">
              <Skeleton className="h-72 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isNotFound) {
    return (
      <div className="min-h-screen bg-[#f7f7f5] pb-24">
        <div className="mx-auto max-w-2xl px-4 py-20 text-center space-y-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 mx-auto border border-rose-200">
            <Ban className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold text-zinc-950 sm:text-3xl">
              Không tìm thấy đơn hàng
            </h1>
            <p className="text-sm sm:text-base text-zinc-600 max-w-md mx-auto">
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

  if (errorMessage || !order) {
    return (
      <div className="min-h-screen bg-[#f7f7f5] pb-24">
        <div className="mx-auto max-w-2xl px-4 py-20 text-center space-y-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 mx-auto border border-amber-200">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold text-zinc-950">Không thể tải đơn hàng</h1>
            <p className="text-sm text-zinc-600">{errorMessage || 'Có lỗi xảy ra khi tải dữ liệu.'}</p>
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
    badgeClass: 'bg-zinc-100 text-zinc-800 border-zinc-200',
    icon: Package,
    description: '',
  }
  const StatusIcon = currentStatusInfo.icon

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-24">
      {/* Header Bar */}
      <div className="border-b border-zinc-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <Link
                to="/orders"
                className="p-2 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 rounded-xl transition mt-0.5 sm:mt-0"
                title="Quay lại danh sách đơn hàng"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950">
                    Chi tiết đơn hàng
                  </h1>
                  <Badge
                    variant="outline"
                    className={`font-semibold text-xs px-2.5 py-1 ${currentStatusInfo.badgeClass}`}
                  >
                    <StatusIcon className="h-3.5 w-3.5 mr-1 inline" />
                    {currentStatusInfo.label}
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-zinc-500 mt-1 font-mono">
                  Mã đơn: <span className="text-zinc-900 font-semibold">{order.id}</span> • Ngày đặt:{' '}
                  <span className="text-zinc-900 font-sans">{formatDateTime(order.createdAt)}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenChatWithOrder}
                className="rounded-xl text-xs gap-1.5 text-emerald-800 border-emerald-200 hover:bg-emerald-50 font-semibold"
                data-testid="order-inquiry-header-btn"
              >
                <MessageCircle className="h-3.5 w-3.5 text-emerald-700" />
                <span>Hỏi đáp về đơn hàng</span>
              </Button>
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
        <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${currentStatusInfo.badgeClass}`}
              >
                <StatusIcon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-zinc-950 flex items-center gap-2">
                  <span>Trạng thái: {currentStatusInfo.label}</span>
                </h2>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  {currentStatusInfo.description}
                </p>
              </div>
            </div>

            {order.status === 'pending_confirmation' && order.cancellableUntil && (
              <div className="sm:self-center shrink-0">
                <CountdownTimer cancellableUntil={order.cancellableUntil} />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column */}
          <div className="lg:col-span-8 space-y-6">
            {order.latestReturnRequest && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-white">
                      <RotateCcw className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-zinc-950">
                        Thông tin trả hàng & hoàn tiền
                      </h2>
                      <p className="text-xs text-zinc-500">
                        Cập nhật ngày {formatDateTime(order.latestReturnRequest.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`font-semibold text-xs px-2.5 py-1 ${
                      returnStatusMap[order.latestReturnRequest.status]?.badgeClass || 'bg-zinc-100'
                    }`}
                  >
                    {returnStatusMap[order.latestReturnRequest.status]?.label ||
                      order.latestReturnRequest.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-zinc-500">Lý do trả hàng:</span>
                    <p className="font-semibold text-zinc-900 mt-0.5">
                      {returnReasonLabels[order.latestReturnRequest.reasonCode] ||
                        order.latestReturnRequest.reasonCode}
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Tiền hoàn:</span>
                    <p className="font-mono font-bold text-zinc-950 text-sm mt-0.5">
                      {order.latestReturnRequest.refundAmountVnd
                        ? formatVND(order.latestReturnRequest.refundAmountVnd)
                        : formatVND(order.latestReturnRequest.expectedRefundVnd) + ' (dự kiến)'}
                    </p>
                  </div>
                  {order.latestReturnRequest.description && (
                    <div className="sm:col-span-2">
                      <span className="text-zinc-500">Ghi chú của bạn:</span>
                      <p className="text-zinc-700 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200 mt-0.5">
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
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
              <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-white">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-950">Thông tin nhận hàng</h2>
                  <p className="text-xs text-zinc-500">
                    Địa chỉ và người nhận hàng được ghi nhận tại thời điểm đặt đơn
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm text-zinc-700">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-bold text-zinc-950 text-base">{order.recipientName}</span>
                  <span className="font-mono text-zinc-500">({order.phone})</span>
                </div>
                <p className="text-zinc-600 leading-relaxed">
                  {order.detailAddress}, {order.wardName}, {order.provinceName}
                </p>
              </div>
            </div>

            {/* 2. Order Items List */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-900">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-zinc-950">
                      Danh sách sản phẩm ({order.items.length})
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Sản phẩm được lưu theo ảnh chụp tại thời điểm đặt hàng
                    </p>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-zinc-100">
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
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#f7f7f5] border border-zinc-100 p-1.5 overflow-hidden">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.productName}
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <Smartphone className="h-6 w-6 text-zinc-300" />
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-semibold text-zinc-500 uppercase">
                              {item.brandName}
                            </span>
                            {item.model && (
                              <span className="text-[10px] text-zinc-400 font-mono">
                                ({item.model})
                              </span>
                            )}
                            {isReturnedItem && (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-zinc-800 border-zinc-200 bg-zinc-100 font-medium"
                              >
                                Đã yêu cầu trả
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-bold text-zinc-950 text-sm sm:text-base leading-tight">
                            <Link
                              to={`/products/${item.productId}`}
                              className="hover:text-emerald-700 transition"
                            >
                              {item.productName}
                            </Link>
                          </h3>

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

                          <div className="flex items-center gap-2 pt-1.5 flex-wrap">
                            {item.reviewStatus === 'eligible' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setReviewDialogState({
                                    isOpen: true,
                                    item,
                                    existingReview: null,
                                  })
                                }
                                className="text-xs h-7 rounded-lg border-zinc-300 bg-zinc-50 text-zinc-900 hover:bg-zinc-100 font-semibold gap-1"
                              >
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                <span>Đánh giá</span>
                              </Button>
                            )}
                            {item.reviewStatus === 'reviewed' && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className="text-[11px] bg-emerald-50 text-emerald-800 border-emerald-200 gap-1 py-0.5 font-medium"
                                >
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                  <span>Đã đánh giá ({item.review?.rating}★)</span>
                                </Badge>
                                {item.review?.canEdit && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setReviewDialogState({
                                        isOpen: true,
                                        item,
                                        existingReview: item.review,
                                      })
                                    }
                                    className="text-xs h-6 px-2 text-zinc-600 hover:text-zinc-950 font-medium"
                                  >
                                    Sửa đánh giá
                                  </Button>
                                )}
                              </div>
                            )}
                            {item.reviewStatus === 'refunded' && (
                              <Badge
                                variant="outline"
                                className="text-[11px] bg-zinc-100 text-zinc-600 border-zinc-200 font-medium"
                              >
                                Đã hoàn tiền
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-zinc-950 text-sm sm:text-base tabular-nums">
                          {formatVND(item.lineTotalVnd)}
                        </div>
                        <div className="font-mono text-xs text-zinc-500 tabular-nums mt-0.5">
                          {formatVND(item.unitPriceVnd)} x {item.quantity}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 3. Payment Method */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
              <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-900">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-950">Phương thức thanh toán</h2>
                  <p className="text-xs text-zinc-500">Hình thức thanh toán áp dụng cho đơn hàng</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 bg-zinc-50">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-950 text-sm">
                      Thanh toán khi nhận hàng (COD)
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-zinc-700 border-zinc-200 bg-white"
                    >
                      Tiền mặt
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Thanh toán trực tiếp cho nhân viên giao hàng khi nhận được bưu kiện.
                  </p>
                </div>
                <ShieldCheck className="h-5 w-5 text-emerald-700 shrink-0" />
              </div>
            </div>
          </div>

          {/* Right Column: Financial Summary & Actions */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-6">
              <h3 className="text-lg font-bold text-zinc-950 border-b border-zinc-100 pb-3">
                Tổng kết đơn hàng
              </h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-zinc-600">
                  <span>Tạm tính ({order.items.length} món):</span>
                  <span className="font-mono font-semibold text-zinc-950 tabular-nums">
                    {formatVND(order.subtotalVnd)}
                  </span>
                </div>

                <div className="flex justify-between text-zinc-600">
                  <span>Phí vận chuyển:</span>
                  <span className="font-semibold text-emerald-700">
                    {!order.shippingFeeVnd || order.shippingFeeVnd === '0'
                      ? 'Miễn phí'
                      : formatVND(order.shippingFeeVnd)}
                  </span>
                </div>

                <div className="pt-4 border-t border-zinc-100 flex justify-between items-baseline">
                  <span className="font-bold text-zinc-950 text-base">Tổng thanh toán:</span>
                  <span className="font-mono font-bold text-xl sm:text-2xl text-zinc-950 tabular-nums">
                    {formatVND(order.totalVnd)}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 space-y-3">
                {order.status === 'pending_confirmation' && (
                  <Button
                    variant="destructive"
                    size="lg"
                    onClick={() => setDialogType('cancel')}
                    className="w-full rounded-xl font-semibold gap-2"
                  >
                    <Ban className="h-4 w-4" />
                    <span>Hủy đơn</span>
                  </Button>
                )}

                {order.status === 'confirmed' && (
                  <Button
                    variant="destructive"
                    size="lg"
                    onClick={() => setDialogType('cancel')}
                    className="w-full rounded-xl font-semibold gap-2"
                  >
                    <Ban className="h-4 w-4" />
                    <span>Hủy đơn</span>
                  </Button>
                )}

                {order.status === 'preparing' && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setDialogType('request_cancel')}
                    className="w-full rounded-xl font-semibold text-amber-800 border-amber-300 hover:bg-amber-50 gap-2"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    <span>Yêu cầu hủy</span>
                  </Button>
                )}

                {order.status === 'cancel_requested' && (
                  <div className="space-y-2">
                    <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200 text-center font-medium">
                      Đang chờ người bán xác nhận hủy
                    </div>
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={() => setDialogType('undo_cancel')}
                      className="w-full rounded-xl font-semibold gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>Hoàn tác yêu cầu hủy</span>
                    </Button>
                  </div>
                )}

                {order.returnEligibility?.eligible && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setIsReturnDialogOpen(true)}
                    className="w-full rounded-xl font-semibold text-zinc-900 border-zinc-300 hover:bg-zinc-50 gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Yêu cầu trả hàng</span>
                  </Button>
                )}

                {order.status === 'delivered' &&
                  order.returnEligibility &&
                  !order.returnEligibility.eligible &&
                  !order.latestReturnRequest && (
                    <div className="text-center py-2 text-xs text-zinc-400">
                      Đã hết thời hạn 7 ngày để yêu cầu trả hàng
                    </div>
                  )}

                {['shipped', 'cancelled', 'returned', 'partially_returned'].includes(
                  order.status
                ) && (
                  <div className="text-center py-2 text-xs text-zinc-400">
                    Đơn hàng ở trạng thái không thể hủy
                  </div>
                )}

                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleOpenChatWithOrder}
                  className="w-full rounded-xl font-semibold text-emerald-800 border-emerald-200 hover:bg-emerald-50 gap-2"
                  data-testid="order-inquiry-card-btn"
                >
                  <MessageCircle className="h-4 w-4 text-emerald-700" />
                  <span>Hỏi đáp về đơn hàng</span>
                </Button>
              </div>
            </div>

            {/* Timeline / Additional details */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-3 text-xs text-zinc-500">
              <h4 className="font-bold text-zinc-950 text-sm">Lịch sử thời gian</h4>
              <div className="space-y-2 divide-y divide-zinc-100">
                <div className="flex justify-between pt-1">
                  <span>Thời gian tạo:</span>
                  <span className="font-mono text-zinc-800">{formatDateTime(order.createdAt)}</span>
                </div>
                {order.confirmedAt && (
                  <div className="flex justify-between pt-2">
                    <span>Thời gian xác nhận:</span>
                    <span className="font-mono text-zinc-800">
                      {formatDateTime(order.confirmedAt)}
                    </span>
                  </div>
                )}
                {order.deliveredAt && (
                  <div className="flex justify-between pt-2">
                    <span>Thời gian giao hàng:</span>
                    <span className="font-mono text-emerald-700">
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

      {order && (
        <ReturnRequestDialog
          order={order}
          isOpen={isReturnDialogOpen}
          onClose={() => setIsReturnDialogOpen(false)}
          onSuccess={() => fetchOrderDetail()}
        />
      )}

      <Dialog
        open={isCancelReturnDialogOpen}
        onOpenChange={(open) => !open && setIsCancelReturnDialogOpen(false)}
      >
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200 mb-2">
              <RotateCcw className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-zinc-950">
              Hủy yêu cầu trả hàng
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-600">
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

      <Dialog
        open={dialogType === 'cancel'}
        onOpenChange={(open) => !open && setDialogType(null)}
      >
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-200 mb-2">
              <Ban className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-zinc-950">
              Xác nhận hủy đơn hàng
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-600">
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

      <Dialog
        open={dialogType === 'request_cancel'}
        onOpenChange={(open) => !open && setDialogType(null)}
      >
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200 mb-2">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-zinc-950">
              Gửi yêu cầu hủy đơn hàng
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-600">
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

      <Dialog
        open={dialogType === 'undo_cancel'}
        onOpenChange={(open) => !open && setDialogType(null)}
      >
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
              <RotateCcw className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-zinc-950">
              Hoàn tác yêu cầu hủy đơn
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-600">
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

      {order && reviewDialogState.item && (
        <ReviewFormDialog
          isOpen={reviewDialogState.isOpen}
          onClose={() =>
            setReviewDialogState((prev) => ({ ...prev, isOpen: false, item: null }))
          }
          orderId={order.id}
          item={reviewDialogState.item}
          existingReview={reviewDialogState.existingReview}
          onSuccess={handleReviewSuccess}
        />
      )}
    </div>
  )
}
export default OrderDetailPage
