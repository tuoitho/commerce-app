import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  RefreshCw,
  Package,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { getAdminReturnRequests, RETURN_STATUS_LABELS } from '@/api/returnRequests'
import type { AdminReturnRequestView, ReturnRequestStatus } from '@/api/returnRequests'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatVND, formatDateTime } from '@/lib/utils'

const statusBadgeClasses: Record<ReturnRequestStatus, string> = {
  pending_approval: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-blue-50 text-blue-800 border-blue-200',
  received: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  refunded: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-800 border-slate-200',
}

export function shortId(id: string): string {
  return id.slice(0, 8)
}

export function ReturnRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const statusParam = searchParams.get('status') || ''
  const pageParam = parseInt(searchParams.get('page') || '1', 10)
  const currentPage = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
  const limit = 20

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-return-requests', statusParam, currentPage],
    queryFn: () =>
      getAdminReturnRequests({
        status: statusParam && statusParam !== 'all' ? statusParam : undefined,
        page: currentPage,
        limit,
      }),
  })

  const requests = data?.data || []
  const pagination = data?.meta?.pagination || {
    page: currentPage,
    limit,
    total: requests.length,
    totalPages: 1,
  }
  const totalPages = Math.max(pagination.totalPages, 1)

  const handleStatusChange = (newStatus: string) => {
    const nextParams = new URLSearchParams()
    if (newStatus && newStatus !== 'all') {
      nextParams.set('status', newStatus)
    }
    nextParams.set('page', '1')
    setSearchParams(nextParams)
  }

  const handlePageChange = (newPage: number) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('page', String(newPage))
    setSearchParams(nextParams)
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Quản lý yêu cầu trả hàng
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Danh sách các yêu cầu trả hàng và hoàn tiền của khách hàng trên hệ thống.
          </p>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label htmlFor="status-filter" className="text-sm font-medium text-slate-700 whitespace-nowrap">
                Trạng thái:
              </label>
              <Select
                id="status-filter"
                value={statusParam || 'all'}
                onChange={(e) => handleStatusChange(e.target.value)}
                aria-label="Lọc theo trạng thái"
                className="w-56"
              >
                <option value="all">Tất cả</option>
                <option value="pending_approval">Chờ duyệt</option>
                <option value="approved">Đã duyệt</option>
                <option value="received">Đã nhận hàng</option>
                <option value="refunded">Đã hoàn tiền</option>
                <option value="rejected">Bị từ chối</option>
                <option value="cancelled">Khách đã rút</option>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Làm mới danh sách"
              className="shrink-0 self-end sm:self-auto"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin text-blue-600' : ''}`} />
              Làm mới
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Area */}
      {isError ? (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-3">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-rose-900">
              Không thể tải danh sách yêu cầu trả hàng
            </h3>
            <p className="text-sm text-rose-600 mt-1 max-w-md">
              {error instanceof Error ? error.message : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại.'}
            </p>
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="mt-4 border-rose-300 text-rose-700 hover:bg-rose-100"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="rounded-2xl overflow-hidden border-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Mã yêu cầu</TableHead>
                  <TableHead className="w-32">Mã đơn</TableHead>
                  <TableHead>Email người mua</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Số tiền đề nghị</TableHead>
                  <TableHead className="w-36">Trạng thái</TableHead>
                  <TableHead className="whitespace-nowrap">Ngày tạo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-10 text-center text-sm text-slate-500">
                      <RefreshCw className="h-5 w-5 animate-spin text-blue-600 mx-auto mb-2" />
                      Đang tải danh sách yêu cầu trả hàng...
                    </TableCell>
                  </TableRow>
                ) : requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-500 py-6">
                        <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                          <Package className="h-6 w-6" />
                        </div>
                        <p className="text-base font-semibold text-slate-800">
                          Chưa có yêu cầu trả hàng nào
                        </p>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm">
                          {statusParam && statusParam !== 'all'
                            ? `Không tìm thấy yêu cầu trả hàng nào có trạng thái "${RETURN_STATUS_LABELS[statusParam as ReturnRequestStatus] || statusParam}".`
                            : 'Chưa có yêu cầu trả hàng nào được ghi nhận trên hệ thống.'}
                        </p>
                        {statusParam && statusParam !== 'all' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleStatusChange('all')}
                            className="mt-3"
                          >
                            Xem tất cả trạng thái
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((request) => (
                    <ReturnRequestRow key={request.id} request={request} onOpen={() => navigate(`/return-requests/${request.id}`)} />
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {pagination.total > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                Hiển thị{' '}
                <span className="font-medium text-slate-700">
                  {Math.min((currentPage - 1) * limit + 1, pagination.total)}
                </span>{' '}
                -{' '}
                <span className="font-medium text-slate-700">
                  {Math.min(currentPage * limit, pagination.total)}
                </span>{' '}
                trên tổng số{' '}
                <span className="font-medium text-slate-700">{pagination.total}</span> yêu cầu trả hàng
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="gap-1 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Trước
                </Button>

                <div className="text-xs font-medium text-slate-600 px-2">
                  Trang {pagination.page} / {totalPages}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="gap-1 text-xs"
                >
                  Sau
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function ReturnRequestRow({
  request,
  onOpen,
}: {
  request: AdminReturnRequestView
  onOpen: () => void
}) {
  return (
    <TableRow
      className="cursor-pointer hover:bg-slate-50/70 transition-colors"
      onClick={onOpen}
    >
      {/* Request ID */}
      <TableCell className="font-mono text-xs font-semibold text-blue-600">
        #{shortId(request.id)}
      </TableCell>

      {/* Order ID */}
      <TableCell className="font-mono text-xs text-slate-600">
        #{shortId(request.orderId)}
      </TableCell>

      {/* Buyer Email */}
      <TableCell className="text-sm text-slate-700">
        {request.buyerEmail || '—'}
      </TableCell>

      {/* Suggested Refund VND */}
      <TableCell className="text-right font-semibold text-slate-900 whitespace-nowrap">
        {formatVND(request.suggestedRefundVnd)}
      </TableCell>

      {/* Status */}
      <TableCell>
        <Badge
          variant="secondary"
          className={statusBadgeClasses[request.status] || 'bg-slate-100 text-slate-800'}
        >
          {RETURN_STATUS_LABELS[request.status] || request.status}
        </Badge>
      </TableCell>

      {/* Created At */}
      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
        {formatDateTime(request.createdAt)}
      </TableCell>
    </TableRow>
  )
}
