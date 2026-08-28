import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  Package,
  RotateCcw,
  Check,
  Ban,
  Calendar,
  CreditCard,
  Search,
} from 'lucide-react'
import { adminReturnsApi, type ReceiveItemInput } from '@/api/returns'
import {
  RETURN_STATUS_LABELS,
  RETURN_REASON_LABELS,
  type ReturnStatus,
  type VariantOptionItem,
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
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatVND, formatDateTime } from '@/lib/utils'

const returnStatusBadgeClasses: Record<ReturnStatus, string> = {
  pending_approval: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-blue-50 text-blue-800 border-blue-200',
  received: 'bg-sky-50 text-sky-800 border-sky-200',
  refunded: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-800 border-slate-200',
}

export function AdminReturnDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Dialog States
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false)
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectReasonError, setRejectReasonError] = useState<string | null>(null)

  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false)
  const [receiveMappings, setReceiveMappings] = useState<Record<string, string>>({})
  const [variantSearchQueries, setVariantSearchQueries] = useState<Record<string, string>>({})
  const [variantOptionsMap, setVariantOptionsMap] = useState<Record<string, VariantOptionItem[]>>({})
  const [receiveError, setReceiveError] = useState<string | null>(null)

  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false)

  const {
    data: returnDetail,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-return', id],
    queryFn: () => adminReturnsApi.getReturnDetail(id!),
    enabled: Boolean(id),
  })

  // Initialize receive mappings with item.variantId when detail loads
  useEffect(() => {
    if (returnDetail?.items) {
      const initial: Record<string, string> = {}
      returnDetail.items.forEach((item) => {
        initial[item.orderItemId] = item.receivedVariantId || item.variantId
      })
      setReceiveMappings(initial)
    }
  }, [returnDetail])

  const invalidateQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-returns'] })
    void queryClient.invalidateQueries({ queryKey: ['admin-return', id] })
    void queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
    if (returnDetail?.orderId) {
      void queryClient.invalidateQueries({ queryKey: ['admin-order', returnDetail.orderId] })
    }
  }

  // Approve Mutation
  const approveMutation = useMutation({
    mutationFn: () => adminReturnsApi.approveReturn(id!),
    onSuccess: () => {
      invalidateQueries()
      setIsApproveDialogOpen(false)
      setMessage('Đã duyệt yêu cầu trả hàng thành công.')
      setErrorMessage(null)
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Không thể duyệt yêu cầu trả hàng.')
      setMessage(null)
    },
  })

  // Reject Mutation
  const rejectMutation = useMutation({
    mutationFn: () => adminReturnsApi.rejectReturn(id!, rejectReason.trim()),
    onSuccess: () => {
      invalidateQueries()
      setIsRejectDialogOpen(false)
      setRejectReason('')
      setMessage('Đã từ chối yêu cầu trả hàng.')
      setErrorMessage(null)
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Không thể từ chối yêu cầu trả hàng.')
      setMessage(null)
    },
  })

  // Receive Mutation
  const receiveMutation = useMutation({
    mutationFn: (items: ReceiveItemInput[]) => adminReturnsApi.receiveReturn(id!, items),
    onSuccess: () => {
      invalidateQueries()
      setIsReceiveDialogOpen(false)
      setMessage('Đã xác nhận nhận hàng và cập nhật tồn kho thành công.')
      setErrorMessage(null)
    },
    onError: (err: any) => {
      setReceiveError(err.message || 'Không thể xác nhận nhận hàng.')
    },
  })

  // Refund Mutation
  const refundMutation = useMutation({
    mutationFn: () => adminReturnsApi.refundReturn(id!),
    onSuccess: () => {
      invalidateQueries()
      setIsRefundDialogOpen(false)
      setMessage('Đã hoàn tiền thành công và cập nhật trạng thái đơn hàng.')
      setErrorMessage(null)
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Không thể hoàn tiền cho yêu cầu trả hàng.')
      setMessage(null)
    },
  })

  const handleSearchVariants = async (orderItemId: string, q: string) => {
    setVariantSearchQueries((prev) => ({ ...prev, [orderItemId]: q }))
    try {
      const res = await adminReturnsApi.searchVariantOptions(q.trim() || undefined, 20)
      setVariantOptionsMap((prev) => ({ ...prev, [orderItemId]: res.items }))
    } catch {
      // ignore
    }
  }

  const handleOpenReceiveDialog = async () => {
    setReceiveError(null)
    setIsReceiveDialogOpen(true)
    if (returnDetail?.items) {
      for (const item of returnDetail.items) {
        try {
          const res = await adminReturnsApi.searchVariantOptions(item.productName, 20)
          setVariantOptionsMap((prev) => ({ ...prev, [item.orderItemId]: res.items }))
        } catch {
          // ignore
        }
      }
    }
  }

  const handleConfirmReceive = () => {
    if (!returnDetail?.items) return
    const items: ReceiveItemInput[] = returnDetail.items.map((i) => ({
      orderItemId: i.orderItemId,
      receivedVariantId: receiveMappings[i.orderItemId] || i.variantId,
    }))

    // Validate that each item has a mapped variant
    for (const mapping of items) {
      if (!mapping.receivedVariantId) {
        setReceiveError('Vui lòng chọn biến thể nhập kho cho tất cả sản phẩm.')
        return
      }
    }

    receiveMutation.mutate(items)
  }

  const handleConfirmReject = () => {
    const trimmed = rejectReason.trim()
    if (!trimmed) {
      setRejectReasonError('Vui lòng nhập lý do từ chối.')
      return
    }
    if (trimmed.length > 1000) {
      setRejectReasonError('Lý do từ chối không được vượt quá 1000 ký tự.')
      return
    }
    setRejectReasonError(null)
    rejectMutation.mutate()
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-3" />
        <p className="text-sm font-medium text-slate-600">Đang tải thông tin yêu cầu trả hàng...</p>
      </div>
    )
  }

  if (isError || !returnDetail) {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/returns')}
          className="gap-2 text-xs"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Quay lại danh sách</span>
        </Button>

        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-8 text-center space-y-3">
            <AlertCircle className="h-8 w-8 mx-auto text-rose-600" />
            <div>
              <p className="text-sm font-bold text-rose-900">Không tìm thấy yêu cầu trả hàng</p>
              <p className="text-xs text-rose-600 mt-1">
                {(error as Error)?.message || 'Yêu cầu không tồn tại hoặc bạn không có quyền truy cập.'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Thử lại</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statusLabel = RETURN_STATUS_LABELS[returnDetail.status] || returnDetail.status
  const reasonLabel = RETURN_REASON_LABELS[returnDetail.reasonCode] || returnDetail.reasonCode
  const badgeClass =
    returnStatusBadgeClasses[returnDetail.status] || 'bg-slate-100 text-slate-800 border-slate-200'

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/returns')}
            className="gap-1.5 text-xs text-slate-600 h-9"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Danh sách trả hàng</span>
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Yêu cầu trả hàng #{returnDetail.id}
              </h1>
              <Badge variant="outline" className={`text-xs font-semibold px-2.5 py-1 ${badgeClass}`}>
                {statusLabel}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Đơn hàng:{' '}
              <Link
                to={`/orders/${returnDetail.orderId}`}
                className="font-mono text-blue-600 hover:underline font-semibold"
              >
                {returnDetail.orderId}
              </Link>
            </p>
          </div>
        </div>

        {/* Action Buttons based on status */}
        <div className="flex flex-wrap items-center gap-2">
          {returnDetail.status === 'pending_approval' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejectReason('')
                  setRejectReasonError(null)
                  setIsRejectDialogOpen(true)
                }}
                className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 text-xs h-9"
              >
                <Ban className="h-4 w-4" />
                <span>Từ chối</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsApproveDialogOpen(true)}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs h-9"
              >
                <Check className="h-4 w-4" />
                <span>Duyệt yêu cầu</span>
              </Button>
            </>
          )}

          {returnDetail.status === 'approved' && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenReceiveDialog}
              className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs h-9"
            >
              <Package className="h-4 w-4" />
              <span>Nhận hàng & Nhập kho</span>
            </Button>
          )}

          {returnDetail.status === 'received' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsRefundDialogOpen(true)}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9"
            >
              <CreditCard className="h-4 w-4" />
              <span>Hoàn tiền ({formatVND(returnDetail.expectedRefundVnd)})</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5 text-xs h-9 text-slate-600"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{message}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-emerald-500 hover:text-emerald-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Details & Items */}
        <div className="lg:col-span-8 space-y-6">
          {/* Reason & Notes Card */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-blue-600" />
                Lý do & Ghi chú từ khách hàng
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 block mb-1">Lý do trả hàng:</span>
                  <span className="font-semibold text-slate-900 text-sm">{reasonLabel}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Email người mua:</span>
                  <span className="font-semibold text-slate-900 text-sm">
                    {returnDetail.buyerEmail}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-500 block mb-1">Mô tả chi tiết từ khách hàng:</span>
                <p className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-slate-700 leading-relaxed font-sans">
                  {returnDetail.description || '(Khách hàng không cung cấp thêm ghi chú)'}
                </p>
              </div>

              {returnDetail.rejectReason && (
                <div>
                  <span className="text-rose-600 font-semibold block mb-1">
                    Lý do từ chối của cửa hàng:
                  </span>
                  <p className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 leading-relaxed font-medium">
                    {returnDetail.rejectReason}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Returned Items List */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-600" />
                Sản phẩm yêu cầu trả ({returnDetail.items.length})
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Phân loại</TableHead>
                    <TableHead className="text-center">Số lượng</TableHead>
                    <TableHead className="text-right">Đơn giá</TableHead>
                    <TableHead className="text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnDetail.items.map((item) => (
                    <TableRow key={item.orderItemId} className="hover:bg-slate-50/60">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <img
                            src={item.imageUrl || '/placeholder.png'}
                            alt={item.productName}
                            className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                          <div>
                            <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                              {item.brandName}
                            </span>
                            <span className="text-xs font-semibold text-slate-900 block">
                              {item.productName}
                            </span>
                            {item.receivedVariantId && (
                              <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded mt-0.5 inline-block font-mono">
                                Đã nhập kho biến thể: {item.receivedVariantId}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.options && item.options.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.options.map((opt, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 font-normal"
                              >
                                {opt.groupLabel}: {opt.valueLabel}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Mặc định</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-semibold text-xs text-slate-800">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right text-xs text-slate-600 tabular-nums">
                        {formatVND(item.unitPriceVnd)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-xs text-slate-900 tabular-nums">
                        {formatVND(item.lineTotalVnd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>

        {/* Right Column: Financials & Timeline */}
        <div className="lg:col-span-4 space-y-6">
          {/* Financial Summary */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-600" />
                Tổng kết tiền hoàn
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs">
              <div className="flex justify-between items-center text-slate-600">
                <span>Tiền hoàn dự kiến:</span>
                <span className="font-semibold text-slate-900 tabular-nums text-sm">
                  {formatVND(returnDetail.expectedRefundVnd)}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Tiền đã hoàn:</span>
                <span className="font-bold text-emerald-700 tabular-nums text-base">
                  {returnDetail.refundAmountVnd
                    ? formatVND(returnDetail.refundAmountVnd)
                    : 'Chưa hoàn tiền'}
                </span>
              </div>
              {returnDetail.refundedByUserId && (
                <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-slate-500">
                  <span>Mã quản trị viên duyệt:</span>
                  <span className="font-mono text-[11px] text-slate-700">
                    {returnDetail.refundedByUserId}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline Card */}
          <Card>
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                Lịch sử trạng thái
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Tạo yêu cầu:</span>
                <span className="font-mono text-slate-800">
                  {formatDateTime(returnDetail.createdAt)}
                </span>
              </div>
              {returnDetail.approvedAt && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Duyệt yêu cầu:</span>
                  <span className="font-mono text-blue-700">
                    {formatDateTime(returnDetail.approvedAt)}
                  </span>
                </div>
              )}
              {returnDetail.rejectedAt && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Từ chối yêu cầu:</span>
                  <span className="font-mono text-rose-700">
                    {formatDateTime(returnDetail.rejectedAt)}
                  </span>
                </div>
              )}
              {returnDetail.receivedAt && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Nhận hàng & Nhập kho:</span>
                  <span className="font-mono text-sky-700">
                    {formatDateTime(returnDetail.receivedAt)}
                  </span>
                </div>
              )}
              {returnDetail.refundedAt && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Hoàn tiền:</span>
                  <span className="font-mono text-emerald-700">
                    {formatDateTime(returnDetail.refundedAt)}
                  </span>
                </div>
              )}
              {returnDetail.cancelledAt && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Khách hủy yêu cầu:</span>
                  <span className="font-mono text-slate-500">
                    {formatDateTime(returnDetail.cancelledAt)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog: Approve Return */}
      <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duyệt yêu cầu trả hàng?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn duyệt yêu cầu trả hàng này không? Sau khi duyệt, khách hàng sẽ
              được thông báo để gửi hàng về kho và hệ thống sẽ chờ bạn xác nhận nhận hàng.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approveMutation.isPending}>Hủy bỏ</AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              onClick={() => approveMutation.mutate()}
              isLoading={approveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Xác nhận duyệt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Reject Return */}
      <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Từ chối yêu cầu trả hàng</AlertDialogTitle>
            <AlertDialogDescription>
              Vui lòng nhập lý do từ chối cụ thể để thông báo đến khách hàng.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3 space-y-2">
            <Label htmlFor="reject-reason" className="text-xs font-semibold text-slate-800">
              Lý do từ chối <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              rows={4}
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value.slice(0, 1000))
                setRejectReasonError(null)
              }}
              placeholder="Nhập lý do từ chối (ví dụ: Sản phẩm đã qua sử dụng, rách tem bảo hành...)"
              className="text-xs resize-none"
            />
            <div className="flex justify-between items-center text-[11px]">
              {rejectReasonError ? (
                <span className="text-rose-600 font-medium">{rejectReasonError}</span>
              ) : (
                <span />
              )}
              <span className="text-slate-400">{rejectReason.length}/1000</span>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejectMutation.isPending}>Đóng</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmReject}
              isLoading={rejectMutation.isPending}
            >
              Từ chối yêu cầu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Receive Return & Restock Mapping */}
      <AlertDialog open={isReceiveDialogOpen} onOpenChange={setIsReceiveDialogOpen}>
        <AlertDialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-sky-600" />
              Nhận hàng & Nhập lại tồn kho
            </AlertDialogTitle>
            <AlertDialogDescription>
              Kiểm tra hàng thực tế nhận được và chọn biến thể sản phẩm cần nhập tăng số lượng tồn
              kho.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {receiveError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2 my-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{receiveError}</span>
            </div>
          )}

          <div className="py-3 space-y-4">
            {returnDetail.items.map((item) => {
              const options = variantOptionsMap[item.orderItemId] || []
              const selectedVarId = receiveMappings[item.orderItemId] || item.variantId

              return (
                <div
                  key={item.orderItemId}
                  className="p-3.5 border border-slate-200 rounded-xl space-y-3 bg-slate-50/50"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={item.imageUrl || '/placeholder.png'}
                      alt={item.productName}
                      className="w-12 h-12 object-cover rounded-lg border border-slate-200 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                        {item.brandName}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {item.productName}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Số lượng hoàn trả: <strong className="text-slate-800">{item.quantity}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Variant Selection Search & Dropdown */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-800">
                      Biến thể nhập kho thực tế:
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          placeholder="Tìm kiếm biến thể theo tên/mẫu..."
                          value={variantSearchQueries[item.orderItemId] || ''}
                          onChange={(e) => handleSearchVariants(item.orderItemId, e.target.value)}
                          className="h-8 text-xs pl-8"
                        />
                        <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      </div>
                    </div>

                    <select
                      value={selectedVarId}
                      onChange={(e) =>
                        setReceiveMappings((prev) => ({
                          ...prev,
                          [item.orderItemId]: e.target.value,
                        }))
                      }
                      className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      {options.length === 0 && (
                        <option value={item.variantId}>
                          {item.productName} (Mặc định đơn hàng - ID: {item.variantId})
                        </option>
                      )}
                      {options.map((v) => {
                        const optLabel = v.options
                          ?.map((o) => `${o.groupLabel}: ${o.valueLabel}`)
                          .join(', ')
                        const activeLabel = v.variantActive && v.productActive ? 'Đang bán' : 'Ẩn'
                        return (
                          <option key={v.variantId} value={v.variantId}>
                            {v.productName} {optLabel ? `(${optLabel})` : ''} - Tồn: {v.stockQuantity} [
                            {activeLabel}]
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </div>
              )
            })}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={receiveMutation.isPending}>Hủy bỏ</AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              onClick={handleConfirmReceive}
              isLoading={receiveMutation.isPending}
              className="bg-sky-600 hover:bg-sky-700 text-white"
            >
              Xác nhận nhận hàng & Nhập kho
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Refund Return */}
      <AlertDialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              Xác nhận hoàn tiền cho khách hàng?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Số tiền hoàn trả:{' '}
              <strong className="text-emerald-700 text-sm font-bold">
                {formatVND(returnDetail.expectedRefundVnd)}
              </strong>
              .<br />
              Hành động này sẽ cập nhật trạng thái yêu cầu sang <strong>Đã hoàn tiền</strong> và cập
              nhật trạng thái đơn hàng tương ứng. Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refundMutation.isPending}>Hủy bỏ</AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              onClick={() => refundMutation.mutate()}
              isLoading={refundMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Xác nhận hoàn tiền
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default AdminReturnDetailPage
