import { useCallback, useEffect, useMemo, useState } from 'react'
import { RotateCcw, PackageOpen, AlertTriangle } from 'lucide-react'
import {
  returnRequestsApi,
  RETURN_REASON_LABELS,
  type ReturnReasonCode,
  type ReturnRequestStatus,
  type ReturnRequestView,
} from '@/api/returnRequests'
import { ApiError, type Order } from '@/api/types'
import { formatVND, formatDateTime } from '@/lib/utils'
import { useToast } from '@/context/ToastContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const CONSUMING_STATUSES: ReturnRequestStatus[] = [
  'pending_approval',
  'approved',
  'received',
  'refunded',
]

interface RequestStatusInfo {
  label: string
  badgeClass: string
}

const requestStatusMap: Record<ReturnRequestStatus, RequestStatusInfo> = {
  pending_approval: {
    label: 'Chờ duyệt',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
  },
  approved: {
    label: 'Đã duyệt',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200/80',
  },
  received: {
    label: 'Đã nhận lại hàng',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
  },
  refunded: {
    label: 'Đã hoàn tiền',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  },
  rejected: {
    label: 'Bị từ chối',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200/80',
  },
  cancelled: {
    label: 'Đã hủy',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  },
}

const selectControlClass =
  'flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50'

const textareaControlClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50'

function computeConsumedQuantities(requests: ReturnRequestView[]): Map<string, number> {
  const consumed = new Map<string, number>()
  for (const request of requests) {
    if (!CONSUMING_STATUSES.includes(request.status)) continue
    for (const item of request.items) {
      consumed.set(item.orderItemId, (consumed.get(item.orderItemId) ?? 0) + item.quantity)
    }
  }
  return consumed
}

interface ReturnRequestsSectionProps {
  order: Order
}

