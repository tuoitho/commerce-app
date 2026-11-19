import { useState, useEffect, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import {
  createAdminFlashSale,
  deleteAdminFlashSale,
  getAdminFlashSale,
  listAdminFlashSales,
  updateAdminFlashSale,
} from '@/api/flashSales'
import { getAdminProductById, getAdminProducts } from '@/api/products'
import {
  ApiError,
  type AdminFlashSaleDetail,
  type AdminFlashSaleSummary,
  type FlashSaleStatus,
  type ProductDetail,
  type SaveFlashSaleInput,
} from '@/api/types'
import { buildCombinationLabel, type OptionGroupItem } from '@/lib/cartesian'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDateTime, formatVND, toDateTimeLocalValue, toRFC3339FromLocal } from '@/lib/utils'

const POSITIVE_INT_PATTERN = /^[1-9]\d*$/

const FLASH_SALE_STATUS_LABELS: Record<FlashSaleStatus, string> = {
  running: 'Đang diễn ra',
  scheduled: 'Sắp diễn ra',
  ended: 'Đã kết thúc',
  inactive: 'Tạm ngưng',
}

const FLASH_SALE_STATUS_CLASSES: Record<FlashSaleStatus, string> = {
  running: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  ended: 'bg-slate-100 text-slate-600 border-slate-200',
  inactive: 'bg-rose-50 text-rose-700 border-rose-200',
}

interface DraftFlashSaleItem {
  productId: string
  variantId: string
  productName: string
  optionLabel: string
  imageUrl: string
  regularPriceVnd: string
  flashPriceVnd: string
  quota: string
  soldQuantity: number
}

function getFlashSaleErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'flash_sale_time_overlap':
        return (
          error.message ||
          'Khung giờ chiến dịch bị trùng với một chiến dịch Flash Sale đang bật khác'
        )
      case 'flash_sale_has_orders':
        return error.message || 'Không thể xóa chiến dịch Flash Sale đã phát sinh lượt mua'
      case 'flash_sale_not_found':
        return error.message || 'Không tìm thấy chiến dịch Flash Sale'
      default:
        if (error.message) return error.message
    }
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function buildOptionGroupsForLabel(detail: ProductDetail): OptionGroupItem[] {
  return (detail.optionGroups || []).map((g) => ({
    id: g.id,
    label: g.label,
    position: g.position,
    values: (g.values || []).map((v) => ({ id: v.id, label: v.label })),
  }))
}

interface FlashSaleFormDialogProps {
  open: boolean
  editingCampaign: AdminFlashSaleDetail | null
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: SaveFlashSaleInput) => Promise<void>
}

function buildInitialItems(campaign: AdminFlashSaleDetail | null): DraftFlashSaleItem[] {
  if (!campaign) return []
  return (campaign.items || []).map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    productName: item.productName,
    optionLabel: item.optionLabel || 'Mặc định',
    imageUrl: item.imageUrl || '',
    regularPriceVnd: item.regularPriceVnd,
    flashPriceVnd: item.flashPriceVnd,
    quota: String(item.quota),
    soldQuantity: item.soldQuantity,
  }))
}

