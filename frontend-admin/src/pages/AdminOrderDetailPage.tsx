import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  Package,
  Truck,
  Check,
  Ban,
  Calendar,
  User,
  MapPin,
  CreditCard,
} from 'lucide-react'
import {
  getAdminOrder,
  adminConfirmPreparing,
  adminShip,
  adminDeliver,
  adminApproveCancel,
  adminDeclineCancel,
} from '@/api/orders'
import {
  ApiError,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatVND, formatDateTime } from '@/lib/utils'

const statusBadgeClasses: Record<OrderStatus, string> = {
  pending_confirmation: 'bg-amber-50 text-amber-800 border-amber-200',
  confirmed: 'bg-blue-50 text-blue-800 border-blue-200',
  preparing: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  cancel_requested: 'bg-orange-50 text-orange-800 border-orange-200',
  shipped: 'bg-sky-50 text-sky-800 border-sky-200',
  delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-800 border-rose-200',
  partially_returned: 'bg-purple-50 text-purple-800 border-purple-200',
  returned: 'bg-purple-50 text-purple-800 border-purple-200',
}

function apiMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'order_action_not_allowed') {
      return error.message || 'Hành động không được phép với trạng thái đơn hàng hiện tại.'
    }
    if (error.code === 'order_not_found' || error.status === 404) {
      return error.message || 'Không tìm thấy đơn hàng.'
    }
    if (error.message) {
      return error.message
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

function formatPaymentMethod(method: string): string {
  if (method === 'cod') return 'Thanh toán khi nhận hàng (COD)'
  if (method === 'bank_transfer') return 'Chuyển khoản ngân hàng'
  return method
}

export function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isApproveCancelDialogOpen, setIsApproveCancelDialogOpen] = useState(false)

  const {
    data: order,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => getAdminOrder(id!),
    enabled: Boolean(id),
  })

  const invalidateOrderQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
    void queryClient.invalidateQueries({ queryKey: ['admin-order', id] })
  }

  const confirmPreparingMutation = useMutation({
    mutationFn: () => adminConfirmPreparing(id!),
    onSuccess: () => {
      setMessage('Đã xác nhận chuẩn bị hàng thành công.')
      setErrorMessage(null)
      invalidateOrderQueries()
    },
    onError: (err) => {
      setErrorMessage(apiMessage(err, 'Không thể xác nhận chuẩn bị hàng. Vui lòng thử lại.'))
    },
  })

  const shipMutation = useMutation({
    mutationFn: () => adminShip(id!),
    onSuccess: () => {
      setMessage('Đã bàn giao đơn hàng cho đơn vị vận chuyển thành công.')
      setErrorMessage(null)
      invalidateOrderQueries()
    },
    onError: (err) => {
      setErrorMessage(apiMessage(err, 'Không thể bàn giao vận chuyển. Vui lòng thử lại.'))
    },
  })

  const deliverMutation = useMutation({
    mutationFn: () => adminDeliver(id!),
    onSuccess: () => {
      setMessage('Đã đánh dấu đơn hàng là đã giao thành công.')
      setErrorMessage(null)
      invalidateOrderQueries()
    },
    onError: (err) => {
      setErrorMessage(apiMessage(err, 'Không thể đánh dấu đã giao. Vui lòng thử lại.'))
    },
  })

  const approveCancelMutation = useMutation({
    mutationFn: () => adminApproveCancel(id!),
    onSuccess: () => {
      setIsApproveCancelDialogOpen(false)
      setMessage('Đã duyệt yêu cầu hủy đơn hàng và khôi phục tồn kho thành công.')
      setErrorMessage(null)
      invalidateOrderQueries()
    },
    onError: (err) => {
      setIsApproveCancelDialogOpen(false)
      setErrorMessage(apiMessage(err, 'Không thể duyệt yêu cầu hủy đơn hàng. Vui lòng thử lại.'))
    },
  })

  const declineCancelMutation = useMutation({
    mutationFn: () => adminDeclineCancel(id!),
    onSuccess: () => {
      setMessage('Đã từ chối yêu cầu hủy đơn hàng thành công.')
      setErrorMessage(null)
      invalidateOrderQueries()
    },
    onError: (err) => {
      setErrorMessage(apiMessage(err, 'Không thể từ chối yêu cầu hủy. Vui lòng thử lại.'))
    },
  })

  const isAnyMutationPending =
    confirmPreparingMutation.isPending ||
    shipMutation.isPending ||
    deliverMutation.isPending ||
    approveCancelMutation.isPending ||
    declineCancelMutation.isPending

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mb-3" />
        <p className="text-sm font-medium text-slate-600">Đang tải chi tiết đơn hàng...</p>
      </div>
    )
  }

  if (isError || !order) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/orders')}
          className="gap-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại danh sách đơn hàng
        </Button>

        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-3">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-rose-900">
              Không thể tải chi tiết đơn hàng
            </h3>
            <p className="text-sm text-rose-600 mt-1 max-w-md">
              {apiMessage(error, 'Đơn hàng không tồn tại hoặc đã bị xóa.')}
            </p>
            <div className="flex items-center gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => refetch()}
                className="border-rose-300 text-rose-700 hover:bg-rose-100"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Thử lại
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate('/orders')}
              >
                Về danh sách đơn hàng
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="iconSm"
            className="rounded-full"
            aria-label="Quay lại danh sách"
            onClick={() => navigate('/orders')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Đơn hàng #{order.id}
              </h1>
              <Badge
                variant="secondary"
                className={statusBadgeClasses[order.status] || 'bg-slate-100 text-slate-800'}
              >
                {ORDER_STATUS_LABELS[order.status] || order.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tạo lúc {formatDateTime(order.createdAt)}
            </p>
          </div>
        </div>

        {/* Action Buttons based on Status */}
        <div className="flex items-center gap-2 flex-wrap">
          {order.status === 'confirmed' && (
            <Button
              variant="primary"
              onClick={() => confirmPreparingMutation.mutate()}
              isLoading={confirmPreparingMutation.isPending}
              disabled={isAnyMutationPending}
            >
              <Package className="h-4 w-4 mr-2" />
              Xác nhận chuẩn bị hàng
            </Button>
          )}

          {order.status === 'preparing' && (
            <Button
              variant="primary"
              onClick={() => shipMutation.mutate()}
              isLoading={shipMutation.isPending}
              disabled={isAnyMutationPending}
            >
              <Truck className="h-4 w-4 mr-2" />
              Bàn giao vận chuyển
            </Button>
          )}

          {order.status === 'shipped' && (
            <Button
              variant="primary"
              onClick={() => deliverMutation.mutate()}
              isLoading={deliverMutation.isPending}
              disabled={isAnyMutationPending}
            >
              <Check className="h-4 w-4 mr-2" />
              Đánh dấu đã giao
            </Button>
          )}

          {order.status === 'cancel_requested' && (
            <>
              <Button
                variant="outline"
                onClick={() => declineCancelMutation.mutate()}
                isLoading={declineCancelMutation.isPending}
                disabled={isAnyMutationPending}
              >
                Từ chối hủy
              </Button>
              <Button
                variant="destructive"
                onClick={() => setIsApproveCancelDialogOpen(true)}
                disabled={isAnyMutationPending}
              >
                <Ban className="h-4 w-4 mr-2" />
                Duyệt hủy
              </Button>
            </>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching || isAnyMutationPending}
            title="Làm mới"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin text-blue-600' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 animate-in fade-in"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {message}
          </span>
          <button
            type="button"
            aria-label="Đóng thông báo"
            onClick={() => setMessage(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 animate-in fade-in"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {errorMessage}
          </span>
          <button
            type="button"
            aria-label="Đóng thông báo lỗi"
            onClick={() => setErrorMessage(null)}
            className="text-rose-700 hover:text-rose-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Top Grid: Customer Info & Timeline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Buyer & Payment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <User className="h-4 w-4 text-blue-600" />
              Khách hàng & Thanh toán
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-xs text-slate-500 block">Email người mua</span>
              <span className="font-medium text-slate-800">{order.buyerEmail || '—'}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Phương thức thanh toán</span>
              <span className="font-medium text-slate-800 flex items-center gap-1.5 mt-0.5">
                <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                {formatPaymentMethod(order.paymentMethod)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Recipient & Delivery */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <MapPin className="h-4 w-4 text-emerald-600" />
              Thông tin nhận hàng
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-xs text-slate-500 block">Người nhận</span>
              <span className="font-medium text-slate-800">{order.recipientName}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Số điện thoại</span>
              <span className="font-mono text-slate-800">{order.phone}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Địa chỉ giao hàng</span>
              <span className="text-slate-700">
                {[order.detailAddress, order.wardName, order.provinceName]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Timestamps */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <Calendar className="h-4 w-4 text-purple-600" />
              Thời gian
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-xs text-slate-500 block">Ngày tạo</span>
              <span className="text-slate-700">{formatDateTime(order.createdAt)}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Ngày cập nhật</span>
              <span className="text-slate-700">{formatDateTime(order.updatedAt)}</span>
            </div>
            {order.confirmedAt && (
              <div>
                <span className="text-xs text-slate-500 block">Ngày xác nhận</span>
                <span className="text-slate-700">{formatDateTime(order.confirmedAt)}</span>
              </div>
            )}
            {order.cancelledAt && (
              <div>
                <span className="text-xs text-slate-500 block">Ngày hủy</span>
                <span className="text-rose-600 font-medium">
                  {formatDateTime(order.cancelledAt)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            Danh sách sản phẩm ({order.items?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Hình</TableHead>
                <TableHead>Sản phẩm</TableHead>
                <TableHead className="text-right whitespace-nowrap">Đơn giá</TableHead>
                <TableHead className="text-center whitespace-nowrap">Số lượng</TableHead>
                <TableHead className="text-right whitespace-nowrap">Thành tiền</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="p-3">
                    <div className="h-12 w-12 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="font-medium text-slate-900">{item.productName}</div>
                      <div className="text-xs text-slate-500">
                        {item.brandName && <span>{item.brandName}</span>}
                        {item.brandName && item.model && <span> • </span>}
                        {item.model && <span>{item.model}</span>}
                      </div>
                      {item.options && item.options.length > 0 && (
                        <div className="text-xs text-blue-600 mt-1">
                          {item.options
                            .map((opt) => `${opt.groupLabel}: ${opt.valueLabel}`)
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-700 whitespace-nowrap">
                    {formatVND(item.unitPriceVnd)}
                  </TableCell>
                  <TableCell className="text-center font-medium text-slate-900 whitespace-nowrap">
                    {item.quantity}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-slate-900 whitespace-nowrap">
                    {formatVND(item.lineTotalVnd)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Order Summary & Financials */}
      <div className="flex justify-end">
        <Card className="w-full md:w-96">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-800">
              Tổng kết đơn hàng
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span>Tạm tính</span>
              <span className="font-medium text-slate-800">{formatVND(order.subtotalVnd)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Phí vận chuyển</span>
              <span className="font-medium text-slate-800">{formatVND(order.shippingFeeVnd)}</span>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between font-semibold text-base text-slate-900">
              <span>Tổng thanh toán</span>
              <span className="text-blue-600 font-bold">{formatVND(order.totalVnd)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert Dialog for Approve Cancel Confirmation */}
      <AlertDialog
        open={isApproveCancelDialogOpen}
        onOpenChange={setIsApproveCancelDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận duyệt hủy đơn hàng</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ hủy đơn hàng <strong>#{order.id}</strong> và khôi phục tồn kho cho
              từng sản phẩm trong đơn. Bạn có chắc chắn muốn duyệt yêu cầu hủy này không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approveCancelMutation.isPending}>
              Hủy bỏ
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => approveCancelMutation.mutate()}
              isLoading={approveCancelMutation.isPending}
            >
              Xác nhận duyệt hủy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
