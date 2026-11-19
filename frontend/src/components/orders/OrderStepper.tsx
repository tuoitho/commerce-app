import { Check, Clock, Package, RotateCcw, Truck, XCircle, AlertTriangle } from 'lucide-react'
import type { Order, OrderStatus } from '@/api/types'
import { formatDateTime } from '@/lib/utils'

interface StepDef {
  key: OrderStatus
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const PROGRESS_STEPS: StepDef[] = [
  { key: 'pending_confirmation', label: 'Chờ xác nhận', icon: Clock },
  { key: 'confirmed', label: 'Đã xác nhận', icon: Check },
  { key: 'preparing', label: 'Chuẩn bị hàng', icon: Package },
  { key: 'shipped', label: 'Đang giao hàng', icon: Truck },
  { key: 'delivered', label: 'Đã giao hàng', icon: Check },
]

function resolveStepIndex(order: Order): number {
  switch (order.status) {
    case 'pending_confirmation':
      return 0
    case 'confirmed':
      return 1
    case 'preparing':
    case 'cancel_requested':
      return 2
    case 'shipped':
      return 3
    case 'delivered':
    case 'partially_returned':
    case 'returned':
      return 4
    case 'cancelled': {
      if (order.shippedAt) return 3
      if (order.preparingAt) return 2
      if (order.confirmedAt) return 1
      return 0
    }
    default:
      return 0
  }
}

function getStepTimestamp(order: Order, stepKey: OrderStatus): string | null {
  const fromTimeline = order.timeline?.find((evt) => evt.status === stepKey)?.createdAt
  if (fromTimeline) return fromTimeline

  switch (stepKey) {
    case 'pending_confirmation':
      return order.createdAt || null
    case 'confirmed':
      return order.confirmedAt || null
    case 'preparing':
      return order.preparingAt || null
    case 'shipped':
      return order.shippedAt || null
    case 'delivered':
      return order.deliveredAt || null
    default:
      return null
  }
}

export function OrderStepper({ order }: { order: Order }) {
  const currentIdx = resolveStepIndex(order)
  const isCancelled = order.status === 'cancelled'
  const isCancelRequested = order.status === 'cancel_requested'
  const isReturned = order.status === 'partially_returned' || order.status === 'returned'

  return (
    <section
      aria-label="Tiến trình đơn hàng"
      className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm sm:text-base font-bold text-zinc-950">Tiến trình đơn hàng</h2>
        {isCancelled && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-200">
            <XCircle className="h-3.5 w-3.5" />
            <span>Đã hủy đơn</span>
          </span>
        )}
        {isCancelRequested && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Đang chờ duyệt hủy</span>
          </span>
        )}
        {isReturned && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-800 border border-zinc-200">
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{order.status === 'partially_returned' ? 'Đã hoàn trả một phần' : 'Đã hoàn trả'}</span>
          </span>
        )}
      </div>

      <ol className="grid grid-cols-1 sm:grid-cols-5 gap-3 sm:gap-2">
        {PROGRESS_STEPS.map((step, index) => {
          const Icon = step.icon
          const timestamp = getStepTimestamp(order, step.key)
          const completed = !isCancelled && index < currentIdx
          const active = !isCancelled && index === currentIdx
          const reachedBeforeCancel = isCancelled && (index === 0 || Boolean(timestamp))

          return (
            <li
              key={step.key}
              className="flex sm:flex-col items-center sm:items-center gap-3 sm:gap-2 text-left sm:text-center relative"
            >
              {index > 0 && (
                <div
                  aria-hidden="true"
                  className={`hidden sm:block absolute top-4 right-1/2 w-full h-0.5 -z-0 ${
                    completed || active ? 'bg-emerald-600' : 'bg-zinc-200'
                  }`}
                />
              )}

              <div
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors ${
                  completed
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : active
                      ? 'bg-zinc-950 border-zinc-950 text-white ring-4 ring-emerald-100'
                      : reachedBeforeCancel
                        ? 'bg-zinc-200 border-zinc-300 text-zinc-700'
                        : 'bg-white border-zinc-200 text-zinc-400'
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>

              <div className="min-w-0">
                <p
                  className={`text-xs font-semibold ${
                    completed || active
                      ? 'text-zinc-950'
                      : reachedBeforeCancel
                        ? 'text-zinc-700'
                        : 'text-zinc-400'
                  }`}
                >
                  {step.label}
                </p>
                {timestamp && (
                  <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
                    {formatDateTime(timestamp)}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