function FlashSaleFormDialog({
  open,
  editingCampaign,
  isPending,
  onOpenChange,
  onSubmit,
}: FlashSaleFormDialogProps) {
  const [name, setName] = useState(() => editingCampaign?.name ?? '')
  const [startsAt, setStartsAt] = useState(() =>
    editingCampaign ? toDateTimeLocalValue(editingCampaign.startsAt) : ''
  )
  const [endsAt, setEndsAt] = useState(() =>
    editingCampaign ? toDateTimeLocalValue(editingCampaign.endsAt) : ''
  )
  const [active, setActive] = useState(() => editingCampaign?.active ?? true)
  const [items, setItems] = useState<DraftFlashSaleItem[]>(() =>
    buildInitialItems(editingCampaign)
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [productQuery, setProductQuery] = useState('')
  const [expandedProduct, setExpandedProduct] = useState<ProductDetail | null>(null)
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null)
  const [pickerError, setPickerError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      if (editingCampaign) {
        setName(editingCampaign.name)
        setStartsAt(toDateTimeLocalValue(editingCampaign.startsAt))
        setEndsAt(toDateTimeLocalValue(editingCampaign.endsAt))
        setActive(editingCampaign.active)
        setItems(
          (editingCampaign.items || []).map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            optionLabel: item.optionLabel || 'Mặc định',
            imageUrl: item.imageUrl || '',
            regularPriceVnd: item.regularPriceVnd,
            flashPriceVnd: item.flashPriceVnd,
            quota: String(item.quota),
            soldQuantity: item.soldQuantity,
          }))
        )
      } else {
        setName('')
        setStartsAt('')
        setEndsAt('')
        setActive(true)
        setItems([])
      }
      setFieldErrors({})
      setSubmitError(null)
      setProductQuery('')
      setExpandedProduct(null)
      setPickerError(null)
    }
  }, [open, editingCampaign])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) {
        onOpenChange(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, isPending, onOpenChange])

  const { data: searchedProducts, isFetching: isSearchingProducts } = useQuery({
    queryKey: ['admin', 'products', 'flash-sale-picker', productQuery],
    queryFn: () => getAdminProducts({ q: productQuery, page: 1, limit: 8 }),
    enabled: open && productQuery.trim().length > 0,
  })

  if (!open) return null

  const handleLoadProductVariants = async (productId: string) => {
    setLoadingProductId(productId)
    setPickerError(null)
    try {
      const detail = await getAdminProductById(productId)
      if (detail.active === false || !(detail.variants ?? []).some((v) => v.active)) {
        setPickerError('Sản phẩm đã ngừng kinh doanh hoặc không có biến thể đang bán.')
        return
      }
      setExpandedProduct(detail)
    } catch {
      setPickerError('Không tải được chi tiết biến thể sản phẩm.')
    } finally {
      setLoadingProductId(null)
    }
  }

  const handleAddVariant = (detail: ProductDetail, variantId: string, optionLabel: string, regularPriceVnd: string) => {
    if (items.some((item) => item.variantId === variantId)) {
      return
    }
    if (items.length >= 50) {
      setPickerError('Mỗi chiến dịch Flash Sale chỉ tối đa 50 biến thể.')
      return
    }
    setItems((prev) => [
      ...prev,
      {
        productId: detail.id,
        variantId,
        productName: detail.name,
        optionLabel,
        imageUrl: detail.imageUrls?.[0] || detail.primaryImageUrl || '',
        regularPriceVnd,
        flashPriceVnd: '',
        quota: '10',
        soldQuantity: 0,
      },
    ])
    setFieldErrors((prev) => ({ ...prev, items: '' }))
  }

  const handleRemoveVariant = (variantId: string) => {
    setItems((prev) => prev.filter((item) => item.variantId !== variantId))
  }

  const handleItemChange = (variantId: string, field: 'flashPriceVnd' | 'quota', value: string) => {
    setItems((prev) =>
      prev.map((item) => (item.variantId === variantId ? { ...item, [field]: value } : item))
    )
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[`variant:${variantId}:${field}`]
      return next
    })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    const errors: Record<string, string> = {}
    const trimmedName = name.trim()
    if (trimmedName.length < 1 || trimmedName.length > 120) {
      errors.name = 'Tên chiến dịch phải từ 1 đến 120 ký tự'
    }

    const startsAtRFC = toRFC3339FromLocal(startsAt)
    const endsAtRFC = toRFC3339FromLocal(endsAt)
    if (!startsAtRFC) {
      errors.startsAt = 'Thời gian bắt đầu không hợp lệ'
    }
    if (!endsAtRFC) {
      errors.endsAt = 'Thời gian kết thúc không hợp lệ'
    } else if (startsAtRFC && new Date(endsAtRFC).getTime() <= new Date(startsAtRFC).getTime()) {
      errors.endsAt = 'Thời gian kết thúc phải sau thời gian bắt đầu'
    }

    if (items.length < 1 || items.length > 50) {
      errors.items = 'Chiến dịch phải có từ 1 đến 50 biến thể'
    }

    items.forEach((item) => {
      const priceStr = item.flashPriceVnd.trim()
      const regularNum = Number(item.regularPriceVnd)
      const flashNum = Number(priceStr)
      if (!POSITIVE_INT_PATTERN.test(priceStr)) {
        errors[`variant:${item.variantId}:flashPriceVnd`] = 'Giá Flash Sale phải là số nguyên dương'
      } else if (!isNaN(regularNum) && flashNum >= regularNum) {
        errors[`variant:${item.variantId}:flashPriceVnd`] =
          'Giá Flash Sale phải nhỏ hơn giá bán thường'
      }

      const quotaStr = item.quota.trim()
      const quotaNum = Number(quotaStr)
      if (!POSITIVE_INT_PATTERN.test(quotaStr) || quotaNum < 1 || quotaNum > 100000) {
        errors[`variant:${item.variantId}:quota`] = 'Số suất phải từ 1 đến 100000'
      } else if (quotaNum < item.soldQuantity) {
        errors[`variant:${item.variantId}:quota`] =
          `Số suất không được nhỏ hơn số đã bán (${item.soldQuantity})`
      }
    })

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    try {
      await onSubmit({
        name: trimmedName,
        startsAt: startsAtRFC!,
        endsAt: endsAtRFC!,
        active,
        items: items.map((item) => ({
          variantId: item.variantId,
          flashPriceVnd: item.flashPriceVnd.trim(),
          quota: Number(item.quota.trim()),
        })),
      })
    } catch (err) {
      if (err instanceof ApiError && err.isValidationError()) {
        const mapped: Record<string, string> = { ...err.fields }
        const ITEM_FIELD_RE = /^items\[(\d+)\]\.(flashPriceVnd|quota|variantId)$/
        for (const [key, msg] of Object.entries(err.fields || {})) {
          const match = ITEM_FIELD_RE.exec(key)
          if (match) {
            const idx = Number(match[1])
            const item = items[idx]
            if (item) {
              mapped[`variant:${item.variantId}:${match[2]}`] = msg
            }
          }
        }
        setFieldErrors(mapped)
        setSubmitError(err.message || 'Dữ liệu chiến dịch không hợp lệ.')
      } else {
        setSubmitError(
          getFlashSaleErrorMessage(err, 'Không thể lưu chiến dịch Flash Sale. Vui lòng thử lại.')
        )
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="flash-sale-dialog-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
        onClick={() => !isPending && onOpenChange(false)}
        aria-hidden="true"
      />

      <div className="relative z-50 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 id="flash-sale-dialog-title" className="text-lg font-bold text-slate-900">
              {editingCampaign ? 'Chỉnh sửa chiến dịch Flash Sale' : 'Tạo chiến dịch Flash Sale'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chiến dịch sẽ tự động kích hoạt khi đến khung giờ bắt đầu và kết thúc đúng hạn.
            </p>
          </div>
          <button
            type="button"
            aria-label="Đóng hộp thoại"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="mt-5 space-y-5">
          {submitError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="fs-name" required>
              Tên chiến dịch
            </Label>
            <Input
              id="fs-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setFieldErrors((prev) => ({ ...prev, name: '' }))
              }}
              placeholder="VD: Deal Chớp Nhoáng 12H"
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name && <p className="text-xs text-rose-600">{fieldErrors.name}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fs-starts-at" required>
                Thời gian bắt đầu
              </Label>
              <Input
                id="fs-starts-at"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => {
                  setStartsAt(e.target.value)
                  setFieldErrors((prev) => ({ ...prev, startsAt: '' }))
                }}
                aria-invalid={Boolean(fieldErrors.startsAt)}
              />
              {fieldErrors.startsAt && (
                <p className="text-xs text-rose-600">{fieldErrors.startsAt}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fs-ends-at" required>
                Thời gian kết thúc
              </Label>
              <Input
                id="fs-ends-at"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => {
                  setEndsAt(e.target.value)
                  setFieldErrors((prev) => ({ ...prev, endsAt: '' }))
                }}
                aria-invalid={Boolean(fieldErrors.endsAt)}
              />
              {fieldErrors.endsAt && <p className="text-xs text-rose-600">{fieldErrors.endsAt}</p>}
            </div>
          </div>

          <div>
            <Switch
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              label="Kích hoạt chiến dịch (chỉ một chiến dịch được bật trong cùng khung giờ)"
            />
          </div>

          {/* Product & Variant Picker */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="fs-product-search">Bộ chọn sản phẩm & biến thể</Label>
              <span className="text-xs text-slate-500">Đã chọn {items.length} / 50 biến thể</span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                id="fs-product-search"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Tìm sản phẩm để thêm biến thể..."
                className="pl-9 pr-9 bg-white"
              />
              {isSearchingProducts && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
              )}
            </div>

            {pickerError && <p className="text-xs text-rose-600">{pickerError}</p>}

            {productQuery.trim() && searchedProducts && (
              <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                {searchedProducts.data.length === 0 ? (
                  <li className="px-3 py-3 text-center text-xs text-slate-500">
                    Không tìm thấy sản phẩm phù hợp
                  </li>
                ) : (
                  searchedProducts.data.map((product) => (
                    <li key={product.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {product.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {product.brand} • Từ {formatVND(product.minPriceVnd)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`Chọn biến thể ${product.name}`}
                        disabled={loadingProductId === product.id}
                        onClick={() => void handleLoadProductVariants(product.id)}
                      >
                        {loadingProductId === product.id ? 'Đang tải...' : 'Chọn biến thể'}
                      </Button>
                    </li>
                  ))
                )}
              </ul>
            )}

            {expandedProduct && (
              <div className="rounded-xl border border-blue-200 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">
                    Biến thể của {expandedProduct.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedProduct(null)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Đóng
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {(() => {
                    const groups = buildOptionGroupsForLabel(expandedProduct)
                    return (expandedProduct.variants || [])
                      .filter((v) => v.active)
                      .map((v) => {
                        const label =
                          buildCombinationLabel(v.optionValueIds, groups) || 'Phiên bản mặc định'
                        const regularPrice = v.priceVnd ?? v.priceVND ?? expandedProduct.price
                        const alreadyAdded = items.some((it) => it.variantId === v.id)
                        return (
                          <div
                            key={v.id}
                            className="flex items-center justify-between gap-2 py-2 text-xs"
                          >
                            <div>
                              <span className="font-medium text-slate-800">{label}</span>
                              <span className="ml-2 text-slate-500">
                                Giá gốc: {formatVND(regularPrice)}
                              </span>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant={alreadyAdded ? 'secondary' : 'primary'}
                              disabled={alreadyAdded}
                              aria-label={`Thêm biến thể ${label}`}
                              onClick={() =>
                                handleAddVariant(expandedProduct, v.id, label, regularPrice)
                              }
                            >
                              {alreadyAdded ? 'Đã thêm' : 'Thêm'}
                            </Button>
                          </div>
                        )
                      })
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Selected Variant Items Table */}
          <div className="space-y-2">
            <Label required>Danh sách biến thể Flash Sale</Label>
            {fieldErrors.items && <p className="text-xs text-rose-600">{fieldErrors.items}</p>}

            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                Chưa có biến thể nào. Hãy tìm sản phẩm ở trên và chọn biến thể để thêm vào chiến dịch.
              </div>
            ) : (
              <div className="space-y-2.5">
                {items.map((item) => {
                  const priceErr = fieldErrors[`variant:${item.variantId}:flashPriceVnd`]
                  const quotaErr = fieldErrors[`variant:${item.variantId}:quota`]
                  const regularNum = Number(item.regularPriceVnd)
                  const flashNum = Number(item.flashPriceVnd)
                  const discountPct =
                    regularNum > 0 && flashNum > 0 && flashNum < regularNum
                      ? Math.round(((regularNum - flashNum) / regularNum) * 100)
                      : null

                  return (
                    <div
                      key={item.variantId}
                      className="rounded-xl border border-slate-200 bg-white p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {item.productName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.optionLabel} • Giá thường:{' '}
                            <span className="font-medium text-slate-700">
                              {formatVND(item.regularPriceVnd)}
                            </span>
                            {item.soldQuantity > 0 && (
                              <span className="ml-2 text-blue-700 font-medium">
                                • Đã bán: {item.soldQuantity}
                              </span>
                            )}
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          disabled={item.soldQuantity > 0}
                          title={
                            item.soldQuantity > 0
                              ? 'Không thể xóa biến thể đã phát sinh lượt mua'
                              : 'Xóa biến thể'
                          }
                          aria-label={`Xóa biến thể ${item.optionLabel}`}
                          onClick={() => handleRemoveVariant(item.variantId)}
                        >
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label
                              htmlFor={`fs-price-${item.variantId}`}
                              className="text-xs font-medium text-slate-700"
                            >
                              Giá Flash Sale (VNĐ)
                            </label>
                            {discountPct !== null && (
                              <span className="text-[11px] font-semibold text-emerald-700">
                                Giảm {discountPct}%
                              </span>
                            )}
                          </div>
                          <Input
                            id={`fs-price-${item.variantId}`}
                            aria-label={`Giá Flash Sale ${item.optionLabel}`}
                            type="number"
                            min={1}
                            value={item.flashPriceVnd}
                            onChange={(e) =>
                              handleItemChange(item.variantId, 'flashPriceVnd', e.target.value)
                            }
                            placeholder="VD: 25990000"
                            aria-invalid={Boolean(priceErr)}
                          />
                          {priceErr && <p className="text-xs text-rose-600">{priceErr}</p>}
                        </div>

                        <div className="space-y-1">
                          <label
                            htmlFor={`fs-quota-${item.variantId}`}
                            className="text-xs font-medium text-slate-700"
                          >
                            Số suất Flash Sale
                          </label>
                          <Input
                            id={`fs-quota-${item.variantId}`}
                            aria-label={`Số suất ${item.optionLabel}`}
                            type="number"
                            min={Math.max(1, item.soldQuantity)}
                            max={100000}
                            value={item.quota}
                            onChange={(e) =>
                              handleItemChange(item.variantId, 'quota', e.target.value)
                            }
                            placeholder="VD: 20"
                            aria-invalid={Boolean(quotaErr)}
                          />
                          {quotaErr && <p className="text-xs text-rose-600">{quotaErr}</p>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" variant="primary" isLoading={isPending}>
              Lưu chiến dịch
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function FlashSalesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const statusParam = searchParams.get('status') || ''
  const pageParam = parseInt(searchParams.get('page') || '1', 10)
  const currentPage = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
  const limit = 20

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<AdminFlashSaleDetail | null>(null)
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminFlashSaleSummary | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'flash-sales', { status: statusParam, page: currentPage, limit }],
    queryFn: () =>
      listAdminFlashSales({
        status: statusParam && statusParam !== 'all' ? statusParam : undefined,
        page: currentPage,
        limit,
      }),
  })

  const campaigns = data?.data || []
  const pagination = data?.meta?.pagination || {
    page: currentPage,
    limit,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  }

  const invalidateFlashSales = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'flash-sales'] })
  }

  const createMutation = useMutation({
    mutationFn: (input: SaveFlashSaleInput) => createAdminFlashSale(input),
    onSuccess: (created) => {
      setIsFormOpen(false)
      setEditingCampaign(null)
      setMessage(`Đã tạo chiến dịch Flash Sale "${created.name}" thành công.`)
      setErrorMessage(null)
      invalidateFlashSales()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: SaveFlashSaleInput }) =>
      updateAdminFlashSale(id, input),
    onSuccess: (updated) => {
      setIsFormOpen(false)
      setEditingCampaign(null)
      setMessage(`Đã cập nhật chiến dịch "${updated.name}" thành công.`)
      setErrorMessage(null)
      invalidateFlashSales()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminFlashSale(id),
    onSuccess: () => {
      const name = deleteTarget?.name
      setDeleteTarget(null)
      setMessage(name ? `Đã xóa chiến dịch "${name}".` : 'Đã xóa chiến dịch Flash Sale.')
      setErrorMessage(null)
      invalidateFlashSales()
    },
    onError: (err) => {
      setDeleteTarget(null)
      setErrorMessage(getFlashSaleErrorMessage(err, 'Không thể xóa chiến dịch Flash Sale.'))
    },
  })

  const handleOpenEdit = async (summary: AdminFlashSaleSummary) => {
    setLoadingDetailId(summary.id)
    setErrorMessage(null)
    try {
      const detail = await getAdminFlashSale(summary.id)
      setEditingCampaign(detail)
      setIsFormOpen(true)
    } catch (err) {
      setErrorMessage(getFlashSaleErrorMessage(err, 'Không thể tải chi tiết chiến dịch Flash Sale.'))
    } finally {
      setLoadingDetailId(null)
    }
  }

  const handleStatusChange = (nextStatus: string) => {
    const nextParams = new URLSearchParams(searchParams)
    if (nextStatus && nextStatus !== 'all') {
      nextParams.set('status', nextStatus)
    } else {
      nextParams.delete('status')
    }
    nextParams.set('page', '1')
    setSearchParams(nextParams)
  }

  const handlePageChange = (newPage: number) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('page', String(newPage))
    setSearchParams(nextParams)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Chiến dịch Flash Sale
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Lên lịch khung giờ khuyến mãi tự động và giới hạn số suất theo từng biến thể sản phẩm.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            setEditingCampaign(null)
            setErrorMessage(null)
            setIsFormOpen(true)
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Tạo chiến dịch
        </Button>
      </div>

      {/* Notifications */}
      {message && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {message}
          </span>
          <button type="button" aria-label="Đóng thông báo" onClick={() => setMessage(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {errorMessage}
          </span>
          <button type="button" aria-label="Đóng thông báo lỗi" onClick={() => setErrorMessage(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <label htmlFor="fs-status-filter" className="text-sm font-medium text-slate-700">
              Trạng thái:
            </label>
            <Select
              id="fs-status-filter"
              aria-label="Lọc theo trạng thái"
              value={statusParam || 'all'}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-52"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="running">Đang diễn ra</option>
              <option value="scheduled">Sắp diễn ra</option>
              <option value="ended">Đã kết thúc</option>
              <option value="inactive">Tạm ngưng</option>
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Làm mới"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin text-blue-600' : ''}`} />
            Làm mới
          </Button>
        </CardContent>
      </Card>

      {/* Main Table */}
      {isError ? (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-3" />
            <p className="font-semibold text-rose-900">Không thể tải danh sách Flash Sale</p>
            <p className="text-sm text-rose-600 mt-1">
              {error instanceof Error ? error.message : 'Vui lòng thử lại sau.'}
            </p>
            <Button variant="outline" onClick={() => refetch()} className="mt-4">
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="rounded-2xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên chiến dịch</TableHead>
                  <TableHead>Khung giờ</TableHead>
                  <TableHead>Biến thể</TableHead>
                  <TableHead>Tiến độ bán</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-10 text-center text-sm text-slate-500">
                      <RefreshCw className="h-5 w-5 animate-spin text-blue-600 mx-auto mb-2" />
                      Đang tải chiến dịch Flash Sale...
                    </TableCell>
                  </TableRow>
                ) : campaigns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-12 text-center">
                      <Zap className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                      <p className="font-semibold text-slate-800">Chưa có chiến dịch Flash Sale nào</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Tạo chiến dịch mới để mở ưu đãi tự động theo khung giờ.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  campaigns.map((fs) => (
                    <TableRow key={fs.id}>
                      <TableCell className="font-semibold text-slate-900">{fs.name}</TableCell>
                      <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                        <div>Bắt đầu: {formatDateTime(fs.startsAt)}</div>
                        <div>Kết thúc: {formatDateTime(fs.endsAt)}</div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-700 whitespace-nowrap">
                        {fs.variantCount} biến thể
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-800 whitespace-nowrap">
                        {fs.totalSold} / {fs.totalQuota} suất
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            FLASH_SALE_STATUS_CLASSES[fs.status] || 'bg-slate-100 text-slate-700'
                          }
                        >
                          {FLASH_SALE_STATUS_LABELS[fs.status] || fs.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="iconSm"
                            aria-label={`Sửa ${fs.name}`}
                            disabled={loadingDetailId === fs.id}
                            onClick={() => void handleOpenEdit(fs)}
                          >
                            {loadingDetailId === fs.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Pencil className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="iconSm"
                            aria-label={`Xóa ${fs.name}`}
                            onClick={() => {
                              setDeleteTarget(fs)
                              setErrorMessage(null)
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {pagination.total > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                Tổng <span className="font-medium text-slate-700">{pagination.total}</span> chiến dịch
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!pagination.hasPrev || currentPage <= 1}
                  className="gap-1 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Trước
                </Button>
                <span className="text-xs font-medium text-slate-600 px-2">
                  Trang {pagination.page} / {Math.max(pagination.totalPages, 1)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!pagination.hasNext || currentPage >= pagination.totalPages}
                  className="gap-1 text-xs"
                >
                  Sau
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Create / Edit Modal */}
      {isFormOpen && (
        <FlashSaleFormDialog
          key={editingCampaign?.id ?? 'create'}
          open={isFormOpen}
          editingCampaign={editingCampaign}
          isPending={createMutation.isPending || updateMutation.isPending}
          onOpenChange={(open) => {
            setIsFormOpen(open)
            if (!open) setEditingCampaign(null)
          }}
          onSubmit={async (input) => {
            if (editingCampaign) {
              await updateMutation.mutateAsync({ id: editingCampaign.id, input })
            } else {
              await createMutation.mutateAsync(input)
            }
          }}
        />
      )}

      {/* Delete Confirm Dialog */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa chiến dịch Flash Sale</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa chiến dịch <strong>{deleteTarget?.name}</strong> không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              isLoading={deleteMutation.isPending}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
