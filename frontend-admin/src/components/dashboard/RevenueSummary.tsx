import React from 'react'
import type { DashboardRevenue } from '@/api/dashboard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoneyVndExact } from './formatters'
import { DollarSign, RotateCcw, TrendingUp, ShoppingBag, Calculator } from 'lucide-react'

interface RevenueSummaryProps {
  revenue: DashboardRevenue
}

export const RevenueSummary: React.FC<RevenueSummaryProps> = ({ revenue }) => {
  const isNetNegative = revenue.netVnd.startsWith('-')

  const metrics = [
    {
      title: 'Doanh thu đã giao',
      value: formatMoneyVndExact(revenue.deliveredVnd),
      icon: DollarSign,
      iconColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      description: 'Tổng tiền các đơn đã giao trong kỳ',
    },
    {
      title: 'Đã hoàn tiền',
      value: formatMoneyVndExact(revenue.refundedVnd),
      icon: RotateCcw,
      iconColor: 'text-rose-600',
      bgColor: 'bg-rose-50',
      description: 'Tổng tiền hoàn của yêu cầu đã hoàn trong kỳ',
    },
    {
      title: 'Doanh thu thuần',
      value: formatMoneyVndExact(revenue.netVnd),
      icon: TrendingUp,
      iconColor: isNetNegative ? 'text-rose-600' : 'text-blue-600',
      bgColor: isNetNegative ? 'bg-rose-50' : 'bg-blue-50',
      valueColor: isNetNegative ? 'text-rose-600 font-bold' : 'text-slate-900 font-bold',
      description: 'Doanh thu đã giao trừ đã hoàn tiền',
    },
    {
      title: 'Số đơn đã giao',
      value: revenue.deliveredOrders.toLocaleString('vi-VN'),
      icon: ShoppingBag,
      iconColor: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      description: 'Đơn hàng giao thành công trong kỳ',
    },
    {
      title: 'Giá trị đơn trung bình',
      value: formatMoneyVndExact(revenue.averageOrderVnd),
      icon: Calculator,
      iconColor: 'text-amber-600',
      bgColor: 'bg-amber-50',
      description: 'Doanh thu đã giao / Số đơn đã giao',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
      {metrics.map((m) => {
        const Icon = m.icon
        return (
          <Card key={m.title} className="border-slate-200/80 shadow-xs hover:shadow-sm transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-slate-600">
                {m.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${m.bgColor}`}>
                <Icon className={`h-4 w-4 ${m.iconColor}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={`text-lg sm:text-xl xl:text-2xl font-bold tracking-tight break-words tabular-nums ${m.valueColor || 'text-slate-900'}`}
                title={m.value}
              >
                {m.value}
              </div>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-1" title={m.description}>
                {m.description}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
