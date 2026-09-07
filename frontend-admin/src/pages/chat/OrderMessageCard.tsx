import { ShoppingBag, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatVND } from '@/lib/utils'
import type { OrderSummary } from '@/api/chat'

interface OrderMessageCardProps {
  orderSummary: OrderSummary
  linkPrefix?: string
}

export function formatOrderStatus(status: string): string {
  switch (status) {
    case 'pending_confirmation':
      return 'Chờ xác nhận'
    case 'confirmed':
      return 'Đã xác nhận'
    case 'preparing':
      return 'Đang chuẩn bị'
    case 'shipped':
      return 'Đang giao'
    case 'delivered':
      return 'Đã giao'
    case 'cancelled':
      return 'Đã hủy'
    default:
      return status
  }
}

export function OrderMessageCard({ orderSummary, linkPrefix = '/admin/orders/' }: OrderMessageCardProps) {
  const shortId = orderSummary.id ? orderSummary.id.slice(0, 8) : ''
  const linkHref = `${linkPrefix}${orderSummary.id}`

  return (
    <div
      data-testid="order-message-card"
      className="overflow-hidden rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs text-slate-700 shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
        <div className="flex items-center space-x-1.5 font-semibold text-blue-900">
          <ShoppingBag className="h-4 w-4 text-blue-600" />
          <span>Đơn hàng #{shortId}</span>
        </div>
        <Link
          to={linkHref}
          className="flex items-center space-x-1 text-blue-700 hover:text-blue-800 hover:underline font-medium"
        >
          <span>Xem chi tiết</span>
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-2 flex items-center justify-between text-slate-600">
        <span>
          Trạng thái:{' '}
          <strong className="font-medium text-slate-800">
            {formatOrderStatus(orderSummary.status)}
          </strong>
        </span>
        <span className="font-semibold text-blue-700">
          {formatVND(orderSummary.totalVnd)}
        </span>
      </div>

      {orderSummary.firstItemName && (
        <div className="mt-1 truncate text-[11px] text-slate-500">
          {orderSummary.firstItemName}
          {orderSummary.itemCount && orderSummary.itemCount > 1
            ? ` (+${orderSummary.itemCount - 1} sản phẩm khác)`
            : ''}
        </div>
      )}

      {orderSummary.recipientName && (
        <div className="mt-0.5 text-[11px] text-slate-500">
          Người nhận: <span className="font-medium text-slate-700">{orderSummary.recipientName}</span>
        </div>
      )}
    </div>
  )
}
