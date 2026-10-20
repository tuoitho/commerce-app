import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Info,
  Smartphone,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { formatVND } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { ApiError } from '@/api/types'

export function CartPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const {
    cart,
    isLoading: cartLoading,
    updateQuantity,
    toggleSelect,
    toggleSelectAll,
    removeItem,
  } = useCart()
  const { success, error: toastError } = useToast()

  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login?redirect=/cart')
    }
  }, [authLoading, isAuthenticated, navigate])

  if (authLoading || (cartLoading && !cart)) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 space-y-6">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-4">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </div>
          <div className="lg:col-span-4">
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  const items = cart?.items || []
  const hasItems = items.length > 0

  const availableItems = items.filter((item) => item.availability === 'available')
  const allSelected =
    availableItems.length > 0 && availableItems.every((item) => item.selected)

  const handleSelectAll = async () => {
    try {
      await toggleSelectAll(!allSelected)
    } catch {
      toastError('Lỗi cập nhật', 'Không thể chọn tất cả sản phẩm lúc này.')
    }
  }

  const handleToggleItem = async (itemId: string, currentSelected: boolean) => {
    try {
      await toggleSelect(itemId, !currentSelected)
    } catch {
      toastError('Lỗi cập nhật', 'Không thể thay đổi lựa chọn.')
    }
  }

  const handleQuantityChange = async (itemId: string, newQty: number, maxStock: number) => {
    if (newQty < 1) return
    if (newQty > maxStock) {
      toastError('Vượt quá tồn kho', `Sản phẩm này chỉ còn ${maxStock} đơn vị khả dụng.`)
      return
    }

    setUpdatingItemId(itemId)
    try {
      await updateQuantity(itemId, newQty)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'stock_limit') {
        toastError('Vượt quá tồn kho', err.message || 'Số lượng vượt quá tồn kho khả dụng.')
      } else {
        toastError('Lỗi cập nhật', 'Không thể cập nhật số lượng.')
      }
    } finally {
      setUpdatingItemId(null)
    }
  }

  const handleRemove = async (itemId: string, name: string) => {
    setUpdatingItemId(itemId)
    try {
      await removeItem(itemId)
      success('Đã xóa khỏi giỏ', `Đã loại bỏ ${name} khỏi giỏ hàng.`)
    } catch {
      toastError('Lỗi xóa', 'Không thể xóa sản phẩm khỏi giỏ.')
    } finally {
      setUpdatingItemId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-24">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950">
                Giỏ Hàng Của Bạn
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500 mt-1">
                {hasItems
                  ? `Đang có ${cart?.totalUnits || 0} sản phẩm trong giỏ`
                  : 'Chưa có sản phẩm nào trong giỏ hàng'}
              </p>
            </div>
            <Link to="/products">
              <Button variant="outline" size="sm" className="rounded-xl">
                Tiếp tục mua sắm
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {!hasItems ? (
          <EmptyState
            icon={<ShoppingCart className="h-7 w-7 text-zinc-500" />}
            title="Giỏ hàng đang trống"
            description="Bạn chưa thêm sản phẩm nào vào giỏ. Hãy bắt đầu chọn những thiết bị yêu thích ngay hôm nay!"
            actionLabel="Khám phá điện thoại"
            actionLink="/products"
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Cart Items List */}
            <div className="lg:col-span-8 space-y-4">
              {/* Select All Bar */}
              <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center gap-3 select-none">
                  <Checkbox
                    id="select-all"
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                  />
                  <label
                    htmlFor="select-all"
                    className="text-sm font-bold text-zinc-950 cursor-pointer"
                  >
                    Chọn tất cả ({availableItems.length} sản phẩm có thể mua)
                  </label>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-3">
                {items.map((item) => {
                  const isAvailable = item.availability === 'available'
                  const isOutOfStock = item.availability === 'out_of_stock'
                  const isInsufficient = item.availability === 'insufficient_stock'
                  const isUnavailable = item.availability === 'unavailable'
                  const isUpdating = updatingItemId === item.id

                  return (
                    <div
                      key={item.id}
                      className={`relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border p-4 sm:p-5 transition-all ${
                        !isAvailable
                          ? 'border-amber-200 bg-amber-50/20'
                          : 'border-zinc-200 bg-white hover:border-zinc-400'
                      }`}
                    >
                      {/* Checkbox & Product Info */}
                      <div className="flex items-center gap-4 flex-1">
                        <Checkbox
                          id={`item-${item.id}`}
                          checked={item.selected}
                          disabled={!isAvailable}
                          onCheckedChange={() => isAvailable && handleToggleItem(item.id, item.selected)}
                        />

                        {/* Thumbnail */}
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-[#f7f7f5] border border-zinc-100 p-2 overflow-hidden">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.productName}
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <Smartphone className="h-7 w-7 text-zinc-300" />
                          )}
                        </div>

                        {/* Text */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                              {item.brandName}
                            </span>
                            {item.model && (
                              <span className="text-[11px] text-zinc-400 font-mono">
                                ({item.model})
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-zinc-950 text-sm sm:text-base leading-tight">
                            <Link
                              to={`/products/${item.productId}`}
                              className="hover:text-emerald-700 transition"
                            >
                              {item.productName}
                            </Link>
                          </h3>

                          {item.options && item.options.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {item.options.map((opt, idx) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="text-[10px] font-normal"
                                >
                                  {opt.groupLabel}: <span className="font-semibold ml-0.5">{opt.valueLabel}</span>
                                </Badge>
                              ))}
                            </div>
                          )}

                          {isOutOfStock && (
                            <div className="flex items-center gap-1 text-xs text-rose-600 font-semibold pt-1">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>Sản phẩm này tạm thời hết hàng</span>
                            </div>
                          )}
                          {isInsufficient && (
                            <div className="flex items-center gap-1 text-xs text-amber-700 font-semibold pt-1">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>Vượt quá tồn kho (Hiện còn: {item.stockQuantity})</span>
                            </div>
                          )}
                          {isUnavailable && (
                            <div className="flex items-center gap-1 text-xs text-zinc-500 font-semibold pt-1">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>Phiên bản này hiện không còn kinh doanh</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Price, Stepper & Delete */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-4 pt-3 sm:pt-0 border-t sm:border-t-0 border-zinc-100">
                        <div className="text-left sm:text-right">
                          <div className="font-mono font-bold text-zinc-950 text-base tabular-nums">
                            {item.lineTotalVnd ? formatVND(item.lineTotalVnd) : 'Không khả dụng'}
                          </div>
                          {item.unitPriceVnd && (
                            <div className="font-mono text-[11px] text-zinc-400 tabular-nums">
                              {formatVND(item.unitPriceVnd)} / chiếc
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center border border-zinc-200 rounded-xl bg-white p-0.5">
                            <button
                              type="button"
                              disabled={isUpdating || item.quantity <= 1 || isUnavailable || isOutOfStock}
                              onClick={() =>
                                handleQuantityChange(item.id, item.quantity - 1, item.stockQuantity)
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-8 text-center font-mono text-xs font-bold tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              disabled={
                                isUpdating ||
                                item.quantity >= item.stockQuantity ||
                                !isAvailable
                              }
                              onClick={() =>
                                handleQuantityChange(item.id, item.quantity + 1, item.stockQuantity)
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleRemove(item.id, item.productName)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Xóa khỏi giỏ"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right: Order Summary Sidebar */}
            <div className="lg:col-span-4 space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-6">
                <h3 className="text-lg font-bold text-zinc-950 border-b border-zinc-100 pb-3">
                  Tóm tắt đơn hàng
                </h3>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-zinc-600">
                    <span>Tổng số lượng:</span>
                    <span className="font-mono font-semibold text-zinc-950">
                      {cart?.totalUnits || 0} sản phẩm
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span>Số dòng được chọn:</span>
                    <span className="font-mono font-semibold text-emerald-700">
                      {cart?.selectedLineCount || 0} sản phẩm
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span>Phí vận chuyển:</span>
                    <span className="font-semibold text-emerald-700">
                      {!cart?.shippingFeeVnd || cart.shippingFeeVnd === '0'
                        ? 'Miễn phí'
                        : formatVND(cart.shippingFeeVnd)}
                    </span>
                  </div>

                  <div className="pt-4 border-t border-zinc-100 flex justify-between items-baseline">
                    <span className="font-bold text-zinc-950 text-base">Tổng thanh toán:</span>
                    <span className="font-mono font-bold text-xl sm:text-2xl text-zinc-950 tabular-nums">
                      {formatVND(cart?.selectedTotalVnd || 0)}
                    </span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  disabled={!cart?.selectedLineCount || cart.selectedLineCount === 0}
                  onClick={() => navigate('/checkout')}
                  className="w-full h-12 rounded-xl font-semibold text-sm bg-emerald-700 hover:bg-emerald-800 gap-2"
                >
                  <span>Tiến hành mua hàng</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-500 text-xs leading-relaxed">
                  <Info className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
                  <span>
                    Chỉ những sản phẩm hợp lệ được chọn mới được tính vào tổng thanh toán.
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  <span>Bảo mật thanh toán & thông tin khách hàng</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
