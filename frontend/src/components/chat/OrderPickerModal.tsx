import { useEffect, useState, useCallback } from 'react'
import { X, Package, RefreshCw, ShoppingBag, Check } from 'lucide-react'
import { getCustomerOrders, type AttachedOrderCard } from '@/api/chat'
import { formatVND, formatDateTime } from '@/lib/utils'
import { getOrderStatusInfo } from '@/lib/chatUtils'

export interface OrderPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectOrder: (order: AttachedOrderCard) => void
  selectedOrderId?: string | null
}

export function OrderPickerModal({
  isOpen,
  onClose,
  onSelectOrder,
  selectedOrderId,
}: OrderPickerModalProps) {
  const [orders, setOrders] = useState<AttachedOrderCard[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getCustomerOrders(10)
      setOrders(data || [])
    } catch {
      setError('Không thể tải danh sách đơn hàng. Vui lòng thử lại.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchOrders()
    }
  }, [isOpen, fetchOrders])

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chọn đơn hàng cần hỗ trợ"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="relative flex w-full max-w-lg max-h-[85vh] flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Chọn đơn hàng cần hỗ trợ</h2>
              <p className="text-xs text-slate-500">Đính kèm đơn hàng vào cuộc trò chuyện</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-order-picker-modal"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="animate-pulse rounded-xl border border-slate-100 p-4 space-y-2 bg-slate-50/60"
                >
                  <div className="flex justify-between">
                    <div className="h-4 w-28 bg-slate-200 rounded" />
                    <div className="h-4 w-20 bg-slate-200 rounded" />
                  </div>
                  <div className="h-3 w-48 bg-slate-200 rounded" />
                  <div className="h-10 w-full bg-slate-200 rounded-lg mt-2" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 mb-3">
                <Package className="h-6 w-6" />
              </div>
              <p className="text-sm text-slate-700 font-medium mb-3">{error}</p>
              <button
                type="button"
                onClick={fetchOrders}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Thử lại</span>
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
                <ShoppingBag className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">
                Bạn chưa có đơn hàng nào
              </h3>
              <p className="text-xs text-slate-500 max-w-xs">
                Sau khi đặt hàng, các đơn hàng của bạn sẽ hiển thị tại đây để bạn có thể chọn đính kèm.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {orders.map((order) => {
                const statusInfo = getOrderStatusInfo(order.status)
                const isSelected = selectedOrderId === order.id
                return (
                  <button
                    key={order.id}
                    type="button"
                    data-testid={`order-item-${order.id}`}
                    onClick={() => {
                      onSelectOrder(order)
                      onClose()
                    }}
                    className={`w-full text-left rounded-xl border p-3.5 transition group focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500'
                        : 'border-slate-200 hover:border-emerald-400 hover:bg-slate-50/70'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-bold text-slate-900 truncate">
                          #{order.id}
                        </span>
                        {isSelected && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            <Check className="h-3 w-3" />
                            <span>Đang chọn</span>
                          </span>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusInfo.badgeClass}`}
                      >
                        {statusInfo.label}
                      </span>
                    </div>

                    {/* Items Preview */}
                    <div className="py-2 space-y-1.5">
                      {order.itemsSummary.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 overflow-hidden border border-slate-200">
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
                          <p className="truncate text-xs text-slate-700 flex-1">
                            {item.productName}
                          </p>
                          <span className="text-[11px] text-slate-500 font-mono">
                            x{item.quantity}
                          </span>
                        </div>
                      ))}
                      {order.totalItemsCount > order.itemsSummary.length && (
                        <p className="text-[11px] text-slate-400 italic">
                          +{order.totalItemsCount - order.itemsSummary.length} sản phẩm khác
                        </p>
                      )}
                    </div>

                    {/* Footer Row */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                      <span className="text-slate-400">
                        {formatDateTime(order.createdAt)}
                      </span>
                      <div>
                        <span className="text-slate-500">Tổng: </span>
                        <span className="font-bold text-emerald-700 tabular-nums">
                          {formatVND(order.totalVnd)}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-4 py-3 flex justify-end bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
