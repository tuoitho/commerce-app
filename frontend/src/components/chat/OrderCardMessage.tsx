import { Link } from 'react-router-dom'
import { Package, ChevronRight } from 'lucide-react'
import type { AttachedOrderCard } from '@/api/chat'
import { formatVND, formatDateTime } from '@/lib/utils'
import { getOrderStatusInfo } from '@/lib/chatUtils'

export interface OrderCardMessageProps {
  order: AttachedOrderCard
  isCustomerSender?: boolean
}

export function OrderCardMessage({ order }: OrderCardMessageProps) {
  const statusInfo = getOrderStatusInfo(order.status)
  const remainingCount = Math.max(0, order.totalItemsCount - order.itemsSummary.length)

  return (
    <div
      data-testid={`order-card-${order.id}`}
      className="my-1.5 w-full max-w-sm rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs text-slate-800"
    >
      {/* Header: Order ID, Created Date & Status Badge */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 mt-0.5">
            <Package className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <span className="block truncate text-xs font-bold text-slate-900 font-mono">
              #{order.id}
            </span>
            {order.createdAt && (
              <span className="block text-[10px] text-slate-400 font-normal">
                {formatDateTime(order.createdAt)}
              </span>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusInfo.badgeClass}`}
        >
          {statusInfo.label}
        </span>
      </div>

      {/* Items Preview */}
      <div className="divide-y divide-slate-50 py-2 space-y-1.5">
        {order.itemsSummary.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2.5 pt-1.5 first:pt-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 border border-slate-100 overflow-hidden">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.productName}
                  className="h-full w-full object-contain"
                />
              ) : (
                <Package className="h-4 w-4 text-slate-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-800" title={item.productName}>
                {item.productName}
              </p>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-0.5">
                <span className="font-semibold text-slate-700 font-mono">x{item.quantity}</span>
                <span className="tabular-nums">{formatVND(item.unitPriceVnd)}</span>
              </div>
            </div>
          </div>
        ))}

        {remainingCount > 0 && (
          <p className="pt-1.5 text-[11px] text-slate-500 font-medium italic">
            +{remainingCount} sản phẩm khác
          </p>
        )}
      </div>

      {/* Footer: Total & Navigation Link */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
        <div>
          <span className="text-[11px] text-slate-500">Tổng tiền: </span>
          <span className="font-bold text-emerald-700 tabular-nums">
            {formatVND(order.totalVnd)}
          </span>
        </div>

        <Link
          to={`/orders/${order.id}`}
          className="inline-flex items-center gap-0.5 font-semibold text-emerald-600 hover:text-emerald-700 hover:underline text-xs"
        >
          <span>Xem chi tiết</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
