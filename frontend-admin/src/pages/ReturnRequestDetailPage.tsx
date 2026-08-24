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
  Check,
  Ban,
  Calendar,
  User,
} from 'lucide-react'
import { ApiError } from '@/api/types'
import {
  getAdminReturnRequest,
  approveReturnRequest,
  rejectReturnRequest,
  receiveReturnRequest,
  refundReturnRequest,
  RETURN_STATUS_LABELS,
  RETURN_REASON_LABELS,
  type ReturnRequestStatus,
} from '@/api/returnRequests'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatVND, formatDateTime } from '@/lib/utils'

const statusBadgeClasses: Record<ReturnRequestStatus, string> = {
  pending_approval: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-blue-50 text-blue-800 border-blue-200',
  received: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  refunded: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-800 border-slate-200',
}

function apiMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'return_action_not_allowed') {
      return error.message || 'Hành động không được phép với trạng thái yêu cầu hiện tại.'
    }
    if (error.code === 'return_request_not_found' || error.status === 404) {
      return error.message || 'Không tìm thấy yêu cầu trả hàng.'
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

function shortId(id: string): string {
  return id.slice(0, 8)
}

function isValidRefundAmount(amount: string): boolean {
  return /^\d+$/.test(amount) && Number(amount) > 0
}

export function ReturnRequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectFieldError, setRejectFieldError] = useState<string | null>(null)
  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false)
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundFieldError, setRefundFieldError] = useState<string | null>(null)

  const {
    data: request,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-return-request', requestId],
    queryFn: () => getAdminReturnRequest(requestId!),
    enabled: Boolean(requestId),
  })

  const invalidateReturnQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-return-requests'] })
    void queryClient.invalidateQueries({ queryKey: ['admin-return-request', requestId] })
  }

  const approveMutation = useMutation({
    mutationFn: () => approveReturnRequest(requestId!),
    onSuccess: () => {
      setMessage('Đã duyệt yêu cầu trả hàng thành công.')
      setErrorMessage(null)
      invalidateReturnQueries()
    },
    onError: (err) => {
      setErrorMessage(apiMessage(err, 'Không thể duyệt yêu cầu trả hàng. Vui lòng thử lại.'))
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (input: { reason: string }) => rejectReturnRequest(requestId!, input),
    onSuccess: () => {
      setIsRejectDialogOpen(false)
      setMessage('Đã từ chối yêu cầu trả hàng thành công.')
      setErrorMessage(null)
      setRejectReason('')
      setRejectFieldError(null)
      invalidateReturnQueries()
    },
    onError: (err) => {
      setRejectFieldError(
        err instanceof ApiError && err.isValidationError()
          ? err.fields?.reason || 'Lý do từ chối không hợp lệ.'
          : null
      )
      setErrorMessage(apiMessage(err, 'Không thể từ chối yêu cầu trả hàng. Vui lòng thử lại.'))
    },
  })

  const receiveMutation = useMutation({
    mutationFn: () => receiveReturnRequest(requestId!),
    onSuccess: () => {
      setIsReceiveDialogOpen(false)
      setMessage('Đã xác nhận nhận hàng và hoàn kho thành công.')
      setErrorMessage(null)
      invalidateReturnQueries()
    },
    onError: (err) => {
      setIsReceiveDialogOpen(false)
      setErrorMessage(apiMessage(err, 'Không thể xác nhận nhận hàng. Vui lòng thử lại.'))
    },
  })

  const refundMutation = useMutation({
    mutationFn: (input: { amount: string }) => refundReturnRequest(requestId!, input),
    onSuccess: () => {
      setIsRefundDialogOpen(false)
      setMessage('Đã ghi nhận hoàn tiền thành công.')
      setErrorMessage(null)
      setRefundAmount('')
      setRefundFieldError(null)
      invalidateReturnQueries()
    },
    onError: (err) => {
      setRefundFieldError(
        err instanceof ApiError && err.isValidationError()
          ? err.fields?.amount || 'Số tiền hoàn không hợp lệ.'
          : null
      )
      setErrorMessage(apiMessage(err, 'Không thể ghi nhận hoàn tiền. Vui lòng thử lại.'))
    },
  })

  const isAnyMutationPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    receiveMutation.isPending ||
    refundMutation.isPending

  const openRejectDialog = () => {
    setRejectReason('')
    setRejectFieldError(null)
    setIsRejectDialogOpen(true)
  }

  const submitReject = (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)
    setErrorMessage(null)
    const reason = rejectReason.trim()
    if (!reason) {
      setRejectFieldError('Vui lòng nhập lý do từ chối.')
      return
    }
    setRejectFieldError(null)
    rejectMutation.mutate({ reason })
  }

  const openRefundDialog = () => {
    setRefundAmount(request?.suggestedRefundVnd ?? '')
    setRefundFieldError(null)
    setIsRefundDialogOpen(true)
  }

  const submitRefund = (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)
    setErrorMessage(null)
    const amount = refundAmount.trim()
    if (!isValidRefundAmount(amount)) {
      setRefundFieldError('Số tiền phải là số nguyên dương (VND).')
      return
    }
    setRefundFieldError(null)
    refundMutation.mutate({ amount })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mb-3" />
        <p className="text-sm font-medium text-slate-600">Đang tải chi tiết yêu cầu trả hàng...</p>
      </div>
    )
  }

  if (isError || !request) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/return-requests')}
          className="gap-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại danh sách yêu cầu trả hàng
        </Button>

        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-3">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-rose-900">
              Không thể tải chi tiết yêu cầu trả hàng
            </h3>
            <p className="text-sm text-rose-600 mt-1 max-w-md">
              {apiMessage(error, 'Yêu cầu trả hàng không tồn tại hoặc đã bị xóa.')}
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
                onClick={() => navigate('/return-requests')}
              >
                Về danh sách yêu cầu trả hàng
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const timelineEntries = [
    { label: 'Ngày tạo', value: request.createdAt },
    { label: 'Ngày duyệt', value: request.approvedAt },
    { label: 'Ngày từ chối', value: request.rejectedAt },
    { label: 'Ngày nhận hàng', value: request.receivedAt },
    { label: 'Ngày hoàn tiền', value: request.refundedAt },
    { label: 'Ngày khách rút yêu cầu', value: request.cancelledAt },
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry.value))

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
            onClick={() => navigate('/return-requests')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Yêu cầu trả hàng #{shortId(request.id)}
              </h1>
              <Badge
                variant="secondary"
                className={statusBadgeClasses[request.status] || 'bg-slate-100 text-slate-800'}
              >
                {RETURN_STATUS_LABELS[request.status] || request.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tạo lúc {formatDateTime(request.createdAt)} • Đơn #{shortId(request.orderId)}
            </p>
          </div>
        </div>

        {/* Action Buttons based on Status */}
        <div className="flex items-center gap-2 flex-wrap">
          {request.status === 'pending_approval' && (
            <>
              <Button
                variant="outline"
                onClick={openRejectDialog}
                disabled={isAnyMutationPending}
              >
                <Ban className="h-4 w-4 mr-2" />
                Từ chối
              </Button>
              <Button
                variant="primary"
                onClick={() => approveMutation.mutate()}
                isLoading={approveMutation.isPending}
                disabled={isAnyMutationPending}
              >
                <Check className="h-4 w-4 mr-2" />
                Duyệt
              </Button>
            </>
          )}

          {request.status === 'approved' && (
            <Button
              variant="primary"
              onClick={() => setIsReceiveDialogOpen(true)}
              disabled={isAnyMutationPending}
            >
              <Package className="h-4 w-4 mr-2" />
              Xác nhận đã nhận hàng
            </Button>
          )}

          {request.status === 'received' && (
            <Button
              variant="primary"
              onClick={openRefundDialog}
              disabled={isAnyMutationPending}
            >
              Ghi nhận hoàn tiền
            </Button>
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

      {/* Top Grid: Buyer, Reason & Timeline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Buyer & Order */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <User className="h-4 w-4 text-blue-600" />
              Khách hàng & Đơn hàng
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-xs text-slate-500 block">Email người mua</span>
              <span className="font-medium text-slate-800">{request.buyerEmail || '—'}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Mã đơn hàng</span>
              <span className="font-mono text-xs font-medium text-slate-800">
                #{shortId(request.orderId)}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Tổng giá trị đơn</span>
              <span className="font-medium text-slate-800">{formatVND(request.orderTotalVnd)}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Phí vận chuyển</span>
              <span className="font-medium text-slate-800">{formatVND(request.shippingFeeVnd)}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Số tiền hoàn đề nghị</span>
              <span className="font-semibold text-blue-600">
                {formatVND(request.suggestedRefundVnd)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Reason */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              Lý do trả hàng
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-xs text-slate-500 block">Lý do</span>
              <span className="font-medium text-slate-800">
                {RETURN_REASON_LABELS[request.reasonCode] || request.reasonCode}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Mô tả thêm</span>
              <span className="text-slate-700 whitespace-pre-line">
                {request.description || '—'}
              </span>
            </div>
            {request.status === 'rejected' && request.rejectReason && (
              <div>
                <span className="text-xs text-rose-500 block">Lý do từ chối</span>
                <span className="text-rose-600 whitespace-pre-line">{request.rejectReason}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <Calendar className="h-4 w-4 text-purple-600" />
              Tiến trình xử lý
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {timelineEntries.map((entry) => (
              <div key={entry.label}>
                <span className="text-xs text-slate-500 block">{entry.label}</span>
                <span className="text-slate-700">{formatDateTime(entry.value)}</span>
              </div>
            ))}
            {request.status === 'refunded' && request.refundAmountVnd && (
              <div>
                <span className="text-xs text-slate-500 block">Số tiền đã hoàn</span>
                <span className="font-semibold text-emerald-600">
                  {formatVND(request.refundAmountVnd)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Returned Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            Sản phẩm trả lại ({request.items.length})
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
              {request.items.map((item) => (
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
                    <div className="font-medium text-slate-900">{item.productName}</div>
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-700 whitespace-nowrap">
                    {formatVND(item.unitPriceVnd)}
                  </TableCell>
                  <TableCell className="text-center font-medium text-slate-900 whitespace-nowrap">
                    {item.quantity}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-slate-900 whitespace-nowrap">
                    {formatVND(String(Number(item.unitPriceVnd) * item.quantity))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reject Dialog with required reason */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <form onSubmit={submitReject}>
            <DialogHeader>
              <DialogTitle>Từ chối yêu cầu trả hàng</DialogTitle>
              <DialogDescription>
                Lý do từ chối sẽ được hiển thị cho khách hàng. Trường này là bắt buộc.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-2">
              <Label htmlFor="reject-reason" required>
                Lý do từ chối
              </Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value)
                  setRejectFieldError(null)
                }}
                placeholder="Ví dụ: Hàng đã qua sử dụng"
                rows={4}
                maxLength={500}
                error={Boolean(rejectFieldError)}
                aria-invalid={Boolean(rejectFieldError)}
                aria-describedby={rejectFieldError ? 'reject-reason-error' : undefined}
              />
              {rejectFieldError && (
                <p id="reject-reason-error" role="alert" className="text-xs text-rose-600">
                  {rejectFieldError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRejectDialogOpen(false)}
                disabled={rejectMutation.isPending}
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                variant="destructive"
                isLoading={rejectMutation.isPending}
                disabled={!rejectReason.trim()}
              >
                Xác nhận từ chối
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Receive AlertDialog warning restock */}
      <AlertDialog
        open={isReceiveDialogOpen}
        onOpenChange={setIsReceiveDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận đã nhận lại hàng</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ xác nhận bạn đã nhận lại hàng và{' '}
              <strong>khôi phục tồn kho (hoàn kho)</strong> cho từng sản phẩm trong yêu cầu. Bạn có
              chắc chắn muốn tiếp tục không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={receiveMutation.isPending}>
              Hủy bỏ
            </AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              onClick={() => receiveMutation.mutate()}
              isLoading={receiveMutation.isPending}
            >
              Xác nhận đã nhận hàng
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Refund Dialog with prefilled suggested amount */}
      <Dialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
        <DialogContent>
          <form onSubmit={submitRefund}>
            <DialogHeader>
              <DialogTitle>Ghi nhận hoàn tiền</DialogTitle>
              <DialogDescription>
                Nhập số tiền hoàn thực tế đã chuyển cho khách hàng (VND). Sau khi ghi nhận, đơn
                hàng sẽ được đánh dấu là đã trả hàng.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-2">
              <Label htmlFor="refund-amount" required>
                Số tiền hoàn (VND)
              </Label>
              <Input
                id="refund-amount"
                inputMode="numeric"
                value={refundAmount}
                onChange={(e) => {
                  setRefundAmount(e.target.value)
                  setRefundFieldError(null)
                }}
                placeholder="Ví dụ: 520000"
                error={Boolean(refundFieldError)}
                aria-invalid={Boolean(refundFieldError)}
                aria-describedby={refundFieldError ? 'refund-amount-error' : undefined}
              />
              {refundFieldError && (
                <p id="refund-amount-error" role="alert" className="text-xs text-rose-600">
                  {refundFieldError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRefundDialogOpen(false)}
                disabled={refundMutation.isPending}
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={refundMutation.isPending}
                disabled={!isValidRefundAmount(refundAmount.trim())}
              >
                Xác nhận hoàn tiền
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
