import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Clock,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertTriangle,
  ShoppingBag,
  RefreshCw,
  Smartphone,
  ChevronRight,
  Star,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { ordersApi } from '@/api/orders'
import type {
  Order,
  OrderStats,
  OrderStatus,
  OrderStatusBucket,
  OrderItem,
  Review,
} from '@/api/types'
import { formatVND, formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { ReviewFormDialog } from '@/components/ReviewFormDialog'

interface StatusBadgeConfig {
  label: string
  badgeClass: string
  icon: React.ComponentType<{ className?: string }>
}

const statusBadgeMap: Record<OrderStatus, StatusBadgeConfig> = {
  pending_confirmation: {
    label: 'Chờ xác nhận',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
    icon: Clock,
  },
  confirmed: {
    label: 'Đã xác nhận',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200/80',
    icon: CheckCircle2,
  },
  preparing: {
    label: 'Đang chuẩn bị hàng',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
    icon: Package,
  },
  cancel_requested: {
    label: 'Chờ duyệt hủy',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200/80',
    icon: AlertTriangle,
  },
  shipped: {
    label: 'Đang giao hàng',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200/80',
    icon: Truck,
  },
  delivered: {
    label: 'Đã giao',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    icon: CheckCircle2,
  },
  cancelled: {
    label: 'Đã hủy',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200/80',
    icon: XCircle,
  },
  partially_returned: {
    label: 'Trả một phần',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200/80',
    icon: RotateCcw,
  },
  returned: {
    label: 'Trả hàng',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200/80',
    icon: RotateCcw,
  },
}

interface TabConfig {
  key: OrderStatusBucket
  label: string
}

const TABS: TabConfig[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ xác nhận' },
  { key: 'pickup', label: 'Chờ lấy hàng' },
  { key: 'delivery', label: 'Chờ giao hàng' },
  { key: 'delivered', label: 'Đã giao' },
  { key: 'reviewable', label: 'Chờ đánh giá' },
  { key: 'returns', label: 'Trả hàng' },
  { key: 'cancelled', label: 'Đã hủy' },
]

export function OrderHistoryPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const currentTab = (searchParams.get('status') as OrderStatusBucket) || 'all'
  const activeTab: OrderStatusBucket = TABS.some((t) => t.key === currentTab)
    ? currentTab
    : 'all'

  const [stats, setStats] = useState<OrderStats | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoadingOrders, setIsLoadingOrders] = useState(true)
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [errorOrders, setErrorOrders] = useState<string | null>(null)

  // Review dialog state
  const [reviewDialogState, setReviewDialogState] = useState<{
    isOpen: boolean
    orderId: string
    item: OrderItem | null
    existingReview?: Review | null
  }>({
    isOpen: false,
    orderId: '',
    item: null,
    existingReview: null,
  })

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login?redirect=/orders')
    }
  }, [authLoading, isAuthenticated, navigate])

  // Fetch Order Stats
  const fetchStats = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      setIsLoadingStats(true)
      const data = await ordersApi.getOrderStats()
      setStats(data)
    } catch {
      // Gracefully handle stats failure
    } finally {
      setIsLoadingStats(false)
    }
  }, [isAuthenticated])

  // Fetch Order List for current bucket tab
  const fetchOrders = useCallback(async (bucket: OrderStatusBucket) => {
    if (!isAuthenticated) return
    try {
      setIsLoadingOrders(true)
      setErrorOrders(null)
      const data = await ordersApi.listOrders(bucket)
      setOrders(data)
    } catch {
      setErrorOrders('Không thể tải danh sách đơn hàng. Vui lòng thử lại.')
    } finally {
      setIsLoadingOrders(false)
    }
  }, [isAuthenticated])

  const handleReviewSuccess = (savedReview: Review) => {
    if (!reviewDialogState.item) return
    const orderId = reviewDialogState.orderId
    const itemId = reviewDialogState.item.id

    setOrders((prevOrders) =>
      prevOrders.map((ord) => {
        if (ord.id !== orderId) return ord
        return {
          ...ord,
          items: ord.items.map((it) => {
            if (it.id !== itemId) return it
            return {
              ...it,
              reviewStatus: 'reviewed',
              review: savedReview,
            }
          }),
        }
      })
    )

    fetchStats()
    if (activeTab === 'reviewable') {
      fetchOrders('reviewable')
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats()
    }
  }, [isAuthenticated, fetchStats])

  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders(activeTab)
    }
  }, [isAuthenticated, activeTab, fetchOrders])

  const handleTabChange = (tabKey: OrderStatusBucket) => {
    if (tabKey === 'all') {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('status')
      setSearchParams(nextParams)
    } else {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('status', tabKey)
      setSearchParams(nextParams)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50/60 pb-24">
        <div className="border-b border-slate-200 bg-white py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-4">
            <Skeleton className="h-8 w-64 rounded-xl" />
            <Skeleton className="h-5 w-96 rounded-lg" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-12 w-full rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-44 w-full rounded-3xl" />
            <Skeleton className="h-44 w-full rounded-3xl" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50/60 pb-24">
      {/* Page Header */}
      <div className="border-b border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                Lịch sử mua hàng
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Theo dõi và quản lý trạng thái các đơn hàng đã đặt tại AuraPhone
              </p>
            </div>
            <Link to="/products">
              <Button variant="outline" size="sm" className="rounded-xl font-semibold gap-1.5 self-start sm:self-auto">
                <ShoppingBag className="h-4 w-4" />
                <span>Tiếp tục mua sắm</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* 4 Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* 1. Chờ xác nhận */}
          <button
            type="button"
            onClick={() => handleTabChange('pending')}
            className={`flex items-center gap-3.5 p-4 sm:p-5 rounded-2xl border text-left transition-all cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/30 shadow-xs'
                : 'bg-white border-slate-200/90 hover:border-amber-300 hover:shadow-xs'
            }`}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100/70 text-amber-700">
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-500 truncate">Chờ xác nhận</p>
              {isLoadingStats ? (
                <Skeleton className="h-6 w-10 mt-1 rounded-md" />
              ) : (
                <p className="text-xl font-extrabold text-slate-900 tabular-nums">
                  {stats?.pendingConfirmation ?? 0}
                </p>
              )}
            </div>
          </button>

          {/* 2. Chờ lấy hàng */}
          <button
            type="button"
            onClick={() => handleTabChange('pickup')}
            className={`flex items-center gap-3.5 p-4 sm:p-5 rounded-2xl border text-left transition-all cursor-pointer ${
              activeTab === 'pickup'
                ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-400/30 shadow-xs'
                : 'bg-white border-slate-200/90 hover:border-indigo-300 hover:shadow-xs'
            }`}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100/70 text-indigo-700">
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-500 truncate">Chờ lấy hàng</p>
              {isLoadingStats ? (
                <Skeleton className="h-6 w-10 mt-1 rounded-md" />
              ) : (
                <p className="text-xl font-extrabold text-slate-900 tabular-nums">
                  {stats?.awaitingPickup ?? 0}
                </p>
              )}
            </div>
          </button>

          {/* 3. Chờ giao hàng */}
          <button
            type="button"
            onClick={() => handleTabChange('delivery')}
            className={`flex items-center gap-3.5 p-4 sm:p-5 rounded-2xl border text-left transition-all cursor-pointer ${
              activeTab === 'delivery'
                ? 'bg-sky-50/80 border-sky-300 ring-2 ring-sky-400/30 shadow-xs'
                : 'bg-white border-slate-200/90 hover:border-sky-300 hover:shadow-xs'
            }`}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100/70 text-sky-700">
              <Truck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-500 truncate">Chờ giao hàng</p>
              {isLoadingStats ? (
                <Skeleton className="h-6 w-10 mt-1 rounded-md" />
              ) : (
                <p className="text-xl font-extrabold text-slate-900 tabular-nums">
                  {stats?.awaitingDelivery ?? 0}
                </p>
              )}
            </div>
          </button>

          {/* 4. Chờ đánh giá */}
          <button
            type="button"
            onClick={() => handleTabChange('reviewable')}
            className={`flex items-center gap-3.5 p-4 sm:p-5 rounded-2xl border text-left transition-all cursor-pointer ${
              activeTab === 'reviewable'
                ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/30 shadow-xs'
                : 'bg-white border-slate-200/90 hover:border-amber-300 hover:shadow-xs'
            }`}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100/70 text-amber-700">
              <Star className="h-5 w-5 fill-amber-400 text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-500 truncate">Chờ đánh giá</p>
              {isLoadingStats ? (
                <Skeleton className="h-6 w-10 mt-1 rounded-md" />
              ) : (
                <p className="text-xl font-extrabold text-slate-900 tabular-nums">
                  {stats?.awaitingReview ?? 0}
                </p>
              )}
            </div>
          </button>
        </div>

        {/* 7 Tabs Filter */}
        <div className="border-b border-slate-200 bg-white rounded-2xl shadow-2xs p-1.5 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 min-w-max" role="tablist" aria-label="Bộ lọc trạng thái đơn hàng">
            {TABS.map((tab) => {
              const isSelected = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={isSelected}
                  type="button"
                  onClick={() => handleTabChange(tab.key)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Orders List Section */}
        {isLoadingOrders ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-3xl" />
            <Skeleton className="h-48 w-full rounded-3xl" />
            <Skeleton className="h-48 w-full rounded-3xl" />
          </div>
        ) : errorOrders ? (
          <div className="p-8 rounded-3xl border border-rose-200 bg-rose-50/50 text-center space-y-4 max-w-lg mx-auto">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 mx-auto">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Lỗi tải danh sách đơn hàng</h3>
              <p className="text-xs sm:text-sm text-slate-600">{errorOrders}</p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => fetchOrders(activeTab)}
              className="rounded-xl font-semibold gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Thử lại</span>
            </Button>
          </div>
        ) : orders.length === 0 ? (
          /* Empty State */
          <div className="py-12">
            <EmptyState
              icon={<ShoppingBag className="h-8 w-8 text-slate-400" />}
              title="Chưa có đơn hàng nào"
              description="Bạn chưa có đơn hàng nào trong nhóm trạng thái này. Khám phá ngay các dòng điện thoại cao cấp tại AuraPhone!"
              actionLabel="Khám phá sản phẩm ngay"
              actionLink="/products"
            />
          </div>
        ) : (
          /* Order Cards List */
          <div className="space-y-4">
            {orders.map((order) => {
              const statusInfo = statusBadgeMap[order.status] || {
                label: order.status,
                badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
                icon: Package,
              }
              const StatusIcon = statusInfo.icon

              return (
                <div
                  key={order.id}
                  className="group rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all"
                >
                  {/* Order Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className="font-mono text-xs sm:text-sm font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                        Mã đơn: {order.id}
                      </span>
                      <span className="text-xs text-slate-500 font-sans">
                        Ngày đặt: {formatDateTime(order.createdAt)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs font-bold px-2.5 py-1 ${statusInfo.badgeClass}`}
                      >
                        <StatusIcon className="h-3.5 w-3.5 mr-1 inline" />
                        {statusInfo.label}
                      </Badge>
                      {order.latestReturnRequest && (
                        <Badge
                          variant="outline"
                          className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 border-indigo-200"
                        >
                          Trả hàng:{' '}
                          {order.latestReturnRequest.status === 'pending_approval'
                            ? 'Chờ duyệt'
                            : order.latestReturnRequest.status === 'approved'
                            ? 'Đã duyệt'
                            : order.latestReturnRequest.status === 'received'
                            ? 'Đã nhận'
                            : order.latestReturnRequest.status === 'refunded'
                            ? 'Đã hoàn tiền'
                            : order.latestReturnRequest.status === 'rejected'
                            ? 'Bị từ chối'
                            : 'Đã hủy'}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Items Preview List */}
                  <div className="divide-y divide-slate-100 py-3">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="py-3 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                          {/* Image */}
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 p-1 overflow-hidden">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.productName}
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <Smartphone className="h-5 w-5 text-slate-300" />
                            )}
                          </div>

                          {/* Item Info */}
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {item.brandName}
                              </span>
                              {item.model && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  ({item.model})
                                </span>
                              )}
                            </div>
                            <h4 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                              <Link
                                to={`/products/${item.productId}`}
                                className="hover:text-emerald-600 transition-colors"
                              >
                                {item.productName}
                              </Link>
                            </h4>

                            {item.options && item.options.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {item.options.map((opt, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium"
                                  >
                                    {opt.groupLabel}: <strong className="text-slate-800">{opt.valueLabel}</strong>
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Review status and actions */}
                            <div className="flex items-center gap-2 pt-1.5 flex-wrap">
                              {item.reviewStatus === 'eligible' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setReviewDialogState({
                                      isOpen: true,
                                      orderId: order.id,
                                      item,
                                      existingReview: null,
                                    })
                                  }
                                  className="text-xs h-7 rounded-lg border-amber-300 bg-amber-50/60 text-amber-900 hover:bg-amber-100 font-semibold gap-1"
                                >
                                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                                  <span>Đánh giá</span>
                                </Button>
                              )}
                              {item.reviewStatus === 'reviewed' && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge
                                    variant="outline"
                                    className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 py-0.5 font-medium"
                                  >
                                    <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                                    <span>Đã đánh giá ({item.review?.rating}★)</span>
                                  </Badge>
                                  {item.review?.canEdit && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        setReviewDialogState({
                                          isOpen: true,
                                          orderId: order.id,
                                          item,
                                          existingReview: item.review,
                                        })
                                      }
                                      className="text-xs h-6 px-2 text-slate-600 hover:text-slate-900 font-medium"
                                    >
                                      Sửa đánh giá
                                    </Button>
                                  )}
                                </div>
                              )}
                              {item.reviewStatus === 'refunded' && (
                                <Badge
                                  variant="outline"
                                  className="text-[11px] bg-slate-100 text-slate-600 border-slate-200 font-medium"
                                >
                                  Đã hoàn tiền
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Price & Quantity */}
                        <div className="text-right shrink-0">
                          <p className="font-bold text-slate-900 text-sm sm:text-base tabular-nums">
                            {formatVND(item.lineTotalVnd)}
                          </p>
                          <p className="text-xs text-slate-500 tabular-nums">
                            {formatVND(item.unitPriceVnd)} x {item.quantity}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Order Card Footer */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100 pt-4 mt-1">
                    <div className="text-xs text-slate-500">
                      <span>Người nhận: </span>
                      <strong className="text-slate-800">{order.recipientName}</strong>
                      <span className="mx-1">•</span>
                      <span>{order.provinceName}</span>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6">
                      <div className="text-left sm:text-right">
                        <span className="text-xs text-slate-500 block">Tổng thanh toán</span>
                        <span className="text-base sm:text-lg font-extrabold text-emerald-700 tabular-nums">
                          {formatVND(order.totalVnd)}
                        </span>
                      </div>

                      <Link to={`/orders/${order.id}`}>
                        <Button
                          variant="primary"
                          size="sm"
                          className="rounded-xl font-bold gap-1.5 px-4 shadow-xs"
                        >
                          <span>Xem chi tiết</span>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {reviewDialogState.item && (
          <ReviewFormDialog
            isOpen={reviewDialogState.isOpen}
            onClose={() =>
              setReviewDialogState((prev) => ({ ...prev, isOpen: false, item: null }))
            }
            orderId={reviewDialogState.orderId}
            item={reviewDialogState.item}
            existingReview={reviewDialogState.existingReview}
            onSuccess={handleReviewSuccess}
          />
        )}
      </div>
    </div>
  )
}

export default OrderHistoryPage
