import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Truck,
  CreditCard,
  Smartphone,
  RefreshCw,
  AlertTriangle,
  ShoppingCart,
  Zap,
  Tag,
  X,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { addressesApi } from '@/api/addresses'
import { ordersApi } from '@/api/orders'
import { vouchersApi } from '@/api/vouchers'
import { getMomoIneligibleReason, isMomoAmountEligible } from '@/lib/payment'
import {
  ApiError,
  type Address,
  type AvailableVoucher,
  type CheckoutQuote,
  type CreateOrderInput,
  type DeliveryMethod,
  type PaymentMethod,
} from '@/api/types'
import { formatVND } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { AddressFormDialog } from '@/components/addresses/AddressFormDialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export function CheckoutPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { cart, isLoading: cartLoading, refreshCart } = useCart()
  const { success, error: toastError } = useToast()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [addressesLoading, setAddressesLoading] = useState(true)

  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)

  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod')
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('standard')

  const [availableVouchers, setAvailableVouchers] = useState<AvailableVoucher[]>([])
  const [voucherInput, setVoucherInput] = useState('')
  const [appliedVoucherCode, setAppliedVoucherCode] = useState('')
  const [voucherError, setVoucherError] = useState<string | null>(null)
  const [isApplyingVoucher, setIsApplyingVoucher] = useState(false)
  const [quote, setQuote] = useState<CheckoutQuote | null>(null)
  const quoteRequestIdRef = useRef(0)
  const applyVoucherSeqRef = useRef(0)
  const skipAutoQuoteKeyRef = useRef<string | null>(null)

  const [productChangedDialogOpen, setProductChangedDialogOpen] = useState(false)
  const [productChangedMessage, setProductChangedMessage] = useState('')

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login?redirect=/checkout')
    }
  }, [authLoading, isAuthenticated, navigate])

  const fetchAddresses = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      setAddressesLoading(true)
      const list = await addressesApi.listAddresses()
      setAddresses(list)

      setSelectedAddressId((prevSelected) => {
        if (prevSelected && list.some((a) => a.id === prevSelected)) {
          return prevSelected
        }
        const defaultAddr = list.find((a) => a.isDefault)
        if (defaultAddr) return defaultAddr.id
        if (list.length > 0) return list[0].id
        return null
      })
    } catch {
      toastError('Lỗi tải địa chỉ', 'Không thể tải danh sách địa chỉ giao hàng.')
    } finally {
      setAddressesLoading(false)
    }
  }, [isAuthenticated, toastError])

  useEffect(() => {
    if (isAuthenticated) {
      fetchAddresses()
    }
  }, [isAuthenticated, fetchAddresses])

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    const loadVouchers = async () => {
      try {
        const list = await vouchersApi.listAvailable()
        if (!cancelled && Array.isArray(list)) {
          setAvailableVouchers(list)
        }
      } catch {
        if (!cancelled) {
          setAvailableVouchers([])
        }
      }
    }
    void loadVouchers()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  const handleOpenCreateAddress = () => {
    setEditingAddress(null)
    setIsAddressDialogOpen(true)
  }

  const handleOpenEditAddress = (addr: Address) => {
    setEditingAddress(addr)
    setIsAddressDialogOpen(true)
  }

  const handleSetDefaultAddress = async (addrId: string) => {
    try {
      await addressesApi.setDefaultAddress(addrId)
      success('Đặt mặc định thành công', 'Đã thay đổi địa chỉ mặc định.')
      await fetchAddresses()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError('Thao tác thất bại', err.message)
      } else {
        toastError('Lỗi', 'Không thể đặt địa chỉ làm mặc định.')
      }
    }
  }

  const handleDeleteAddress = async (addrId: string) => {
    try {
      await addressesApi.deleteAddress(addrId)
      success('Đã xóa địa chỉ', 'Địa chỉ đã được loại bỏ khỏi sổ địa chỉ.')
      if (selectedAddressId === addrId) {
        setSelectedAddressId(null)
      }
      await fetchAddresses()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError('Không thể xóa địa chỉ', err.message)
      } else {
        toastError('Lỗi', 'Có lỗi xảy ra khi xóa địa chỉ.')
      }
    }
  }

  const selectedItems = cart?.items.filter((item) => item.selected) || []
  const hasSelectedItems = selectedItems.length > 0

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null
  const addressSupportsExpress = selectedAddress
    ? selectedAddress.provinceCode === 1 || selectedAddress.provinceCode === 79
    : false
  const effectiveDeliveryMethod: DeliveryMethod = addressSupportsExpress
    ? deliveryMethod
    : 'standard'
  const expressAvailable =
    addressSupportsExpress && (quote ? quote.expressAvailable : true)

  useEffect(() => {
    if (selectedAddress && !addressSupportsExpress && deliveryMethod === 'express_2h') {
      setDeliveryMethod('standard')
    }
  }, [selectedAddress, addressSupportsExpress, deliveryMethod])

  const requestCheckoutQuote = useCallback(
    async (addressId: string, method: DeliveryMethod, voucherCode: string) => {
      const reqId = ++quoteRequestIdRef.current
      try {
        const res = await vouchersApi.quoteCheckout({
          addressId,
          deliveryMethod: method,
          ...(voucherCode ? { voucherCode } : {}),
        })
        if (reqId !== quoteRequestIdRef.current) return
        if (res && typeof res === 'object' && 'totalVnd' in res) {
          setQuote(res)
          if (!res.expressAvailable && method === 'express_2h') {
            setDeliveryMethod('standard')
          }
        }
      } catch (err: unknown) {
        if (reqId !== quoteRequestIdRef.current) return
        if (err instanceof ApiError) {
          if (err.code === 'express_delivery_unavailable') {
            setDeliveryMethod('standard')
          } else if (err.code.startsWith('voucher_') && voucherCode) {
            setVoucherError(err.message)
            setAppliedVoucherCode('')
          }
        } else {
          setQuote(null)
        }
      }
    },
    []
  )

  const cartSelectedTotalVnd = cart?.selectedTotalVnd || '0'

  useEffect(() => {
    if (!isAuthenticated || !selectedAddressId || !hasSelectedItems) {
      setQuote(null)
      return
    }
    const quoteKey = `${selectedAddressId}|${effectiveDeliveryMethod}|${appliedVoucherCode}|${cartSelectedTotalVnd}`
    if (skipAutoQuoteKeyRef.current === quoteKey) {
      skipAutoQuoteKeyRef.current = null
      return
    }
    void requestCheckoutQuote(selectedAddressId, effectiveDeliveryMethod, appliedVoucherCode)
  }, [
    isAuthenticated,
    selectedAddressId,
    effectiveDeliveryMethod,
    appliedVoucherCode,
    hasSelectedItems,
    cartSelectedTotalVnd,
    requestCheckoutQuote,
  ])

  const handleApplyVoucher = async (rawCode: string) => {
    const normalized = rawCode.trim().toUpperCase()
    if (!normalized) {
      setVoucherError('Vui lòng nhập mã giảm giá')
      return
    }
    if (!selectedAddressId) {
      setVoucherError('Vui lòng chọn địa chỉ nhận hàng trước khi áp dụng mã giảm giá')
      return
    }

    const reqId = ++quoteRequestIdRef.current
    const applySeq = ++applyVoucherSeqRef.current
    setIsApplyingVoucher(true)
    setVoucherError(null)
    try {
      const res = await vouchersApi.quoteCheckout({
        addressId: selectedAddressId,
        deliveryMethod: effectiveDeliveryMethod,
        voucherCode: normalized,
      })
      if (applySeq !== applyVoucherSeqRef.current) return
      if (res && typeof res === 'object' && 'totalVnd' in res) {
        const confirmedCode = res.voucherCode || normalized
        if (reqId === quoteRequestIdRef.current) {
          const nextKey = `${selectedAddressId}|${effectiveDeliveryMethod}|${confirmedCode}|${cartSelectedTotalVnd}`
          skipAutoQuoteKeyRef.current = nextKey
          setQuote(res)
        }
        setAppliedVoucherCode(confirmedCode)
        setVoucherInput(confirmedCode)
        setVoucherError(null)
      }
    } catch (err: unknown) {
      if (applySeq !== applyVoucherSeqRef.current) return
      if (err instanceof ApiError) {
        setVoucherError(err.message || 'Không thể áp dụng mã giảm giá')
      } else {
        setVoucherError('Không thể kiểm tra mã giảm giá lúc này. Vui lòng thử lại.')
      }
    } finally {
      if (applySeq === applyVoucherSeqRef.current) {
        setIsApplyingVoucher(false)
      }
    }
  }

  const handleRemoveVoucher = () => {
    applyVoucherSeqRef.current += 1
    setAppliedVoucherCode('')
    setVoucherInput('')
    setVoucherError(null)
  }

  const subtotalVnd = quote?.subtotalVnd ?? cartSelectedTotalVnd
  const shippingFeeVnd = quote?.shippingFeeVnd ?? (cart?.shippingFeeVnd || '0')
  const discountVnd = quote?.discountVnd ?? '0'
  const totalVnd =
    quote?.totalVnd ??
    (BigInt(subtotalVnd || '0') + BigInt(shippingFeeVnd || '0')).toString()
  const momoEligible = isMomoAmountEligible(totalVnd)
  const momoIneligibleReason = getMomoIneligibleReason(totalVnd)

  useEffect(() => {
    if (!momoEligible && paymentMethod === 'momo') {
      setPaymentMethod('cod')
    }
  }, [momoEligible, paymentMethod])

  const handlePlaceOrder = async () => {
    if (!selectedAddressId) {
      toastError('Chưa chọn địa chỉ', 'Vui lòng chọn địa chỉ nhận hàng trước khi đặt hàng.')
      return
    }

    if (!hasSelectedItems) {
      toastError('Giỏ hàng trống', 'Không có sản phẩm nào được chọn để đặt hàng.')
      return
    }

    setIsPlacingOrder(true)
    try {
      const effectiveMethod: PaymentMethod = momoEligible ? paymentMethod : 'cod'
      const payload: CreateOrderInput = {
        addressId: selectedAddressId,
        ...(effectiveMethod === 'momo' ? { paymentMethod: 'momo' } : {}),
        ...(effectiveDeliveryMethod === 'express_2h' ? { deliveryMethod: 'express_2h' } : {}),
        ...(appliedVoucherCode ? { voucherCode: appliedVoucherCode } : {}),
        lines: selectedItems.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          productName: item.productName,
          unitPriceVnd: item.unitPriceVnd || '0',
        })),
      }

      const order = await ordersApi.createOrder(payload)
      await refreshCart()
      if (order.paymentMethod === 'momo') {
        if (order.payUrl) {
          window.location.assign(order.payUrl)
          return
        }
        toastError(
          'Chưa thể chuyển đến cổng MoMo',
          'Đơn hàng đã được tạo. Bạn có thể thanh toán lại qua MoMo trong chi tiết đơn hàng.'
        )
        navigate(`/orders/${order.id}`)
        return
      }
      success('Đặt hàng thành công', 'Đơn hàng của bạn đã được tiếp nhận.')
      navigate(`/orders/${order.id}`)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'product_changed') {
          setProductChangedMessage(
            err.message ||
              'Sản phẩm vừa được cập nhật giá hoặc thông tin. Vui lòng tải lại để xem thông tin mới nhất.'
          )
          setProductChangedDialogOpen(true)
        } else if (err.code === 'live_quota_exceeded') {
          toastError('Không đủ suất giá live', err.message)
          await refreshCart()
        } else if (err.code === 'flash_sale_quota_exceeded') {
          toastError('Không đủ suất Flash Sale', err.message)
          await refreshCart()
        } else if (err.code === 'out_of_stock' || err.code === 'stock_limit') {
          toastError('Hết hàng hoặc vượt số lượng', err.message || 'Sản phẩm không đủ tồn kho.')
          await refreshCart()
        } else if (err.code === 'express_delivery_unavailable') {
          setDeliveryMethod('standard')
          toastError('Không hỗ trợ giao hỏa tốc', err.message)
        } else if (err.code.startsWith('voucher_')) {
          setVoucherError(err.message)
          setAppliedVoucherCode('')
          toastError('Mã giảm giá không hợp lệ', err.message)
        } else {
          toastError('Đặt hàng thất bại', err.message || 'Có lỗi xảy ra khi đặt hàng.')
        }
      } else {
        toastError('Lỗi kết nối', 'Không thể kết nối đến hệ thống máy chủ.')
      }
    } finally {
      setIsPlacingOrder(false)
    }
  }

  const handleReloadAfterProductChanged = async () => {
    setProductChangedDialogOpen(false)
    await refreshCart()
    await fetchAddresses()
    success('Đã làm mới', 'Thông tin giỏ hàng và địa chỉ đã được cập nhật.')
  }

  if (authLoading || (cartLoading && !cart)) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 space-y-6">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-60 w-full rounded-2xl" />
          </div>
          <div className="lg:col-span-4">
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (!hasSelectedItems) {
    return (
      <div className="min-h-screen bg-[#f7f7f5] pb-24">
        <div className="border-b border-zinc-200 bg-white py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <Link to="/cart" className="text-zinc-400 hover:text-zinc-700 transition">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950">
                Thanh Toán Đơn Hàng
              </h1>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <EmptyState
            icon={<ShoppingCart className="h-7 w-7 text-zinc-500" />}
            title="Không có sản phẩm nào để thanh toán"
            description="Bạn chưa chọn sản phẩm nào trong giỏ hàng. Vui lòng quay lại giỏ hàng để chọn các sản phẩm cần mua."
            actionLabel="Quay lại giỏ hàng"
            actionLink="/cart"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-24">
      {/* Header Bar */}
      <div className="border-b border-zinc-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/cart" className="text-zinc-400 hover:text-zinc-700 transition">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950">
                  Thanh Toán Đơn Hàng
                </h1>
                <p className="text-xs sm:text-sm text-zinc-500 mt-1">
                  Kiểm tra lại sản phẩm, địa chỉ nhận hàng và xác nhận đặt hàng
                </p>
              </div>
            </div>
            <Link to="/cart">
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                <span>Giỏ hàng</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Form & Preview (Left Column) */}
          <div className="lg:col-span-8 space-y-6">
            {/* 1. Address Section */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-white">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-zinc-950">Địa chỉ nhận hàng</h2>
                    <p className="text-xs text-zinc-500">
                      Chọn địa chỉ giao hàng có sẵn hoặc thêm địa chỉ mới
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenCreateAddress}
                  className="rounded-xl font-semibold gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>Thêm địa chỉ mới</span>
                </Button>
              </div>

              {addressesLoading ? (
                <div className="space-y-3 py-2">
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              ) : addresses.length === 0 ? (
                <div className="py-8 text-center space-y-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 mx-auto">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-zinc-600">
                    Bạn chưa có địa chỉ nhận hàng nào.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleOpenCreateAddress}
                    className="rounded-xl font-semibold"
                  >
                    + Tạo địa chỉ đầu tiên
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {addresses.map((addr) => {
                    const isSelected = selectedAddressId === addr.id
                    return (
                      <div
                        key={addr.id}
                        onClick={() => setSelectedAddressId(addr.id)}
                        className={`relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-zinc-950 bg-zinc-50 ring-1 ring-zinc-950'
                            : 'border-zinc-200 bg-white hover:border-zinc-400'
                        }`}
                      >
                        <div className="flex items-start gap-3.5 flex-1">
                          <div className="pt-0.5">
                            <input
                              type="radio"
                              name="selectedAddress"
                              id={`addr-${addr.id}`}
                              checked={isSelected}
                              onChange={() => setSelectedAddressId(addr.id)}
                              className="h-4 w-4 text-zinc-950 border-zinc-300 focus:ring-zinc-950 cursor-pointer"
                            />
                          </div>

                          <div className="space-y-1 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-zinc-950">
                                {addr.recipientName}
                              </span>
                              <span className="text-zinc-500 font-mono text-xs">
                                ({addr.phone})
                              </span>
                              {addr.isDefault && (
                                <Badge
                                  variant="secondary"
                                  className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-semibold"
                                >
                                  Mặc định
                                </Badge>
                              )}
                            </div>
                            <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                              {addr.detailAddress}, {addr.wardName}, {addr.provinceName}
                            </p>
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-2 self-end sm:self-center shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!addr.isDefault && (
                            <button
                              type="button"
                              onClick={() => handleSetDefaultAddress(addr.id)}
                              className="text-xs font-semibold text-zinc-500 hover:text-zinc-950 px-2 py-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
                            >
                              Thiết lập mặc định
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEditAddress(addr)}
                            className="p-1.5 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition cursor-pointer"
                            title="Sửa địa chỉ"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAddress(addr.id)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Xóa địa chỉ"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 2. Order Preview Products List */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-900">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-zinc-950">
                      Sản phẩm đặt mua ({selectedItems.length})
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Các sản phẩm được chọn từ giỏ hàng để tạo đơn hàng
                    </p>
                  </div>
                </div>
                <Link to="/cart">
                  <Button variant="ghost" size="sm" className="rounded-xl text-zinc-700 text-xs">
                    Thay đổi trong giỏ
                  </Button>
                </Link>
              </div>

              <div className="divide-y divide-zinc-100">
                {selectedItems.map((item) => (
                  <div key={item.id} className="py-4 first:pt-1 last:pb-1 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#f7f7f5] border border-zinc-100 p-1.5 overflow-hidden">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.productName}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <Smartphone className="h-6 w-6 text-zinc-300" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold text-zinc-500 uppercase">
                            {item.brandName}
                          </span>
                          {item.model && (
                            <span className="text-[10px] text-zinc-400 font-mono">
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
                          <div className="flex flex-wrap gap-1 pt-0.5">
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
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-zinc-950 text-sm sm:text-base tabular-nums">
                        {item.lineTotalVnd ? formatVND(item.lineTotalVnd) : '0 ₫'}
                      </div>
                      <div className="font-mono text-xs text-zinc-500 tabular-nums mt-0.5">
                        {formatVND(item.unitPriceVnd)} x {item.quantity}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2.5 Delivery Method */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
              <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-900">
                  <Truck className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-950">Phương thức vận chuyển</h2>
                  <p className="text-xs text-zinc-500">
                    Phí giao hàng được tính theo khu vực nhận hàng
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  htmlFor="delivery-standard"
                  className={`flex items-start gap-3 p-4 rounded-xl border transition-colors cursor-pointer ${
                    effectiveDeliveryMethod === 'standard'
                      ? 'border-zinc-950 bg-zinc-50/70 ring-1 ring-zinc-950'
                      : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <input
                    type="radio"
                    id="delivery-standard"
                    name="deliveryMethod"
                    value="standard"
                    checked={effectiveDeliveryMethod === 'standard'}
                    onChange={() => setDeliveryMethod('standard')}
                    className="mt-1 h-4 w-4 text-zinc-950 border-zinc-300 focus:ring-zinc-950 cursor-pointer"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-zinc-950 text-sm">Giao tiêu chuẩn</span>
                      {quote && (
                        <span className="font-mono text-xs font-semibold text-emerald-700">
                          {quote.standardShippingFeeVnd === '0'
                            ? '0 ₫'
                            : formatVND(quote.standardShippingFeeVnd)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Miễn phí đơn từ {formatVND(quote?.freeShippingThresholdVnd || '5000000')}.
                    </p>
                  </div>
                </label>

                <label
                  htmlFor="delivery-express-2h"
                  className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${
                    !expressAvailable
                      ? 'border-zinc-200 bg-zinc-50/60 opacity-75 cursor-not-allowed'
                      : effectiveDeliveryMethod === 'express_2h'
                        ? 'border-zinc-950 bg-emerald-50/40 ring-1 ring-zinc-950 cursor-pointer'
                        : 'border-zinc-200 bg-white hover:border-zinc-300 cursor-pointer'
                  }`}
                >
                  <input
                    type="radio"
                    id="delivery-express-2h"
                    name="deliveryMethod"
                    value="express_2h"
                    checked={effectiveDeliveryMethod === 'express_2h'}
                    disabled={!expressAvailable}
                    onChange={() => setDeliveryMethod('express_2h')}
                    className="mt-1 h-4 w-4 text-zinc-950 border-zinc-300 focus:ring-zinc-950 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 font-bold text-zinc-950 text-sm">
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        <span>Giao hỏa tốc 2 giờ</span>
                      </span>
                      <span className="font-mono text-xs font-semibold text-zinc-700">
                        {formatVND(quote?.expressShippingFeeVnd || '60000')}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Giao nhanh nội thành trong 2 giờ.
                    </p>
                    {!expressAvailable && (
                      <p className="text-xs font-medium text-amber-700 pt-0.5">
                        Chỉ áp dụng tại Hà Nội & TP. Hồ Chí Minh
                      </p>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* 2.75 Voucher Section */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
              <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-900">
                  <Tag className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-950">Mã giảm giá</h2>
                  <p className="text-xs text-zinc-500">
                    Chọn mã ưu đãi sẵn có hoặc nhập mã giảm giá của bạn
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <Input
                  id="voucher-code-input"
                  value={voucherInput}
                  onChange={(e) => {
                    setVoucherInput(e.target.value)
                    if (voucherError) setVoucherError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleApplyVoucher(voucherInput)
                    }
                  }}
                  placeholder="Nhập mã giảm giá (VD: AURA10)"
                  aria-label="Mã giảm giá"
                  className="font-mono uppercase"
                />
                <div className="flex gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => void handleApplyVoucher(voucherInput)}
                    disabled={isApplyingVoucher || !selectedAddressId}
                    isLoading={isApplyingVoucher}
                    className="rounded-xl px-5 font-semibold"
                  >
                    Áp dụng
                  </Button>
                  {appliedVoucherCode && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemoveVoucher}
                      className="rounded-xl gap-1 text-zinc-700"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Gỡ mã</span>
                    </Button>
                  )}
                </div>
              </div>

              {voucherError && (
                <p role="alert" className="text-xs font-medium text-rose-600">
                  {voucherError}
                </p>
              )}

              {appliedVoucherCode && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs text-emerald-900">
                  <span>
                    Đang áp dụng mã <strong className="font-mono">{appliedVoucherCode}</strong>
                    {BigInt(discountVnd || '0') > 0n ? ` — Giảm ${formatVND(discountVnd)}` : ''}
                  </span>
                </div>
              )}

              {availableVouchers.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Mã giảm giá khả dụng
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {availableVouchers.map((v) => {
                      const isApplied = appliedVoucherCode === v.code
                      return (
                        <div
                          key={v.id}
                          className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                            isApplied
                              ? 'border-emerald-600 bg-emerald-50/50'
                              : 'border-zinc-200 bg-zinc-50/40 hover:border-zinc-400'
                          }`}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs font-bold text-zinc-950 bg-white border border-zinc-200 px-1.5 py-0.5 rounded">
                                {v.code}
                              </span>
                              <span className="text-[11px] text-zinc-500">
                                Còn {v.userRemainingUses} lượt
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-zinc-900 truncate">
                              {v.title}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {Number(v.minOrderVnd) > 0
                                ? `Đơn tối thiểu ${formatVND(v.minOrderVnd)}`
                                : 'Áp dụng mọi đơn hàng'}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={isApplied ? 'outline' : 'secondary'}
                            data-testid={`apply-voucher-${v.code}`}
                            disabled={isApplyingVoucher || !selectedAddressId}
                            onClick={() =>
                              isApplied ? handleRemoveVoucher() : void handleApplyVoucher(v.code)
                            }
                            className="rounded-lg text-xs shrink-0"
                          >
                            {isApplied ? 'Đã chọn' : 'Chọn mã'}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Payment Method */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
              <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-900">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-950">Phương thức thanh toán</h2>
                  <p className="text-xs text-zinc-500">
                    Chọn phương thức thanh toán phù hợp cho đơn hàng của bạn
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                    paymentMethod === 'cod'
                      ? 'border-zinc-950 bg-zinc-50/70'
                      : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <div className="pt-0.5">
                    <input
                      type="radio"
                      id="payment-cod"
                      name="paymentMethod"
                      value="cod"
                      checked={paymentMethod === 'cod'}
                      onChange={() => setPaymentMethod('cod')}
                      className="h-4 w-4 text-zinc-950 border-zinc-300 focus:ring-zinc-950 cursor-pointer"
                    />
                  </div>
                  <label htmlFor="payment-cod" className="flex-1 space-y-1 cursor-pointer">
                    <div className="flex items-center gap-2 font-bold text-zinc-950 text-sm">
                      <span>Thanh toán khi nhận hàng (COD)</span>
                      <Badge variant="outline" className="text-[10px] text-emerald-800 border-emerald-200 bg-emerald-50">
                        Khả dụng
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Bạn sẽ kiểm tra hàng và thanh toán trực tiếp bằng tiền mặt cho nhân viên giao hàng khi nhận được bưu phẩm.
                    </p>
                  </label>
                </div>

                <div
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                    !momoEligible
                      ? 'border-zinc-200 bg-zinc-50/40 opacity-75'
                      : paymentMethod === 'momo'
                        ? 'border-zinc-950 bg-pink-50/40'
                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <div className="pt-0.5">
                    <input
                      type="radio"
                      id="payment-momo"
                      name="paymentMethod"
                      value="momo"
                      checked={paymentMethod === 'momo'}
                      disabled={!momoEligible}
                      onChange={() => setPaymentMethod('momo')}
                      className="h-4 w-4 text-zinc-950 border-zinc-300 focus:ring-zinc-950 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </div>
                  <label
                    htmlFor="payment-momo"
                    className={`flex-1 space-y-1 ${momoEligible ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                  >
                    <div className="flex flex-wrap items-center gap-2 font-bold text-zinc-950 text-sm">
                      <span>Ví điện tử MoMo</span>
                      <span className="inline-flex items-center rounded-md bg-[#ae2070] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
                        MoMo
                      </span>
                      {momoEligible ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-800 border-emerald-200 bg-emerald-50">
                          Khả dụng
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-800 border-amber-200 bg-amber-50">
                          Ngoài hạn mức
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Thanh toán trực tuyến an toàn qua ứng dụng MoMo hoặc quét mã QR. Đơn hàng sẽ tự động xác nhận ngay sau khi thanh toán thành công.
                    </p>
                    {!momoEligible && momoIneligibleReason && (
                      <p className="text-xs font-medium text-amber-700 pt-1">
                        {momoIneligibleReason}
                      </p>
                    )}
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Right Summary Sidebar */}
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-6">
              <h3 className="text-lg font-bold text-zinc-950 border-b border-zinc-100 pb-3">
                Tóm tắt đơn hàng
              </h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-zinc-600">
                  <span>Tạm tính ({selectedItems.length} sản phẩm):</span>
                  <span className="font-mono font-semibold text-zinc-950 tabular-nums">
                    {formatVND(subtotalVnd)}
                  </span>
                </div>

                <div className="flex justify-between text-zinc-600">
                  <span>Phí vận chuyển:</span>
                  <span className="font-semibold text-emerald-700">
                    {!shippingFeeVnd || shippingFeeVnd === '0'
                      ? 'Miễn phí'
                      : formatVND(shippingFeeVnd)}
                  </span>
                </div>

                {(BigInt(discountVnd || '0') > 0n || appliedVoucherCode) && (
                  <div className="flex justify-between text-emerald-700">
                    <span>
                      Giảm giá{quote?.voucherCode || appliedVoucherCode ? ` (${quote?.voucherCode || appliedVoucherCode})` : ''}:
                    </span>
                    <span className="font-mono font-semibold tabular-nums">
                      -{formatVND(discountVnd)}
                    </span>
                  </div>
                )}

                <div className="pt-4 border-t border-zinc-100 flex justify-between items-baseline">
                  <span className="font-bold text-zinc-950 text-base">Tổng thanh toán:</span>
                  <span className="font-mono font-bold text-xl sm:text-2xl text-zinc-950 tabular-nums">
                    {formatVND(totalVnd)}
                  </span>
                </div>
              </div>

              {selectedAddressId && (
                <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-zinc-800">
                    <MapPin className="h-3.5 w-3.5 text-emerald-700" />
                    <span>Giao tới:</span>
                  </div>
                  {(() => {
                    const sel = addresses.find((a) => a.id === selectedAddressId)
                    if (!sel) return null
                    return (
                      <p className="text-zinc-600 leading-snug">
                        <strong className="text-zinc-950">{sel.recipientName}</strong> ({sel.phone}) - {sel.detailAddress}, {sel.wardName}, {sel.provinceName}
                      </p>
                    )
                  })()}
                </div>
              )}

              <Button
                variant="primary"
                size="lg"
                disabled={isPlacingOrder || !hasSelectedItems || !selectedAddressId}
                isLoading={isPlacingOrder}
                onClick={handlePlaceOrder}
                className="w-full h-12 rounded-xl font-semibold text-sm bg-emerald-700 hover:bg-emerald-800 gap-2"
              >
                <span>{isPlacingOrder ? 'Đang xử lý đơn hàng...' : 'Đặt hàng'}</span>
                {!isPlacingOrder && <ArrowRight className="h-4 w-4" />}
              </Button>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 text-xs text-zinc-600 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span>Bảo đảm sản phẩm chính hãng 100% VNA</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span>Được đồng kiểm khi nhận hàng</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Address Form Dialog (Create / Edit) */}
      <AddressFormDialog
        open={isAddressDialogOpen}
        onOpenChange={setIsAddressDialogOpen}
        editingAddress={editingAddress}
        defaultNewAddress={addresses.length === 0}
        onSaved={async (saved, isEdit) => {
          if (!isEdit && (saved.isDefault || addresses.length === 0)) {
            setSelectedAddressId(saved.id)
          }
          await fetchAddresses()
        }}
      />

      {/* Product Changed Dialog */}
      <Dialog open={productChangedDialogOpen} onOpenChange={setProductChangedDialogOpen}>
        <DialogContent className="max-w-md" hideCloseButton>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200 mx-auto mb-2">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <DialogHeader className="text-center">
            <DialogTitle className="text-center">Sản phẩm vừa được cập nhật</DialogTitle>
            <DialogDescription className="text-center leading-relaxed">
              {productChangedMessage ||
                'Một hoặc nhiều sản phẩm trong giỏ hàng vừa thay đổi thông tin hoặc giá bán. Vui lòng tải lại dữ liệu để xem thông tin mới nhất.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setProductChangedDialogOpen(false)
                navigate('/cart')
              }}
              className="w-full sm:w-auto rounded-xl"
            >
              Thoát
            </Button>
            <Button
              variant="primary"
              onClick={handleReloadAfterProductChanged}
              className="w-full sm:w-auto rounded-xl font-semibold gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Tải lại</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
