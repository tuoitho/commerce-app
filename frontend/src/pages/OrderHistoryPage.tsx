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
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Clock,
  },
  confirmed: {
    label: 'Đã xác nhận',
    badgeClass: 'bg-zinc-100 text-zinc-900 border-zinc-200',
    icon: CheckCircle2,
  },
  preparing: {
    label: 'Đang chuẩn bị hàng',
    badgeClass: 'bg-zinc-100 text-zinc-900 border-zinc-200',
    icon: Package,
  },
  cancel_requested: {
    label: 'Chờ duyệt hủy',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: AlertTriangle,
  },
  shipped: {
    label: 'Đang giao hàng',
    badgeClass: 'bg-zinc-900 text-white border-zinc-900',
    icon: Truck,
  },
  delivered: {
    label: 'Đã giao',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: CheckCircle2,
  },
  cancelled: {
    label: 'Đã hủy',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    icon: XCircle,
  },
  partially_returned: {
    label: 'Trả một phần',
    badgeClass: 'bg-zinc-100 text-zinc-800 border-zinc-200',
    icon: RotateCcw,
  },
  returned: {
    label: 'Trả hàng',
    badgeClass: 'bg-zinc-100 text-zinc-800 border-zinc-200',
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

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login?redirect=/orders')
    }
  }, [authLoading, isAuthenticated, navigate])

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
      <div className="min-h-screen bg-[#f7f7f5] pb-24">
        <div className="border-b border-zinc-200 bg-white py-8">
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
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-44 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-24">
      {/* Page Header */}
      <div className="border-b border-zinc-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950">
                Lịch sử mua hàng
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500 mt-1">
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
        {/* 4 Architectural Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <button
            type="button"
            onClick={() => handleTabChange('pending')}
            className={`flex items-center gap-3.5 p-4 sm:p-5 rounded-2xl border text-left transition-all cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-zinc-950 text-white border-zinc-950'
                : 'bg-white border-zinc-200 hover:border-zinc-400'
            }`}
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                activeTab === 'pending'
                  ? 'bg-zinc-900 border-zinc-800 text-emerald-400'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-700'
              }`}
            >
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`text-xs font-semibold truncate ${
                  activeTab === 'pending' ? 'text-zinc-400' : 'text-zinc-500'
                }`}
              >
                Chờ xác nhận
              </p>
              {isLoadingStats ? (
                <Skeleton className="h-6 w-10 mt-1 rounded-md" />
              ) : (
                <p
                  className={`font-mono text-xl font-bold tabular-nums ${
                    activeTab === 'pending' ? 'text-white' : 'text-zinc-950'
                  }`}
                >
                  {stats?.pendingConfirmation ?? 0}
                </p>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('pickup')}
            className={`flex items-center gap-3.5 p-4 sm:p-5 rounded-2xl border text-left transition-all cursor-pointer ${
              activeTab === 'pickup'
                ? 'bg-zinc-950 text-white border-zinc-950'
                : 'bg-white border-zinc-200 hover:border-zinc-400'
            }`}
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                activeTab === 'pickup'
                  ? 'bg-zinc-900 border-zinc-800 text-emerald-400'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-700'
              }`}
            >
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`text-xs font-semibold truncate ${
                  activeTab === 'pickup' ? 'text-zinc-400' : 'text-zinc-500'
                }`}
              >
                Chờ lấy hàng
              </p>
              {isLoadingStats ? (
                <Skeleton className="h-6 w-10 mt-1 rounded-md" />
              ) : (
                <p
                  className={`font-mono text-xl font-bold tabular-nums ${
                    activeTab === 'pickup' ? 'text-white' : 'text-zinc-950'
                  }`}
                >
                  {stats?.awaitingPickup ?? 0}
                </p>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('delivery')}
            className={`flex items-center gap-3.5 p-4 sm:p-5 rounded-2xl border text-left transition-all cursor-pointer ${
              activeTab === 'delivery'
                ? 'bg-zinc-950 text-white border-zinc-950'
                : 'bg-white border-zinc-200 hover:border-zinc-400'
            }`}
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                activeTab === 'delivery'
                  ? 'bg-zinc-900 border-zinc-800 text-emerald-400'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-700'
              }`}
            >
              <Truck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`text-xs font-semibold truncate ${
                  activeTab === 'delivery' ? 'text-zinc-400' : 'text-zinc-500'
                }`}
              >
                Chờ giao hàng
              </p>
              {isLoadingStats ? (
                <Skeleton className="h-6 w-10 mt-1 rounded-md" />
              ) : (
                <p
                  className={`font-mono text-xl font-bold tabular-nums ${
                    activeTab === 'delivery' ? 'text-white' : 'text-zinc-950'
                  }`}
                >
                  {stats?.awaitingDelivery ?? 0}
                </p>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('reviewable')}
            className={`flex items-center gap-3.5 p-4 sm:p-5 rounded-2xl border text-left transition-all cursor-pointer ${
              activeTab === 'reviewable'
                ? 'bg-zinc-950 text-white border-zinc-950'
                : 'bg-white border-zinc-200 hover:border-zinc-400'
            }`}
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                activeTab === 'reviewable'
                  ? 'bg-zinc-900 border-zinc-800 text-amber-400'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-700'
              }`}
            >
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`text-xs font-semibold truncate ${
                  activeTab === 'reviewable' ? 'text-zinc-400' : 'text-zinc-500'
                }`}
              >
                Chờ đánh giá
              </p>
              {isLoadingStats ? (
                <Skeleton className="h-6 w-10 mt-1 rounded-md" />
              ) : (
                <p
                  className={`font-mono text-xl font-bold tabular-nums ${
                    activeTab === 'reviewable' ? 'text-white' : 'text-zinc-950'
                  }`}
                >
                  {stats?.awaitingReview ?? 0}
                </p>
              )}
            </div>
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="border border-zinc-200 bg-white rounded-2xl p-1.5 overflow-x-auto scrollbar-none">
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
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-950 text-white'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
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
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        ) : errorOrders ? (
          <div className="p-8 rounded-2xl border border-rose-200 bg-white text-center space-y-4 max-w-lg mx-auto">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-950">Lỗi tải danh sách đơn hàng</h3>
              <p className="text-xs sm:text-sm text-zinc-600">{errorOrders}</p>
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
          <div className="py-12">
            <EmptyState
              icon={<ShoppingBag className="h-7 w-7 text-zinc-500" />}
              title="Chưa có đơn hàng nào"
              description="Bạn chưa có đơn hàng nào trong nhóm trạng thái này. Khám phá ngay các dòng điện thoại cao cấp tại AuraPhone!"
              actionLabel="Khám phá sản phẩm ngay"
              actionLink="/products"
            />
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const statusInfo = statusBadgeMap[order.status] || {
                label: order.status,
                badgeClass: 'bg-zinc-100 text-zinc-800 border-zinc-200',
                icon: Package,
              }
              const StatusIcon = statusInfo.icon

              return (
                <div
                  key={order.id}
                  className="group rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 hover:border-zinc-400 transition-all"
                >
                  {/* Order Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className="font-mono text-xs sm:text-sm font-bold text-zinc-950 bg-zinc-100 border border-zinc-200/80 px-2.5 py-1 rounded-md">
                        Mã đơn: {order.id}
                      </span>
                      <span className="text-xs text-zinc-500">
                        Ngày đặt: {formatDateTime(order.createdAt)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs font-semibold px-2.5 py-1 ${statusInfo.badgeClass}`}
                      >
                        <StatusIcon className="h-3.5 w-3.5 mr-1 inline" />
                        {statusInfo.label}
                      </Badge>
                      {order.latestReturnRequest && (
                        <Badge
                          variant="outline"
                          className="text-xs font-semibold px-2 py-0.5 bg-zinc-100 text-zinc-800 border-zinc-200"
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
                  <div className="divide-y divide-zinc-100 py-3">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="py-3 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#f7f7f5] border border-zinc-100 p-1 overflow-hidden">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.productName}
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <Smartphone className="h-5 w-5 text-zinc-300" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                {item.brandName}
                              </span>
                              {item.model && (
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  ({item.model})
                                </span>
                              )}
                            </div>
                            <h4 className="font-bold text-zinc-950 text-sm sm:text-base truncate">
                              <Link
                                to={`/products/${item.productId}`}
                                className="hover:text-emerald-700 transition-colors"
                              >
                                {item.productName}
                              </Link>
                            </h4>

                            {item.options && item.options.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {item.options.map((opt, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md font-medium"
                                  >
                                    {opt.groupLabel}: <strong className="text-zinc-900">{opt.valueLabel}</strong>
                                  </span>
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
                                      orderId: order.id,
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
                                          orderId: order.id,
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
                          <p className="font-mono font-bold text-zinc-950 text-sm sm:text-base tabular-nums">
                            {formatVND(item.lineTotalVnd)}
                          </p>
                          <p className="font-mono text-xs text-zinc-500 tabular-nums">
                            {formatVND(item.unitPriceVnd)} x {item.quantity}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Order Card Footer */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-zinc-100 pt-4 mt-1">
                    <div className="text-xs text-zinc-500">
                      <span>Người nhận: </span>
                      <strong className="text-zinc-900">{order.recipientName}</strong>
                      <span className="mx-1">•</span>
                      <span>{order.provinceName}</span>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6">
                      <div className="text-left sm:text-right">
                        <span className="text-xs text-zinc-500 block">Tổng thanh toán</span>
                        <span className="font-mono text-base sm:text-lg font-bold text-zinc-950 tabular-nums">
                          {formatVND(order.totalVnd)}
                        </span>
                      </div>

                      <Link to={`/orders/${order.id}`}>
                        <Button
                          variant="default"
                          size="sm"
                          className="rounded-xl font-semibold gap-1.5 px-4"
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
