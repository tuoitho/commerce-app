import { useState, useEffect } from 'react'
import { X, ShoppingBag, Loader2 } from 'lucide-react'
import { listOrders } from '@/api/orders'
import type { Order } from '@/api/types'
import { formatVND } from '@/lib/utils'
import { formatOrderStatus } from './OrderMessageCard'

interface OrderSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectOrder: (orderId: string) => void
}

export function OrderSelectorModal({ isOpen, onClose, onSelectOrder }: OrderSelectorModalProps) {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    setIsLoading(true)
    setError(null)

    listOrders()
      .then((data) => {
        if (isMounted) {
          setOrders(data || [])
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Không thể tải danh sách đơn hàng')
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      data-testid="order-selector-modal"
      className="absolute inset-0 z-30 flex flex-col bg-white/95 backdrop-blur-sm p-4 animate-in fade-in"
    >
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-2 font-semibold text-slate-800 text-sm">
          <ShoppingBag className="h-4 w-4 text-emerald-600" />
          <span>Chọn đơn hàng để đính kèm</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng chọn đơn hàng"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-2">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-xs text-slate-400 gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            <span>Đang tải đơn hàng...</span>
          </div>
        ) : error ? (
          <div className="flex h-32 flex-col items-center justify-center text-center text-xs text-rose-500">
            <p>{error}</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center text-xs text-slate-400">
            <p>Bạn chưa có đơn hàng nào.</p>
          </div>
        ) : (
          orders.map((order) => {
            const firstItem = order.items?.[0]
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => {
                  onSelectOrder(order.id)
                  onClose()
                }}
                data-testid={`select-order-${order.id}`}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left text-xs transition-all hover:border-emerald-500 hover:bg-emerald-50/50 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">
                    #{order.id.slice(0, 8)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    {formatOrderStatus(order.status)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-slate-500">
                  <span>{new Date(order.createdAt).toLocaleDateString('vi-VN')}</span>
                  <span className="font-semibold text-emerald-700">
                    {formatVND(order.totalVnd)}
                  </span>
                </div>
                {firstItem && (
                  <p className="mt-1 truncate text-[11px] text-slate-600">
                    {firstItem.productName}
                    {order.items.length > 1 ? ` (+${order.items.length - 1} khác)` : ''}
                  </p>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
