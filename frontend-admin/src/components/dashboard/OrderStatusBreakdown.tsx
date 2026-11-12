import React from 'react'
import { Link } from 'react-router-dom'
import type { DashboardOrders } from '@/api/dashboard'
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/api/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PackagePlus, Ban, ChevronRight } from 'lucide-react'

interface OrderStatusBreakdownProps {
  orders: DashboardOrders
}

const ALL_ORDER_STATUSES: OrderStatus[] = [
  'pending_confirmation',
  'confirmed',
  'preparing',
  'shipped',
  'delivered',
  'cancel_requested',
  'partially_returned',
  'returned',
  'cancelled',
]

export const OrderStatusBreakdown: React.FC<OrderStatusBreakdownProps> = ({ orders }) => {
  return (
    <Card className="border-slate-200/80 shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg font-semibold text-slate-900">
              Thống kê đơn hàng
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Phân bố trạng thái trên toàn hệ thống và biến động đơn trong kỳ
            </CardDescription>
          </div>
          {/* New & Cancelled in range */}
          <div className="flex items-center flex-wrap gap-3">
            <div data-testid="orders-new-in-range" className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50/70 border border-blue-100">
              <PackagePlus className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-slate-600">Đơn mới:</span>
              <span className="text-sm font-bold text-blue-700">{orders.newInRange}</span>
            </div>
            <div data-testid="orders-cancelled-in-range" className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50/70 border border-rose-100">
              <Ban className="h-4 w-4 text-rose-600" />
              <span className="text-xs font-medium text-slate-600">Đơn bị hủy:</span>
              <span className="text-sm font-bold text-rose-700">{orders.cancelledInRange}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {ALL_ORDER_STATUSES.map((status) => {
            const label = ORDER_STATUS_LABELS[status] || status
            const count = orders.byStatus[status] ?? 0
            const href = `/orders?status=${status}`

            return (
              <Link
                key={status}
                to={href}
                data-testid={`order-status-${status}`}
                className="group flex items-center justify-between p-3 rounded-xl border border-slate-200/70 bg-white hover:bg-slate-50/80 hover:border-slate-300 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 select-none"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs sm:text-sm font-medium text-slate-700 group-hover:text-slate-900 truncate">
                    {label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={count > 0 ? 'secondary' : 'outline'}
                    className={
                      count > 0
                        ? 'bg-slate-100 text-slate-800 font-semibold px-2 py-0.5 text-xs'
                        : 'text-slate-400 font-normal px-2 py-0.5 text-xs'
                    }
                  >
                    {count}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
