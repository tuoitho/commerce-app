import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  RefreshCw,
  ShoppingBag,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { getAdminOrders } from '@/api/orders'
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/api/types'
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

function formatAddress(provinceName: string, wardName: string, detailAddress: string): string {
  const parts = [detailAddress, wardName, provinceName].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : `${provinceName}, ${wardName}, ${detailAddress}`
}

export function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const statusParam = searchParams.get('status') || ''
  const pageParam = parseInt(searchParams.get('page') || '1', 10)
  const currentPage = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
  const limit = 20

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-orders', statusParam, currentPage],
    queryFn: () =>
      getAdminOrders({
        status: statusParam && statusParam !== 'all' ? statusParam : undefined,
        page: currentPage,
        limit,
      }),
  })

  const orders = data?.data || []
  const pagination = data?.meta?.pagination || {
    page: currentPage,
    limit,
    total: orders.length,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  }

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
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Quản lý đơn hàng</h1>
          <p className="text-sm text-slate-500 mt-1">
            Danh sách và quản lý các đơn hàng của khách hàng trên hệ thống.
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
                <option value="all">Tất cả trạng thái</option>
                <option value="pending_confirmation">Chờ xác nhận</option>
                <option value="confirmed">Đã xác nhận</option>
                <option value="preparing">Đang chuẩn bị hàng</option>
                <option value="cancel_requested">Chờ duyệt hủy</option>
                <option value="shipped">Đã giao cho ĐVVC</option>
                <option value="delivered">Đã giao</option>
                <option value="cancelled">Đã hủy</option>
                <option value="partially_returned">{ORDER_STATUS_LABELS.partially_returned}</option>
                <option value="returned">Đã trả hàng</option>
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
              Không thể tải danh sách đơn hàng
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
                  <TableHead className="w-28">Mã đơn</TableHead>
                  <TableHead className="w-36">Trạng thái</TableHead>
                  <TableHead>Email người mua</TableHead>
                  <TableHead>Người nhận</TableHead>
                  <TableHead>Số điện thoại</TableHead>
                  <TableHead className="min-w-[200px]">Địa chỉ giao hàng</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Tổng thanh toán</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Số dòng SP</TableHead>
                  <TableHead className="whitespace-nowrap">Ngày tạo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-10 text-center text-sm text-slate-500">
                      <RefreshCw className="h-5 w-5 animate-spin text-blue-600 mx-auto mb-2" />
                      Đang tải danh sách đơn hàng...
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-500 py-6">
                        <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                          <ShoppingBag className="h-6 w-6" />
                        </div>
                        <p className="text-base font-semibold text-slate-800">
                          Chưa có đơn hàng nào
                        </p>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm">
                          {statusParam && statusParam !== 'all'
                            ? `Không tìm thấy đơn hàng nào có trạng thái "${ORDER_STATUS_LABELS[statusParam as OrderStatus] || statusParam}".`
                            : 'Chưa có đơn hàng nào được ghi nhận trên hệ thống.'}
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
                  orders.map((order) => (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer hover:bg-slate-50/70 transition-colors"
                      onClick={() => navigate(`/orders/${order.id}`)}
                    >
                      {/* Order ID */}
                      <TableCell className="font-mono text-xs font-semibold text-blue-600">
                        #{order.id}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={statusBadgeClasses[order.status] || 'bg-slate-100 text-slate-800'}
                        >
                          {ORDER_STATUS_LABELS[order.status] || order.status}
                        </Badge>
                      </TableCell>

                      {/* Buyer Email */}
                      <TableCell className="text-sm text-slate-700">
                        {order.buyerEmail || '—'}
                      </TableCell>

                      {/* Recipient Name */}
                      <TableCell className="text-sm font-medium text-slate-900">
                        {order.recipientName}
                      </TableCell>

                      {/* Phone */}
                      <TableCell className="text-sm text-slate-600 font-mono">
                        {order.phone}
                      </TableCell>

                      {/* Delivery Address */}
                      <TableCell className="text-sm text-slate-600">
                        {formatAddress(order.provinceName, order.wardName, order.detailAddress)}
                      </TableCell>

                      {/* Total VND */}
                      <TableCell className="text-right font-semibold text-slate-900 whitespace-nowrap">
                        {formatVND(order.totalVnd)}
                      </TableCell>

                      {/* Items Count */}
                      <TableCell className="text-center text-sm text-slate-600 whitespace-nowrap">
                        {order.items?.length || 0} sản phẩm
                      </TableCell>

                      {/* Created At */}
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        {formatDateTime(order.createdAt)}
                      </TableCell>
                    </TableRow>
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
                <span className="font-medium text-slate-700">{pagination.total}</span> đơn hàng
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!pagination.hasPrev || currentPage <= 1}
                  className="gap-1 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Trước
                </Button>

                <div className="text-xs font-medium text-slate-600 px-2">
                  Trang {pagination.page} / {Math.max(pagination.totalPages, 1)}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!pagination.hasNext || currentPage >= pagination.totalPages}
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