export function ReturnRequestsSection({ order }: ReturnRequestsSectionProps) {
  const { success, error: toastError } = useToast()

  const [requests, setRequests] = useState<ReturnRequestView[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [reasonCode, setReasonCode] = useState<ReturnReasonCode | ''>('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  const isEligibleStatus = order.status === 'delivered' || order.status === 'returned'
  const isWindowOpen =
    Boolean(order.deliveredAt) &&
    Date.now() <= new Date(order.deliveredAt as string).getTime() + RETURN_WINDOW_MS

  const fetchRequests = useCallback(async () => {
    if (!isEligibleStatus) return
    try {
      setIsLoading(true)
      setLoadErrorMessage(null)
      const data = await returnRequestsApi.listReturnRequests(order.id)
      setRequests(data)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setLoadErrorMessage(err.message)
      } else {
        setLoadErrorMessage('Không thể tải danh sách yêu cầu trả hàng.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [order.id, isEligibleStatus])

  useEffect(() => {
    if (isEligibleStatus && order.id) {
      fetchRequests()
    }
  }, [isEligibleStatus, order.id, fetchRequests])

  const maxRemainingByItem = useMemo(() => {
    const consumed = computeConsumedQuantities(requests)
    const map = new Map<string, number>()
    for (const item of order.items) {
      map.set(item.id, Math.max(0, item.quantity - (consumed.get(item.id) ?? 0)))
    }
    return map
  }, [order.items, requests])

  const hasNoReturnableLines =
    !isLoading && [...maxRemainingByItem.values()].every((remaining) => remaining <= 0)

  const openCreateDialog = () => {
    const initial: Record<string, number> = {}
    for (const item of order.items) {
      initial[item.id] = 0
    }
    setQuantities(initial)
    setReasonCode('')
    setDescription('')
    setFieldErrors({})
    setIsCreateOpen(true)
  }

  const handleSubmitCreate = async () => {
    const items = order.items
      .map((item) => ({ orderItemId: item.id, quantity: quantities[item.id] ?? 0 }))
      .filter((entry) => entry.quantity > 0)

    const errors: Record<string, string> = {}
    if (items.length === 0) {
      errors.items = 'Vui lòng chọn số lượng cần trả cho ít nhất một sản phẩm.'
    }
    if (!reasonCode) {
      errors.reasonCode = 'Vui lòng chọn lý do trả hàng.'
    }
    if (items.length === 0 || !reasonCode) {
      setFieldErrors(errors)
      return
    }

    try {
      setIsSubmitting(true)
      await returnRequestsApi.createReturnRequest(order.id, {
        items,
        reasonCode,
        description: description.trim(),
      })
      setIsCreateOpen(false)
      success('Đã gửi yêu cầu trả hàng', 'Yêu cầu của bạn đang chờ người bán duyệt.')
      await fetchRequests()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.isValidationError()) {
        setFieldErrors(err.fields ?? {})
      } else if (err instanceof ApiError) {
        toastError('Gửi yêu cầu thất bại', err.message)
      } else {
        toastError('Lỗi', 'Không thể gửi yêu cầu trả hàng. Vui lòng thử lại.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmCancel = async () => {
    if (!cancelTargetId) return
    try {
      setIsCancelling(true)
      await returnRequestsApi.cancelReturnRequest(order.id, cancelTargetId)
      setCancelTargetId(null)
      success('Đã rút yêu cầu', 'Yêu cầu trả hàng đã được hủy.')
      await fetchRequests()
    } catch (err: unknown) {
      setCancelTargetId(null)
      if (err instanceof ApiError) {
        toastError('Rút yêu cầu thất bại', err.message)
      } else {
        toastError('Lỗi', 'Không thể rút yêu cầu trả hàng.')
      }
    } finally {
      setIsCancelling(false)
    }
  }

  if (!isEligibleStatus) {
    return null
  }

  return (
    <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Yêu cầu trả hàng</h2>
            <p className="text-xs text-slate-500">
              Yêu cầu được gửi trong vòng 7 ngày kể từ thời điểm nhận hàng
            </p>
          </div>
        </div>

        {isWindowOpen && !hasNoReturnableLines && (
          <Button
            variant="primary"
            size="sm"
            onClick={openCreateDialog}
            className="rounded-xl font-semibold gap-1.5 self-start sm:self-center"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Yêu cầu trả hàng</span>
          </Button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3 pt-1">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      )}

      {/* Load error state */}
      {!isLoading && loadErrorMessage && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2.5 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{loadErrorMessage}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRequests}
            className="rounded-xl font-semibold shrink-0"
          >
            Thử lại
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !loadErrorMessage && requests.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <PackageOpen className="h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">Chưa có yêu cầu trả hàng nào cho đơn này.</p>
          {!isWindowOpen && !order.deliveredAt && (
            <p className="text-xs text-slate-400">
              Chức năng trả hàng sẽ khả dụng sau khi đơn hàng được ghi nhận đã giao.
            </p>
          )}
          {!isWindowOpen && order.deliveredAt && !hasNoReturnableLines && (
            <p className="text-xs text-slate-400">
              Đã quá 7 ngày kể từ khi nhận hàng nên không thể tạo yêu cầu mới.
            </p>
          )}
        </div>
      )}

      {/* Requests list */}
      {!isLoading && !loadErrorMessage && requests.length > 0 && (
        <div className="divide-y divide-slate-100">
          {requests.map((request) => {
            const statusInfo = requestStatusMap[request.status]
            return (
              <div key={request.id} className="py-4 first:pt-2 last:pb-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Badge variant="outline" className={`font-bold text-xs ${statusInfo.badgeClass}`}>
                    {statusInfo.label}
                  </Badge>
                  <span className="text-sm font-semibold text-slate-800">
                    {RETURN_REASON_LABELS[request.reasonCode]}
                  </span>
                  <span className="ml-auto text-xs text-slate-400 font-mono">
                    {formatDateTime(request.createdAt)}
                  </span>
                  {request.status === 'pending_approval' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCancelTargetId(request.id)}
                      className="rounded-lg text-xs font-semibold text-rose-700 border-rose-200 hover:bg-rose-50"
                    >
                      Rút yêu cầu
                    </Button>
                  )}
                </div>

                {request.description && (
                  <p className="text-sm text-slate-600 leading-relaxed">{request.description}</p>
                )}

                <div className="space-y-2">
                  {request.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 p-1 overflow-hidden">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.productName}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <RotateCcw className="h-4 w-4 text-slate-300" />
                        )}
                      </div>
                      <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                        {item.productName}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums shrink-0">
                        {formatVND(item.unitPriceVnd)} × {item.quantity}
                      </span>
                    </div>
                  ))}
                </div>

                {request.status === 'rejected' && request.rejectReason && (
                  <div className="rounded-xl bg-rose-50 border border-rose-100 p-3 text-xs text-rose-800 space-y-0.5">
                    <p className="font-semibold">Lý do từ chối:</p>
                    <p>{request.rejectReason}</p>
                    {request.rejectedAt && (
                      <p className="text-rose-600/80">{formatDateTime(request.rejectedAt)}</p>
                    )}
                  </div>
                )}

                {request.status === 'refunded' && request.refundAmountVnd !== undefined && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-800 flex flex-wrap items-center justify-between gap-1">
                    <span className="font-semibold">Số tiền đã hoàn:</span>
                    <span className="font-bold tabular-nums">
                      {formatVND(request.refundAmountVnd)}
                    </span>
                    {request.refundedAt && (
                      <span className="basis-full text-emerald-600/80">
                        {formatDateTime(request.refundedAt)}
                      </span>
                    )}
                  </div>
                )}

                {request.status === 'cancelled' && request.cancelledAt && (
                  <p className="text-xs text-slate-400">
                    Đã rút yêu cầu vào {formatDateTime(request.cancelledAt)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create Return Request Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => !open && !isSubmitting && setIsCreateOpen(open)}>
        <DialogContent className="sm:max-w-lg rounded-3xl p-6 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-900">
              Yêu cầu trả hàng
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Chọn số lượng cần trả cho từng sản phẩm và cho biết lý do. Yêu cầu sẽ được người bán
              xem xét trong trạng thái chờ duyệt.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            {/* Line quantity selectors */}
            <div className="space-y-2">
              {order.items.map((item) => {
                const maxRemaining = maxRemainingByItem.get(item.id) ?? 0
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {item.productName}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {maxRemaining > 0 ? `Có thể trả tối đa: ${maxRemaining}` : 'Không còn sản phẩm nào có thể trả'}
                      </p>
                    </div>
                    {maxRemaining > 0 && (
                      <select
                        aria-label={`Số lượng trả cho ${item.productName}`}
                        value={quantities[item.id] ?? 0}
                        onChange={(e) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [item.id]: Number(e.target.value),
                          }))
                        }
                        className={`${selectControlClass} w-20 shrink-0`}
                      >
                        {Array.from({ length: maxRemaining + 1 }, (_, i) => i).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
              {fieldErrors.items && (
                <p className="text-xs text-rose-600 font-medium">{fieldErrors.items}</p>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label htmlFor="return-reason" className="text-sm font-semibold text-slate-800">
                Lý do trả hàng
              </Label>
              <select
                id="return-reason"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value as ReturnReasonCode)}
                aria-invalid={Boolean(fieldErrors.reasonCode)}
                className={`${selectControlClass} ${
                  fieldErrors.reasonCode ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                }`}
              >
                <option value="" disabled>
                  Chọn lý do trả hàng
                </option>
                {(Object.keys(RETURN_REASON_LABELS) as ReturnReasonCode[]).map((code) => (
                  <option key={code} value={code}>
                    {RETURN_REASON_LABELS[code]}
                  </option>
                ))}
              </select>
              {fieldErrors.reasonCode && (
                <p className="text-xs text-rose-600 font-medium">{fieldErrors.reasonCode}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="return-description" className="text-sm font-semibold text-slate-800">
                Mô tả thêm <span className="font-normal text-slate-400">(không bắt buộc)</span>
              </Label>
              <textarea
                id="return-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Mô tả chi tiết tình trạng hàng hóa (tối đa 500 ký tự)"
                className={textareaControlClass}
              />
              <p className="text-[11px] text-slate-400 text-right tabular-nums">
                {description.length}/500
              </p>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={isSubmitting}
              className="rounded-xl font-semibold"
            >
              Đóng
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmitCreate}
              isLoading={isSubmitting}
              disabled={isSubmitting}
              className="rounded-xl font-semibold gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Gửi yêu cầu</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Return Request Confirm Dialog */}
      <Dialog
        open={cancelTargetId !== null}
        onOpenChange={(open) => !open && !isCancelling && setCancelTargetId(null)}
      >
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-900">
              Rút yêu cầu trả hàng
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Bạn có chắc muốn rút yêu cầu trả hàng này không? Yêu cầu đang ở trạng thái chờ duyệt
              và sẽ bị hủy vĩnh viễn sau khi rút.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCancelTargetId(null)}
              disabled={isCancelling}
              className="rounded-xl font-semibold"
            >
              Giữ lại yêu cầu
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              isLoading={isCancelling}
              disabled={isCancelling}
              className="rounded-xl font-semibold gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Xác nhận rút yêu cầu</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
