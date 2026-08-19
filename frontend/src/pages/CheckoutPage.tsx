import { useEffect, useState, useCallback } from 'react'
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
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { addressesApi } from '@/api/addresses'
import { areasApi } from '@/api/areas'
import { ordersApi } from '@/api/orders'
import {
  ApiError,
  type Address,
  type AddressInput,
  type Province,
  type Ward,
  type CreateOrderInput,
} from '@/api/types'
import { formatVND } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface AddressFormData {
  recipientName: string
  phone: string
  provinceCode: number | ''
  wardCode: number | ''
  detailAddress: string
  isDefault: boolean
}

const initialAddressFormData: AddressFormData = {
  recipientName: '',
  phone: '',
  provinceCode: '',
  wardCode: '',
  detailAddress: '',
  isDefault: false,
}

export function CheckoutPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { cart, isLoading: cartLoading, refreshCart } = useCart()
  const { success, error: toastError } = useToast()

  // Addresses state
  const [addresses, setAddresses] = useState<Address[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [addressesLoading, setAddressesLoading] = useState(true)

  // Address dialog state
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)
  const [addressFormData, setAddressFormData] = useState<AddressFormData>(initialAddressFormData)
  const [addressFormErrors, setAddressFormErrors] = useState<Record<string, string>>({})
  const [isSavingAddress, setIsSavingAddress] = useState(false)

  // Area data
  const [provinces, setProvinces] = useState<Province[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [wardsLoading, setWardsLoading] = useState(false)

  // Order placement state
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)

  // Product changed dialog state
  const [productChangedDialogOpen, setProductChangedDialogOpen] = useState(false)
  const [productChangedMessage, setProductChangedMessage] = useState('')

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login?redirect=/checkout')
    }
  }, [authLoading, isAuthenticated, navigate])

  // Fetch provinces once
  useEffect(() => {
    let active = true
    areasApi
      .listProvinces()
      .then((data) => {
        if (active) setProvinces(data)
      })
      .catch(() => {
        // Handled silently or retryable
      })
    return () => {
      active = false
    }
  }, [])

  // Fetch addresses
  const fetchAddresses = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      setAddressesLoading(true)
      const list = await addressesApi.listAddresses()
      setAddresses(list)

      // Auto select default address or first address if none selected
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

  // Fetch wards when provinceCode changes in address form
  const fetchWardsForProvince = useCallback(async (provinceCode: number) => {
    try {
      setWardsLoading(true)
      const data = await areasApi.listWards(provinceCode)
      setWards(data)
    } catch {
      setWards([])
      toastError('Lỗi tải phường/xã', 'Không thể tải danh sách phường/xã.')
    } finally {
      setWardsLoading(false)
    }
  }, [toastError])

  // Handle province change in address form
  const handleProvinceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    const code = val ? Number(val) : ''
    setAddressFormData((prev) => ({
      ...prev,
      provinceCode: code,
      wardCode: '',
    }))
    setAddressFormErrors((prev) => {
      const next = { ...prev }
      delete next.provinceCode
      delete next.wardCode
      return next
    })

    if (code) {
      fetchWardsForProvince(code)
    } else {
      setWards([])
    }
  }

  // Open address dialog for create
  const handleOpenCreateAddress = () => {
    setEditingAddress(null)
    setAddressFormData({
      ...initialAddressFormData,
      isDefault: addresses.length === 0, // Auto default if first address
    })
    setAddressFormErrors({})
    setWards([])
    setIsAddressDialogOpen(true)
  }

  // Open address dialog for edit
  const handleOpenEditAddress = (addr: Address) => {
    setEditingAddress(addr)
    setAddressFormData({
      recipientName: addr.recipientName,
      phone: addr.phone,
      provinceCode: addr.provinceCode,
      wardCode: addr.wardCode,
      detailAddress: addr.detailAddress,
      isDefault: addr.isDefault,
    })
    setAddressFormErrors({})
    setIsAddressDialogOpen(true)
    fetchWardsForProvince(addr.provinceCode)
  }

  // Validate address form
  const validateAddressForm = (): boolean => {
    const errors: Record<string, string> = {}
    if (!addressFormData.recipientName.trim()) {
      errors.recipientName = 'Vui lòng nhập họ và tên người nhận'
    }
    if (!addressFormData.phone.trim()) {
      errors.phone = 'Vui lòng nhập số điện thoại'
    } else if (!/^0\d{9,10}$/.test(addressFormData.phone.trim())) {
      errors.phone = 'Số điện thoại không hợp lệ (10-11 chữ số, bắt đầu bằng 0)'
    }
    if (!addressFormData.provinceCode) {
      errors.provinceCode = 'Vui lòng chọn Tỉnh/Thành phố'
    }
    if (!addressFormData.wardCode) {
      errors.wardCode = 'Vui lòng chọn Phường/Xã'
    }
    if (!addressFormData.detailAddress.trim()) {
      errors.detailAddress = 'Vui lòng nhập địa chỉ chi tiết'
    }

    setAddressFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Save address (create or update)
  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateAddressForm()) return

    try {
      setIsSavingAddress(true)
      const payload: AddressInput = {
        recipientName: addressFormData.recipientName.trim(),
        phone: addressFormData.phone.trim(),
        provinceCode: Number(addressFormData.provinceCode),
        wardCode: Number(addressFormData.wardCode),
        detailAddress: addressFormData.detailAddress.trim(),
        isDefault: addressFormData.isDefault,
      }

      if (editingAddress) {
        await addressesApi.updateAddress(editingAddress.id, payload)
        success('Cập nhật thành công', 'Địa chỉ giao hàng đã được cập nhật.')
      } else {
        const created = await addressesApi.createAddress(payload)
        success('Thêm thành công', 'Địa chỉ giao hàng mới đã được lưu.')
        // If created address is default or first address, select it
        if (created.isDefault || addresses.length === 0) {
          setSelectedAddressId(created.id)
        }
      }

      setIsAddressDialogOpen(false)
      await fetchAddresses()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.fields) {
        const mappedErrors: Record<string, string> = {}
        if (err.fields.recipient_name) mappedErrors.recipientName = err.fields.recipient_name
        if (err.fields.phone) mappedErrors.phone = err.fields.phone
        if (err.fields.province_code) mappedErrors.provinceCode = err.fields.province_code
        if (err.fields.ward_code) mappedErrors.wardCode = err.fields.ward_code
        if (err.fields.detail_address) mappedErrors.detailAddress = err.fields.detail_address
        setAddressFormErrors(mappedErrors)
      } else if (err instanceof ApiError) {
        toastError('Không thể lưu địa chỉ', err.message)
      } else {
        toastError('Lỗi', 'Có lỗi xảy ra khi lưu địa chỉ.')
      }
    } finally {
      setIsSavingAddress(false)
    }
  }

  // Set default address
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

  // Delete address
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

  // Selected items from cart
  const selectedItems = cart?.items.filter((item) => item.selected) || []
  const hasSelectedItems = selectedItems.length > 0

  // Calculate totals
  const subtotalVnd = cart?.selectedTotalVnd || '0'
  const shippingFeeVnd = cart?.shippingFeeVnd || '0'
  const totalVnd = (
    BigInt(subtotalVnd || '0') + BigInt(shippingFeeVnd || '0')
  ).toString()

  // Place order
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
      const payload: CreateOrderInput = {
        addressId: selectedAddressId,
        lines: selectedItems.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          productName: item.productName,
          unitPriceVnd: item.unitPriceVnd || '0',
        })),
      }

      const order = await ordersApi.createOrder(payload)
      await refreshCart()
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
        } else if (err.code === 'out_of_stock' || err.code === 'stock_limit') {
          toastError('Hết hàng hoặc vượt số lượng', err.message || 'Sản phẩm không đủ tồn kho.')
          await refreshCart()
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

  // Reload after product_changed
  const handleReloadAfterProductChanged = async () => {
    setProductChangedDialogOpen(false)
    await refreshCart()
    await fetchAddresses()
    success('Đã làm mới', 'Thông tin giỏ hàng và địa chỉ đã được cập nhật.')
  }

  // Loading skeleton
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

  // Empty state when no items selected
  if (!hasSelectedItems) {
    return (
      <div className="min-h-screen bg-slate-50/60 pb-24">
        <div className="border-b border-slate-200 bg-white py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <Link to="/cart" className="text-slate-400 hover:text-slate-600 transition">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                Thanh Toán Đơn Hàng
              </h1>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <EmptyState
            icon={<ShoppingCart className="h-8 w-8 text-slate-400" />}
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
    <div className="min-h-screen bg-slate-50/60 pb-24">
      {/* Header Bar */}
      <div className="border-b border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/cart" className="text-slate-400 hover:text-slate-600 transition">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                  Thanh Toán Đơn Hàng
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
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
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Địa chỉ nhận hàng</h2>
                    <p className="text-xs text-slate-500">
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

              {/* Address list */}
              {addressesLoading ? (
                <div className="space-y-3 py-2">
                  <Skeleton className="h-20 w-full rounded-2xl" />
                  <Skeleton className="h-20 w-full rounded-2xl" />
                </div>
              ) : addresses.length === 0 ? (
                <div className="py-8 text-center space-y-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mx-auto">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">
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
                        className={`relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50/25 ring-2 ring-emerald-600/20 shadow-xs'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        {/* Radio selection & Address Info */}
                        <div className="flex items-start gap-3.5 flex-1">
                          <div className="pt-0.5">
                            <input
                              type="radio"
                              name="selectedAddress"
                              id={`addr-${addr.id}`}
                              checked={isSelected}
                              onChange={() => setSelectedAddressId(addr.id)}
                              className="h-4 w-4 text-emerald-600 border-slate-300 focus:ring-emerald-600 cursor-pointer"
                            />
                          </div>

                          <div className="space-y-1 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-900">
                                {addr.recipientName}
                              </span>
                              <span className="text-slate-400 font-mono text-xs">
                                ({addr.phone})
                              </span>
                              {addr.isDefault && (
                                <Badge
                                  variant="secondary"
                                  className="bg-emerald-100/70 text-emerald-800 border-emerald-200 text-[10px] font-semibold"
                                >
                                  Mặc định
                                </Badge>
                              )}
                            </div>
                            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                              {addr.detailAddress}, {addr.wardName}, {addr.provinceName}
                            </p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div
                          className="flex items-center gap-2 self-end sm:self-center shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!addr.isDefault && (
                            <button
                              type="button"
                              onClick={() => handleSetDefaultAddress(addr.id)}
                              className="text-xs font-semibold text-slate-500 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition"
                            >
                              Thiết lập mặc định
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEditAddress(addr)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                            title="Sửa địa chỉ"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAddress(addr.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
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
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Sản phẩm đặt mua ({selectedItems.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Các sản phẩm được chọn từ giỏ hàng để tạo đơn hàng
                    </p>
                  </div>
                </div>
                <Link to="/cart">
                  <Button variant="ghost" size="sm" className="rounded-xl text-emerald-600 text-xs">
                    Thay đổi trong giỏ
                  </Button>
                </Link>
              </div>

              {/* Items List */}
              <div className="divide-y divide-slate-100">
                {selectedItems.map((item) => (
                  <div key={item.id} className="py-4 first:pt-1 last:pb-1 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      {/* Image */}
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 p-1.5 overflow-hidden">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.productName}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <Smartphone className="h-6 w-6 text-slate-300" />
                        )}
                      </div>

                      {/* Text */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase">
                            {item.brandName}
                          </span>
                          {item.model && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({item.model})
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
                          <Link
                            to={`/products/${item.productId}`}
                            className="hover:text-emerald-600 transition"
                          >
                            {item.productName}
                          </Link>
                        </h3>

                        {/* Options pills */}
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

                    {/* Quantity and Price */}
                    <div className="text-right shrink-0">
                      <div className="font-bold text-slate-900 text-sm sm:text-base tabular-nums">
                        {item.lineTotalVnd ? formatVND(item.lineTotalVnd) : '0 ₫'}
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums mt-0.5">
                        {formatVND(item.unitPriceVnd)} x {item.quantity}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Payment Method */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Phương thức thanh toán</h2>
                  <p className="text-xs text-slate-500">
                    Hiện hệ thống áp dụng phương thức COD tiêu chuẩn
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-2xl border-2 border-emerald-600 bg-emerald-50/20">
                <div className="pt-0.5">
                  <input
                    type="radio"
                    id="payment-cod"
                    name="paymentMethod"
                    checked
                    readOnly
                    className="h-4 w-4 text-emerald-600 border-slate-300 focus:ring-emerald-600 cursor-pointer"
                  />
                </div>
                <label htmlFor="payment-cod" className="space-y-1 cursor-pointer">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                    <span>Thanh toán khi nhận hàng (COD)</span>
                    <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300">
                      Khả dụng
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Bạn sẽ kiểm tra hàng và thanh toán trực tiếp bằng tiền mặt cho nhân viên giao hàng khi nhận được bưu phẩm.
                  </p>
                </label>
              </div>
            </div>
          </div>

          {/* Right Summary Sidebar */}
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-6">
              <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
                Tóm tắt đơn hàng
              </h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Tạm tính ({selectedItems.length} sản phẩm):</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {formatVND(subtotalVnd)}
                  </span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>Phí vận chuyển:</span>
                  <span className="font-semibold text-emerald-600">
                    {!shippingFeeVnd || shippingFeeVnd === '0'
                      ? 'Miễn phí'
                      : formatVND(shippingFeeVnd)}
                  </span>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-between items-baseline">
                  <span className="font-bold text-slate-900 text-base">Tổng thanh toán:</span>
                  <span className="font-extrabold text-xl sm:text-2xl text-emerald-700 tabular-nums">
                    {formatVND(totalVnd)}
                  </span>
                </div>
              </div>

              {/* Delivery Address Quick Peek */}
              {selectedAddressId && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700">
                    <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Giao tới:</span>
                  </div>
                  {(() => {
                    const sel = addresses.find((a) => a.id === selectedAddressId)
                    if (!sel) return null
                    return (
                      <p className="text-slate-600 leading-snug">
                        <strong className="text-slate-900">{sel.recipientName}</strong> ({sel.phone}) - {sel.detailAddress}, {sel.wardName}, {sel.provinceName}
                      </p>
                    )
                  })()}
                </div>
              )}

              {/* Submit Button */}
              <Button
                variant="primary"
                size="lg"
                disabled={isPlacingOrder || !hasSelectedItems || !selectedAddressId}
                isLoading={isPlacingOrder}
                onClick={handlePlaceOrder}
                className="w-full h-13 rounded-2xl font-bold text-base shadow-lg shadow-emerald-600/20 gap-2"
              >
                <span>{isPlacingOrder ? 'Đang xử lý đơn hàng...' : 'Đặt hàng'}</span>
                {!isPlacingOrder && <ArrowRight className="h-5 w-5" />}
              </Button>

              {/* Guarantee badges */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 text-xs text-slate-600 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Bảo đảm sản phẩm chính hãng 100% VNA</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Được đồng kiểm khi nhận hàng</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Address Form Dialog (Create / Edit) */}
      <Dialog open={isAddressDialogOpen} onOpenChange={setIsAddressDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAddress ? 'Chỉnh sửa địa chỉ nhận hàng' : 'Thêm địa chỉ nhận hàng mới'}
            </DialogTitle>
            <DialogDescription>
              Điền thông tin người nhận và địa chỉ giao hàng chính xác để chúng tôi giao hàng đúng hẹn.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveAddress} className="space-y-4 pt-2">
            {/* Recipient Name */}
            <div className="space-y-1.5">
              <Label htmlFor="recipientName" required>
                Họ và tên người nhận
              </Label>
              <Input
                id="recipientName"
                placeholder="VD: Nguyễn Văn A"
                value={addressFormData.recipientName}
                onChange={(e) =>
                  setAddressFormData((prev) => ({ ...prev, recipientName: e.target.value }))
                }
                error={Boolean(addressFormErrors.recipientName)}
              />
              {addressFormErrors.recipientName && (
                <p className="text-xs text-rose-600">{addressFormErrors.recipientName}</p>
              )}
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="phone" required>
                Số điện thoại
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="VD: 0987654321"
                value={addressFormData.phone}
                onChange={(e) =>
                  setAddressFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                error={Boolean(addressFormErrors.phone)}
              />
              {addressFormErrors.phone && (
                <p className="text-xs text-rose-600">{addressFormErrors.phone}</p>
              )}
            </div>

            {/* Cascading Select: Province & Ward */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Province */}
              <div className="space-y-1.5">
                <Label htmlFor="provinceCode" required>
                  Tỉnh / Thành phố
                </Label>
                <Select
                  id="provinceCode"
                  value={addressFormData.provinceCode}
                  onChange={handleProvinceChange}
                  error={Boolean(addressFormErrors.provinceCode)}
                >
                  <option value="">Chọn Tỉnh / Thành phố</option>
                  {provinces.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                {addressFormErrors.provinceCode && (
                  <p className="text-xs text-rose-600">{addressFormErrors.provinceCode}</p>
                )}
              </div>

              {/* Ward */}
              <div className="space-y-1.5">
                <Label htmlFor="wardCode" required>
                  Phường / Xã
                </Label>
                <Select
                  id="wardCode"
                  value={addressFormData.wardCode}
                  onChange={(e) => {
                    const val = e.target.value
                    setAddressFormData((prev) => ({
                      ...prev,
                      wardCode: val ? Number(val) : '',
                    }))
                    setAddressFormErrors((prev) => {
                      const next = { ...prev }
                      delete next.wardCode
                      return next
                    })
                  }}
                  disabled={!addressFormData.provinceCode || wardsLoading}
                  error={Boolean(addressFormErrors.wardCode)}
                >
                  <option value="">
                    {wardsLoading
                      ? 'Đang tải...'
                      : !addressFormData.provinceCode
                      ? 'Chọn tỉnh trước'
                      : 'Chọn Phường / Xã'}
                  </option>
                  {wards.map((w) => (
                    <option key={w.code} value={w.code}>
                      {w.name}
                    </option>
                  ))}
                </Select>
                {addressFormErrors.wardCode && (
                  <p className="text-xs text-rose-600">{addressFormErrors.wardCode}</p>
                )}
              </div>
            </div>

            {/* Detail Address */}
            <div className="space-y-1.5">
              <Label htmlFor="detailAddress" required>
                Địa chỉ chi tiết (Số nhà, tên đường, tòa nhà...)
              </Label>
              <Input
                id="detailAddress"
                placeholder="VD: Số 123 Đường Cầu Giấy"
                value={addressFormData.detailAddress}
                onChange={(e) =>
                  setAddressFormData((prev) => ({ ...prev, detailAddress: e.target.value }))
                }
                error={Boolean(addressFormErrors.detailAddress)}
              />
              {addressFormErrors.detailAddress && (
                <p className="text-xs text-rose-600">{addressFormErrors.detailAddress}</p>
              )}
            </div>

            {/* Set Default Checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="isDefault"
                checked={addressFormData.isDefault}
                onCheckedChange={(checked) =>
                  setAddressFormData((prev) => ({ ...prev, isDefault: Boolean(checked) }))
                }
              />
              <Label htmlFor="isDefault" className="cursor-pointer text-xs font-normal text-slate-700">
                Đặt làm địa chỉ nhận hàng mặc định
              </Label>
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddressDialogOpen(false)}
                disabled={isSavingAddress}
                className="rounded-xl"
              >
                Hủy
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSavingAddress}
                disabled={isSavingAddress}
                className="rounded-xl font-bold"
              >
                {editingAddress ? 'Cập nhật địa chỉ' : 'Lưu địa chỉ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Product Changed Dialog */}
      <Dialog open={productChangedDialogOpen} onOpenChange={setProductChangedDialogOpen}>
        <DialogContent className="max-w-md" hideCloseButton>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mx-auto mb-2">
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
              className="w-full sm:w-auto rounded-xl font-bold gap-1.5"
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
