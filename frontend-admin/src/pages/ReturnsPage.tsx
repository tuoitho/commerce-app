import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  RotateCcw,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react'
import { adminReturnsApi } from '@/api/returns'
import {
  RETURN_STATUS_LABELS,
  RETURN_REASON_LABELS,
  type ReturnStatus,
} from '@/api/types'
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

const returnStatusBadgeClasses: Record<ReturnStatus, string> = {
  pending_approval: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-blue-50 text-blue-800 border-blue-200',
  received: 'bg-sky-50 text-sky-800 border-sky-200',
  refunded: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-800 border-slate-200',
}

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'pending_approval', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'received', label: 'Đã nhận hàng' },
  { value: 'refunded', label: 'Đã hoàn tiền' },
  { value: 'rejected', label: 'Đã từ chối' },
  { value: 'cancelled', label: 'Đã hủy' },
]

export function ReturnsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const statusParam = searchParams.get('status') || ''
  const pageParam = parseInt(searchParams.get('page') || '1', 10)
  const currentPage = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
  const limit = 20

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-returns', statusParam, currentPage],
    queryFn: () =>
      adminReturnsApi.listReturns({
        status: statusParam && statusParam !== 'all' ? statusParam : undefined,
        page: currentPage,
        limit,
      }),
  })

  const returns = data?.items || []
  const totalPages = data?.totalPages || 1
  const total = data?.total || 0

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
            Xét duyệt, nhận hàng, nhập kho và xử lý hoàn tiền cho các yêu cầu trả hàng từ khách hàng.
          </p>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-full sm:w-56">
              <Select
                value={statusParam || 'all'}
                onChange={(e) => handleStatusChange(e.target.value)}
              >
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
            {statusParam && statusParam !== 'all' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleStatusChange('all')}
                className="text-xs text-slate-500 hover:text-slate-900 shrink-0"
              >
                Xóa bộ lọc
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <span className="text-xs text-slate-500">
              Tổng cộng: <strong className="text-slate-800">{total}</strong> yêu cầu
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 text-xs text-slate-600"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Table / State */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-3" />
            <p className="text-sm font-medium text-slate-600">Đang tải danh sách yêu cầu trả hàng...</p>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-8 text-center space-y-3">
            <AlertCircle className="h-8 w-8 mx-auto text-rose-600" />
            <div>
              <p className="text-sm font-bold text-rose-900">Không thể tải danh sách trả hàng</p>
              <p className="text-xs text-rose-600 mt-1">
                {(error as Error)?.message || 'Đã xảy ra lỗi khi kết nối với máy chủ.'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Thử lại</span>
            </Button>
          </CardContent>
        </Card>
      ) : returns.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-3">
            <RotateCcw className="h-10 w-10 mx-auto text-slate-300" />
            <div>
              <p className="text-sm font-bold text-slate-800">Không tìm thấy yêu cầu trả hàng nào</p>
              <p className="text-xs text-slate-500 mt-1">
                {statusParam && statusParam !== 'all'
                  ? 'Không có yêu cầu trả hàng nào phù hợp với bộ lọc đã chọn.'
                  : 'Hiện tại chưa có yêu cầu trả hàng nào được tạo.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Mã yêu cầu</TableHead>
                    <TableHead className="w-[180px]">Mã đơn hàng</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Lý do trả</TableHead>
                    <TableHead className="text-right">Tiền hoàn dự kiến</TableHead>
                    <TableHead className="text-center">Trạng thái</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead className="text-right w-[100px]">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.map((ret) => {
                    const statusLabel = RETURN_STATUS_LABELS[ret.status] || ret.status
                    const reasonLabel = RETURN_REASON_LABELS[ret.reasonCode] || ret.reasonCode
                    const badgeClass =
                      returnStatusBadgeClasses[ret.status] || 'bg-slate-100 text-slate-800 border-slate-200'

                    return (
                      <TableRow key={ret.id} className="hover:bg-slate-50/80">
                        <TableCell className="font-mono text-xs font-semibold text-blue-600">
                          {ret.id}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">
                          <button
                            type="button"
                            onClick={() => navigate(`/orders/${ret.orderId}`)}
                            className="hover:underline text-slate-700 font-medium"
                          >
                            {ret.orderId}
                          </button>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-medium text-slate-800">
                            {ret.buyerEmail}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-700">{reasonLabel}</span>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-xs text-slate-900 tabular-nums">
                          {formatVND(ret.expectedRefundVnd)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={`text-[11px] font-semibold px-2 py-0.5 ${badgeClass}`}
                          >
                            {statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                          {formatDateTime(ret.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/returns/${ret.id}`)}
                            className="h-8 px-2.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Chi tiết</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 text-xs text-slate-500">
              <div>
                Trang <strong className="text-slate-800">{currentPage}</strong> / {totalPages} (
                {total} kết quả)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || isFetching}
                  className="h-8 px-2.5 gap-1 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Trước</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || isFetching}
                  className="h-8 px-2.5 gap-1 text-xs"
                >
                  <span>Sau</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ReturnsPage
