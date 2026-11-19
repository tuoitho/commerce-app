import type { Order, OrderStatus, OrderTimelineActorType, OrderTimelineEvent } from '@/api/types'
import { formatDateTime } from '@/lib/utils'

const TIMELINE_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_confirmation: 'Đặt hàng thành công',
  confirmed: 'Xác nhận đơn hàng',
  preparing: 'Chuẩn bị hàng',
  cancel_requested: 'Yêu cầu hủy đơn',
  shipped: 'Bàn giao vận chuyển',
  delivered: 'Giao hàng thành công',
  cancelled: 'Đơn hàng đã hủy',
  partially_returned: 'Hoàn tiền một phần',
  returned: 'Hoàn trả toàn bộ đơn',
}

const ACTOR_LABELS: Record<OrderTimelineActorType, string> = {
  customer: 'Khách hàng',
  admin: 'Cửa hàng',
  system: 'Hệ thống',
}

function buildFallbackEvents(order: Order): OrderTimelineEvent[] {
  const events: OrderTimelineEvent[] = []
  if (order.createdAt) {
    events.push({
      id: 'fallback-created',
      status: 'pending_confirmation',
      actorType: 'customer',
      note: 'Đơn hàng được tạo',
      createdAt: order.createdAt,
    })
  }
  if (order.confirmedAt) {
    events.push({
      id: 'fallback-confirmed',
      status: 'confirmed',
      actorType: 'system',
      note: 'Đơn hàng đã được xác nhận',
      createdAt: order.confirmedAt,
    })
  }
  if (order.preparingAt) {
    events.push({
      id: 'fallback-preparing',
      status: 'preparing',
      actorType: 'admin',
      note: 'Đơn hàng đang được chuẩn bị',
      createdAt: order.preparingAt,
    })
  }
  if (order.shippedAt) {
    events.push({
      id: 'fallback-shipped',
      status: 'shipped',
      actorType: 'admin',
      note:
        order.carrier && order.trackingCode
          ? `Đã bàn giao vận chuyển (${order.carrier} - ${order.trackingCode})`
          : 'Đã bàn giao cho đơn vị vận chuyển',
      createdAt: order.shippedAt,
    })
  }
  if (order.deliveredAt) {
    events.push({
      id: 'fallback-delivered',
      status: 'delivered',
      actorType: 'admin',
      note: 'Đơn hàng đã giao thành công',
      createdAt: order.deliveredAt,
    })
  }
  if (order.cancelledAt) {
    events.push({
      id: 'fallback-cancelled',
      status: 'cancelled',
      actorType: 'system',
      note: 'Đơn hàng đã bị hủy',
      createdAt: order.cancelledAt,
    })
  }
  return events
}

export function OrderTimeline({ order }: { order: Order }) {
  const events =
    order.timeline && order.timeline.length > 0 ? order.timeline : buildFallbackEvents(order)

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
        <h4 className="font-bold text-zinc-950 text-sm">Hành trình đơn hàng</h4>
        <span className="font-mono text-[11px] text-zinc-400">{events.length} mốc</span>
      </div>

      <ol className="relative space-y-4 pl-4 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-zinc-200">
        {events.map((evt, idx) => {
          const isLatest = idx === events.length - 1
          return (
            <li key={evt.id || `${evt.status}-${idx}`} className="relative pl-3 space-y-1">
              <span
                aria-hidden="true"
                className={`absolute -left-[15px] top-1.5 h-2.5 w-2.5 rounded-full border-2 ${
                  isLatest
                    ? 'bg-emerald-600 border-emerald-200'
                    : 'bg-zinc-400 border-white'
                }`}
              />
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-xs font-bold text-zinc-900">
                  {TIMELINE_STATUS_LABELS[evt.status] || evt.status}
                </span>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                  {ACTOR_LABELS[evt.actorType] || evt.actorType}
                </span>
              </div>
              {evt.note && <p className="text-xs text-zinc-600 leading-snug">{evt.note}</p>}
              <p className="font-mono text-[11px] text-zinc-400">
                {formatDateTime(evt.createdAt)}
              </p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
