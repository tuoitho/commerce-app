import React, { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  getDashboard,
  type DashboardRange,
} from '@/api/dashboard'
import {
  RangeSelector,
  RevenueSummary,
  RevenueChart,
  OrderStatusBreakdown,
  PendingWorkList,
  TopProductsList,
  LowStockList,
  DashboardSkeleton,
  formatVietnamDateTime,
} from '@/components/dashboard'
import { Button } from '@/components/ui/button'
import { RefreshCw, AlertCircle } from 'lucide-react'

function isValidRange(val: string | null): val is DashboardRange {
  return val === 'today' || val === '7d' || val === '30d'
}

export const DashboardPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawRange = searchParams.get('range')
  const range: DashboardRange = isValidRange(rawRange) ? rawRange : '7d'

  useEffect(() => {
    if (rawRange !== null && !isValidRange(rawRange)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('range', '7d')
          return next
        },
        { replace: true }
      )
    }
  }, [rawRange, setSearchParams])

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-dashboard', range],
    queryFn: () => getDashboard(range),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const handleRangeChange = (newRange: DashboardRange) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('range', newRange)
      return next
    })
  }

  if (isError) {
    return (
      <div className="space-y-6">
        {/* Header bar with controls kept accessible during error state */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Tổng quan kinh doanh
            </h1>
          </div>
          <div className="flex items-center flex-wrap gap-2.5">
            <RangeSelector
              value={range}
              onChange={handleRangeChange}
            />
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-16 px-4 rounded-2xl border border-rose-200/80 bg-rose-50/30 text-center space-y-4">
          <div className="p-3 rounded-full bg-rose-100 text-rose-600">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900">
              Không thể tải số liệu tổng quan
            </h3>
            <p className="text-xs sm:text-sm text-slate-600">
              Đã xảy ra lỗi khi kết nối máy chủ. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2 border-rose-300 text-rose-700 hover:bg-rose-100/50"
          >
            <RefreshCw className="h-4 w-4" />
            Thử lại
          </Button>
        </div>
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <DashboardSkeleton />
      </div>
    )
  }

  const formattedGeneratedAt = formatVietnamDateTime(data.generatedAt)

  return (
    <div className="space-y-6">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Tổng quan kinh doanh
          </h1>
          {formattedGeneratedAt && (
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <span>Thời điểm tính số liệu:</span>
              <span className="font-medium text-slate-700">{formattedGeneratedAt}</span>
              {isFetching && (
                <span className="inline-flex items-center gap-1 text-blue-600 ml-2 text-[11px] animate-pulse">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Đang cập nhật...
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <RangeSelector
            value={range}
            onChange={handleRangeChange}
          />

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            aria-busy={isFetching}
            className="gap-1.5 h-9 text-xs sm:text-sm rounded-xl font-medium border-slate-200 hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 select-none"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>
      </div>

      {/* Revenue Summary (5 cards) */}
      <RevenueSummary revenue={data.revenue} />

      {/* Revenue Chart Slot */}
      <RevenueChart dailyRevenue={data.dailyRevenue} />

      {/* Orders Breakdown */}
      <OrderStatusBreakdown orders={data.orders} />

      {/* Pending Work */}
      <PendingWorkList pendingWork={data.pendingWork} />

      {/* Bottom Grid: Top Products and Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopProductsList topProducts={data.topProducts} />
        <LowStockList lowStock={data.lowStock} />
      </div>
    </div>
  )
}
