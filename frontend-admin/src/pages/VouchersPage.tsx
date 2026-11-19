import { useState, useEffect, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Ticket,
  Trash2,
  X,
} from 'lucide-react'
import {
  createAdminVoucher,
  deleteAdminVoucher,
  listAdminVouchers,
  updateAdminVoucher,
} from '@/api/vouchers'
import { getAdminCategories } from '@/api/categories'
import { getAdminProducts } from '@/api/products'
import {
  ApiError,
  type AdminVoucher,
  type SaveVoucherInput,
  type VoucherEffectiveStatus,
  type VoucherScopeType,
  type VoucherType,
} from '@/api/types'
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
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime, formatVND, toDateTimeLocalValue, toRFC3339FromLocal } from '@/lib/utils'

const VOUCHER_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/
const POSITIVE_INT_PATTERN = /^[1-9]\d*$/
const NON_NEGATIVE_INT_PATTERN = /^(0|[1-9]\d*)$/

const STATUS_LABELS: Record<VoucherEffectiveStatus, string> = {
  active: 'Đang hoạt động',
  scheduled: 'Sắp diễn ra',
  exhausted: 'Hết lượt',
  expired: 'Hết hạn',
  inactive: 'Tạm ngưng',
}

const STATUS_BADGE_CLASSES: Record<VoucherEffectiveStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  exhausted: 'bg-amber-50 text-amber-800 border-amber-200',
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
  inactive: 'bg-rose-50 text-rose-700 border-rose-200',
}

const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  percent: 'Giảm theo %',
  fixed_amount: 'Giảm tiền mặt',
  freeship: 'Miễn phí vận chuyển',
}

function getVoucherConflictMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'voucher_code_in_use':
        return error.message || 'Mã giảm giá này đã tồn tại'
      case 'voucher_immutable_fields':
        return error.message || 'Không thể thay đổi mã hoặc loại giảm giá sau khi đã có lượt sử dụng'
      case 'voucher_usage_limit_too_low':
        return error.message || 'Giới hạn tổng lượt dùng không được nhỏ hơn số lượt đã sử dụng'
      case 'voucher_in_use':
        return error.message || 'Không thể xóa mã giảm giá đã có đơn hàng sử dụng'
      case 'voucher_not_found':
        return error.message || 'Mã giảm giá không tồn tại'
      default:
        if (error.message) return error.message
    }
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function formatDiscountSummary(voucher: AdminVoucher): string {
  if (voucher.voucherType === 'percent') {
    const cap = voucher.maxDiscountVnd ? ` (tối đa ${formatVND(voucher.maxDiscountVnd)})` : ''
    return `Giảm ${voucher.discountValue}%${cap}`
  }
  if (voucher.voucherType === 'freeship') {
    const cap = voucher.maxDiscountVnd ? `tối đa ${formatVND(voucher.maxDiscountVnd)}` : 'toàn bộ phí'
    return `Freeship (${cap})`
  }
  return `Giảm ${formatVND(voucher.discountValue)}`
}

function formatScopeSummary(voucher: AdminVoucher): string {
  const scopeType = voucher.scopeType || 'all'
  if (scopeType === 'categories') {
    const names = (voucher.scopeCategories || []).map((c) => c.name)
    if (names.length === 0) return 'Theo danh mục'
    return names.length <= 2
      ? `Danh mục: ${names.join(', ')}`
      : `Danh mục: ${names.slice(0, 2).join(', ')} (+${names.length - 2})`
  }
  if (scopeType === 'products') {
    const names = (voucher.scopeProducts || []).map((p) => p.name)
    if (names.length === 0) return 'Theo sản phẩm'
    return names.length <= 2
      ? `Sản phẩm: ${names.join(', ')}`
      : `Sản phẩm: ${names.slice(0, 2).join(', ')} (+${names.length - 2})`
  }
  return 'Toàn sàn'
}

interface VoucherFormState {
  code: string
  title: string
  description: string
  voucherType: VoucherType
  scopeType: VoucherScopeType
  categoryIds: string[]
  productIds: string[]
  discountValue: string
  maxDiscountVnd: string
  minOrderVnd: string
  usageLimit: string
  perUserLimit: string
  startsAt: string
  endsAt: string
  active: boolean
}

function buildInitialFormState(voucher: AdminVoucher | null): VoucherFormState {
  if (!voucher) {
    return {
      code: '',
      title: '',
      description: '',
      voucherType: 'percent',
      scopeType: 'all',
      categoryIds: [],
      productIds: [],
      discountValue: '',
      maxDiscountVnd: '',
      minOrderVnd: '0',
      usageLimit: '',
      perUserLimit: '1',
      startsAt: '',
      endsAt: '',
      active: true,
    }
  }
  return {
    code: voucher.code,
    title: voucher.title,
    description: voucher.description || '',
    voucherType: voucher.voucherType,
    scopeType: voucher.scopeType || 'all',
    categoryIds: (voucher.scopeCategories || []).map((c) => c.id),
    productIds: (voucher.scopeProducts || []).map((p) => p.id),
    discountValue: voucher.voucherType === 'freeship' ? '0' : voucher.discountValue,
    maxDiscountVnd: voucher.voucherType === 'fixed_amount' ? '' : voucher.maxDiscountVnd || '',
    minOrderVnd: voucher.minOrderVnd || '0',
    usageLimit: voucher.usageLimit !== null ? String(voucher.usageLimit) : '',
    perUserLimit: String(voucher.perUserLimit || 1),
    startsAt: toDateTimeLocalValue(voucher.startsAt),
    endsAt: toDateTimeLocalValue(voucher.endsAt),
    active: voucher.active,
  }
}

interface VoucherFormDialogProps {
  open: boolean
  editingVoucher: AdminVoucher | null
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: SaveVoucherInput) => Promise<void>
}

function VoucherFormDialog({
  open,
  editingVoucher,
  isPending,
  onOpenChange,
  onSubmit,
}: VoucherFormDialogProps) {
  const [form, setForm] = useState<VoucherFormState>(() => buildInitialFormState(editingVoucher))
  const [productSearch, setProductSearch] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['admin', 'categories', 'voucher-scope'],
    queryFn: () => getAdminCategories(),
    enabled: open && form.scopeType === 'categories',
  })

  const { data: productsRes, isLoading: productsLoading } = useQuery({
    queryKey: ['admin', 'products', 'voucher-scope', productSearch.trim()],
    queryFn: () =>
      getAdminProducts({
        q: productSearch.trim() || undefined,
        page: 1,
        limit: 100,
      }),
    enabled: open && form.scopeType === 'products',
  })
  const products = productsRes?.data || []

  useEffect(() => {
    if (open) {
      setForm(buildInitialFormState(editingVoucher))
      setProductSearch('')
      setFieldErrors({})
      setSubmitError(null)
    }
  }, [open, editingVoucher])

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

  if (!open) return null

  const handleVoucherTypeChange = (nextType: VoucherType) => {
    setForm((prev) => ({
      ...prev,
      voucherType: nextType,
      discountValue: nextType === 'freeship' ? '0' : prev.voucherType === 'freeship' ? '' : prev.discountValue,
      maxDiscountVnd: nextType === 'fixed_amount' ? '' : prev.maxDiscountVnd,
    }))
    setFieldErrors((prev) => ({
      ...prev,
      voucherType: '',
      discountValue: '',
      maxDiscountVnd: '',
    }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    const errors: Record<string, string> = {}
    const normalizedCode = form.code.trim().toUpperCase()
    const trimmedTitle = form.title.trim()
    const trimmedDescription = form.description.trim()

    if (!VOUCHER_CODE_PATTERN.test(normalizedCode)) {
      errors.code = 'Mã giảm giá phải gồm 3–32 ký tự chữ hoa, số, dấu gạch dưới hoặc gạch ngang'
    }
    if (trimmedTitle.length < 1 || trimmedTitle.length > 120) {
      errors.title = 'Tiêu đề phải từ 1 đến 120 ký tự'
    }
    if (trimmedDescription.length > 500) {
      errors.description = 'Mô tả không được vượt quá 500 ký tự'
    }

    const discountTrimmed = form.voucherType === 'freeship' ? '0' : form.discountValue.trim()
    if (form.voucherType === 'percent') {
      const pct = Number(discountTrimmed)
      if (!POSITIVE_INT_PATTERN.test(discountTrimmed) || pct < 1 || pct > 100) {
        errors.discountValue = 'Phần trăm giảm phải là số nguyên từ 1 đến 100'
      }
    } else if (form.voucherType === 'fixed_amount') {
      if (!POSITIVE_INT_PATTERN.test(discountTrimmed)) {
        errors.discountValue = 'Số tiền giảm phải là số nguyên dương'
      }
    }

    let maxDiscountVnd: string | null = null
    if (form.voucherType !== 'fixed_amount') {
      const maxTrimmed = form.maxDiscountVnd.trim()
      if (maxTrimmed !== '') {
        if (!POSITIVE_INT_PATTERN.test(maxTrimmed)) {
          errors.maxDiscountVnd = 'Mức giảm tối đa phải là số nguyên dương'
        } else {
          maxDiscountVnd = maxTrimmed
        }
      }
    }

    const minOrderTrimmed = form.minOrderVnd.trim() || '0'
    if (!NON_NEGATIVE_INT_PATTERN.test(minOrderTrimmed)) {
      errors.minOrderVnd = 'Giá trị đơn tối thiểu không hợp lệ'
    }

    let usageLimit: number | null = null
    const usageLimitTrimmed = form.usageLimit.trim()
    if (usageLimitTrimmed !== '') {
      const parsedLimit = Number(usageLimitTrimmed)
      if (!POSITIVE_INT_PATTERN.test(usageLimitTrimmed) || parsedLimit < 1) {
        errors.usageLimit = 'Giới hạn tổng lượt dùng phải từ 1 trở lên'
      } else {
        usageLimit = parsedLimit
      }
    }

    const perUserTrimmed = form.perUserLimit.trim()
    const perUserLimit = Number(perUserTrimmed)
    if (!POSITIVE_INT_PATTERN.test(perUserTrimmed) || perUserLimit < 1) {
      errors.perUserLimit = 'Giới hạn lượt dùng mỗi khách phải từ 1 trở lên'
    }

    const startsAtRFC = toRFC3339FromLocal(form.startsAt)
    const endsAtRFC = toRFC3339FromLocal(form.endsAt)
    if (!startsAtRFC) {
      errors.startsAt = 'Thời gian bắt đầu không hợp lệ'
    }
    if (!endsAtRFC) {
      errors.endsAt = 'Thời gian kết thúc không hợp lệ'
    } else if (startsAtRFC && new Date(endsAtRFC).getTime() <= new Date(startsAtRFC).getTime()) {
      errors.endsAt = 'Thời gian kết thúc phải sau thời gian bắt đầu'
    }

    if (form.scopeType === 'categories' && form.categoryIds.length === 0) {
      errors.categoryIds = 'Vui lòng chọn ít nhất một danh mục áp dụng'
    }
    if (form.scopeType === 'products' && form.productIds.length === 0) {
      errors.productIds = 'Vui lòng chọn ít nhất một sản phẩm áp dụng'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    try {
      await onSubmit({
        code: normalizedCode,
        title: trimmedTitle,
        description: trimmedDescription,
        voucherType: form.voucherType,
        scopeType: form.scopeType,
        categoryIds: form.scopeType === 'categories' ? form.categoryIds : [],
        productIds: form.scopeType === 'products' ? form.productIds : [],
        discountValue: discountTrimmed,
        maxDiscountVnd: form.voucherType === 'fixed_amount' ? null : maxDiscountVnd,
        minOrderVnd: minOrderTrimmed,
        usageLimit,
        perUserLimit,
        startsAt: startsAtRFC!,
        endsAt: endsAtRFC!,
        active: form.active,
      })
    } catch (err) {
      if (err instanceof ApiError && err.isValidationError()) {
        setFieldErrors(err.fields || {})
        setSubmitError(err.message || 'Dữ liệu không hợp lệ')
      } else {
        setSubmitError(getVoucherConflictMessage(err, 'Không thể lưu mã giảm giá. Vui lòng thử lại.'))
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voucher-dialog-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
        onClick={() => !isPending && onOpenChange(false)}
        aria-hidden="true"
      />
      <div className="relative z-50 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 id="voucher-dialog-title" className="text-lg font-bold text-slate-900">
              {editingVoucher ? `Chỉnh sửa mã ${editingVoucher.code}` : 'Tạo mã giảm giá'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cấu hình điều kiện áp dụng, mức giảm giá và thời gian hiệu lực của voucher.
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

        <form noValidate onSubmit={handleSubmit} className="mt-5 space-y-4">
          {editingVoucher && editingVoucher.usedCount > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              Mã đã phát sinh <strong>{editingVoucher.usedCount}</strong> lượt sử dụng: không thể thay đổi{' '}
              <strong>mã</strong>, <strong>loại giảm giá</strong> hoặc đặt giới hạn thấp hơn số lượt đã dùng.
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="voucher-code" required>
                Mã giảm giá
              </Label>
              <Input
                id="voucher-code"
                value={form.code}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                  setFieldErrors((prev) => ({ ...prev, code: '' }))
                }}
                placeholder="VD: AURA500K"
                className="font-mono uppercase"
                aria-invalid={Boolean(fieldErrors.code)}
              />
              {fieldErrors.code && <p className="text-xs text-rose-600">{fieldErrors.code}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="voucher-type" required>
                Loại giảm giá
              </Label>
              <Select
                id="voucher-type"
                value={form.voucherType}
                onChange={(e) => handleVoucherTypeChange(e.target.value as VoucherType)}
                aria-invalid={Boolean(fieldErrors.voucherType)}
              >
                <option value="percent">Giảm theo phần trăm (%)</option>
                <option value="fixed_amount">Giảm tiền mặt cố định (VNĐ)</option>
                <option value="freeship">Miễn phí vận chuyển (Freeship)</option>
              </Select>
              {fieldErrors.voucherType && (
                <p className="text-xs text-rose-600">{fieldErrors.voucherType}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="voucher-title" required>
              Tiêu đề
            </Label>
            <Input
              id="voucher-title"
              value={form.title}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, title: e.target.value }))
                setFieldErrors((prev) => ({ ...prev, title: '' }))
              }}
              placeholder="VD: Giảm 10% tối đa 1 triệu cho đơn từ 5 triệu"
              aria-invalid={Boolean(fieldErrors.title)}
            />
            {fieldErrors.title && <p className="text-xs text-rose-600">{fieldErrors.title}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="voucher-description">Mô tả</Label>
            <Textarea
              id="voucher-description"
              value={form.description}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, description: e.target.value }))
                setFieldErrors((prev) => ({ ...prev, description: '' }))
              }}
              rows={2}
              placeholder="Mô tả điều kiện áp dụng (tối đa 500 ký tự)..."
              aria-invalid={Boolean(fieldErrors.description)}
            />
            {fieldErrors.description && (
              <p className="text-xs text-rose-600">{fieldErrors.description}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {form.voucherType === 'freeship' ? (
              <div className="space-y-1.5">
                <Label>Giá trị giảm</Label>
                <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600">
                  0 ₫ (Giảm trực tiếp trên phí vận chuyển)
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="voucher-discount-value" required>
                  {form.voucherType === 'percent' ? 'Giá trị giảm (%)' : 'Giá trị giảm (VNĐ)'}
                </Label>
                <Input
                  id="voucher-discount-value"
                  type="number"
                  min={1}
                  max={form.voucherType === 'percent' ? 100 : undefined}
                  value={form.discountValue}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, discountValue: e.target.value }))
                    setFieldErrors((prev) => ({ ...prev, discountValue: '' }))
                  }}
                  placeholder={form.voucherType === 'percent' ? '10' : '500000'}
                  aria-invalid={Boolean(fieldErrors.discountValue)}
                />
                {fieldErrors.discountValue && (
                  <p className="text-xs text-rose-600">{fieldErrors.discountValue}</p>
                )}
              </div>
            )}

            {form.voucherType !== 'fixed_amount' && (
              <div className="space-y-1.5">
                <Label htmlFor="voucher-max-discount">Giảm tối đa (VNĐ)</Label>
                <Input
                  id="voucher-max-discount"
                  type="number"
                  min={1}
                  value={form.maxDiscountVnd}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, maxDiscountVnd: e.target.value }))
                    setFieldErrors((prev) => ({ ...prev, maxDiscountVnd: '' }))
                  }}
                  placeholder="Để trống nếu không giới hạn"
                  aria-invalid={Boolean(fieldErrors.maxDiscountVnd)}
                />
                {fieldErrors.maxDiscountVnd && (
                  <p className="text-xs text-rose-600">{fieldErrors.maxDiscountVnd}</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="voucher-min-order" required>
                Đơn tối thiểu (VNĐ)
              </Label>
              <Input
                id="voucher-min-order"
                type="number"
                min={0}
                value={form.minOrderVnd}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, minOrderVnd: e.target.value }))
                  setFieldErrors((prev) => ({ ...prev, minOrderVnd: '' }))
                }}
                placeholder="0"
                aria-invalid={Boolean(fieldErrors.minOrderVnd)}
              />
              {fieldErrors.minOrderVnd && (
                <p className="text-xs text-rose-600">{fieldErrors.minOrderVnd}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="voucher-usage-limit">Giới hạn tổng lượt dùng</Label>
              <Input
                id="voucher-usage-limit"
                type="number"
                min={1}
                value={form.usageLimit}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, usageLimit: e.target.value }))
                  setFieldErrors((prev) => ({ ...prev, usageLimit: '' }))
                }}
                placeholder="Để trống nếu không giới hạn"
                aria-invalid={Boolean(fieldErrors.usageLimit)}
              />
              {fieldErrors.usageLimit && (
                <p className="text-xs text-rose-600">{fieldErrors.usageLimit}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="voucher-per-user-limit" required>
                Giới hạn mỗi khách
              </Label>
              <Input
                id="voucher-per-user-limit"
                type="number"
                min={1}
                value={form.perUserLimit}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, perUserLimit: e.target.value }))
                  setFieldErrors((prev) => ({ ...prev, perUserLimit: '' }))
                }}
                aria-invalid={Boolean(fieldErrors.perUserLimit)}
              />
              {fieldErrors.perUserLimit && (
                <p className="text-xs text-rose-600">{fieldErrors.perUserLimit}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="voucher-starts-at" required>
                Thời gian bắt đầu
              </Label>
              <Input
                id="voucher-starts-at"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, startsAt: e.target.value }))
                  setFieldErrors((prev) => ({ ...prev, startsAt: '' }))
                }}
                aria-invalid={Boolean(fieldErrors.startsAt)}
              />
              {fieldErrors.startsAt && (
                <p className="text-xs text-rose-600">{fieldErrors.startsAt}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="voucher-ends-at" required>
                Thời gian kết thúc
              </Label>
              <Input
                id="voucher-ends-at"
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, endsAt: e.target.value }))
                  setFieldErrors((prev) => ({ ...prev, endsAt: '' }))
                }}
                aria-invalid={Boolean(fieldErrors.endsAt)}
              />
              {fieldErrors.endsAt && (
                <p className="text-xs text-rose-600">{fieldErrors.endsAt}</p>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="voucher-scope-type">Phạm vi áp dụng</Label>
              <Select
                id="voucher-scope-type"
                value={form.scopeType}
                onChange={(e) => {
                  const nextScope = e.target.value as VoucherScopeType
                  setForm((prev) => ({
                    ...prev,
                    scopeType: nextScope,
                    categoryIds: nextScope === 'categories' ? prev.categoryIds : [],
                    productIds: nextScope === 'products' ? prev.productIds : [],
                  }))
                  setFieldErrors((prev) => ({ ...prev, scopeType: '', categoryIds: '', productIds: '' }))
                }}
              >
                <option value="all">Toàn sàn (tất cả sản phẩm)</option>
                <option value="categories">Chỉ áp dụng cho danh mục đã chọn</option>
                <option value="products">Chỉ áp dụng cho sản phẩm đã chọn</option>
              </Select>
            </div>

            {form.scopeType === 'categories' && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs text-slate-600">
                  Đã chọn {form.categoryIds.length} danh mục
                </p>
                {categoriesLoading ? (
                  <p className="text-xs text-slate-500">Đang tải danh mục...</p>
                ) : categories.length === 0 ? (
                  <p className="text-xs text-slate-500">Chưa có danh mục nào.</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 space-y-1">
                    {categories.map((cat) => {
                      const checked = form.categoryIds.includes(cat.id)
                      return (
                        <label
                          key={cat.id}
                          className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setForm((prev) => ({
                                ...prev,
                                categoryIds: e.target.checked
                                  ? [...prev.categoryIds, cat.id]
                                  : prev.categoryIds.filter((id) => id !== cat.id),
                              }))
                              setFieldErrors((prev) => ({ ...prev, categoryIds: '' }))
                            }}
                          />
                          <span>{cat.name}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
                {fieldErrors.categoryIds && (
                  <p className="text-xs text-rose-600">{fieldErrors.categoryIds}</p>
                )}
              </div>
            )}

            {form.scopeType === 'products' && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-600">
                    Đã chọn {form.productIds.length} sản phẩm
                  </p>
                  <Input
                    type="search"
                    aria-label="Tìm sản phẩm áp dụng"
                    placeholder="Tìm tên sản phẩm..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="h-8 max-w-xs text-xs"
                  />
                </div>
                {productsLoading ? (
                  <p className="text-xs text-slate-500">Đang tải sản phẩm...</p>
                ) : products.length === 0 ? (
                  <p className="text-xs text-slate-500">Không tìm thấy sản phẩm phù hợp.</p>
                ) : (
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 space-y-1">
                    {products.map((prod) => {
                      const checked = form.productIds.includes(prod.id)
                      return (
                        <label
                          key={prod.id}
                          className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setForm((prev) => ({
                                ...prev,
                                productIds: e.target.checked
                                  ? [...prev.productIds, prod.id]
                                  : prev.productIds.filter((id) => id !== prod.id),
                              }))
                              setFieldErrors((prev) => ({ ...prev, productIds: '' }))
                            }}
                          />
                          <span className="truncate">{prod.name}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
                {fieldErrors.productIds && (
                  <p className="text-xs text-rose-600">{fieldErrors.productIds}</p>
                )}
              </div>
            )}
          </div>

          <div className="pt-1">
            <Switch
              checked={form.active}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
              label="Kích hoạt mã giảm giá"
            />
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
              Lưu mã giảm giá
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function VouchersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const queryParam = searchParams.get('q') || ''
  const statusParam = searchParams.get('status') || ''
  const pageParam = parseInt(searchParams.get('page') || '1', 10)
  const currentPage = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
  const limit = 20

  const [searchInput, setSearchInput] = useState(queryParam)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingVoucher, setEditingVoucher] = useState<AdminVoucher | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminVoucher | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'vouchers', { q: queryParam, status: statusParam, page: currentPage, limit }],
    queryFn: () =>
      listAdminVouchers({
        q: queryParam,
        status: statusParam && statusParam !== 'all' ? statusParam : undefined,
        page: currentPage,
        limit,
      }),
  })

  const vouchers = data?.data || []
  const pagination = data?.meta?.pagination || {
    page: currentPage,
    limit,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  }

  const invalidateVouchers = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'vouchers'] })
  }

  const createMutation = useMutation({
    mutationFn: (input: SaveVoucherInput) => createAdminVoucher(input),
    onSuccess: (created) => {
      setIsFormOpen(false)
      setEditingVoucher(null)
      setMessage(`Đã tạo mã giảm giá ${created.code} thành công.`)
      setErrorMessage(null)
      invalidateVouchers()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: SaveVoucherInput }) =>
      updateAdminVoucher(id, input),
    onSuccess: (updated) => {
      setIsFormOpen(false)
      setEditingVoucher(null)
      setMessage(`Đã cập nhật mã giảm giá ${updated.code} thành công.`)
      setErrorMessage(null)
      invalidateVouchers()
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: (voucher: AdminVoucher) =>
      updateAdminVoucher(voucher.id, {
        code: voucher.code,
        title: voucher.title,
        description: voucher.description || '',
        voucherType: voucher.voucherType,
        scopeType: voucher.scopeType || 'all',
        categoryIds: (voucher.scopeCategories || []).map((c) => c.id),
        productIds: (voucher.scopeProducts || []).map((p) => p.id),
        discountValue: voucher.voucherType === 'freeship' ? '0' : voucher.discountValue,
        maxDiscountVnd: voucher.voucherType === 'fixed_amount' ? null : voucher.maxDiscountVnd,
        minOrderVnd: voucher.minOrderVnd,
        usageLimit: voucher.usageLimit,
        perUserLimit: voucher.perUserLimit,
        startsAt: voucher.startsAt,
        endsAt: voucher.endsAt,
        active: !voucher.active,
      }),
    onSuccess: (updated) => {
      setMessage(
        updated.active
          ? `Đã bật mã giảm giá ${updated.code}.`
          : `Đã tạm ngưng mã giảm giá ${updated.code}.`
      )
      setErrorMessage(null)
      invalidateVouchers()
    },
    onError: (err) => {
      setErrorMessage(getVoucherConflictMessage(err, 'Không thể thay đổi trạng thái mã giảm giá.'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminVoucher(id),
    onSuccess: () => {
      const code = deleteTarget?.code
      setDeleteTarget(null)
      setMessage(code ? `Đã xóa mã giảm giá ${code}.` : 'Đã xóa mã giảm giá.')
      setErrorMessage(null)
      invalidateVouchers()
    },
    onError: (err) => {
      setDeleteTarget(null)
      setErrorMessage(getVoucherConflictMessage(err, 'Không thể xóa mã giảm giá.'))
    },
  })

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    const nextParams = new URLSearchParams(searchParams)
    const trimmed = searchInput.trim()
    if (trimmed) {
      nextParams.set('q', trimmed)
    } else {
      nextParams.delete('q')
    }
    nextParams.set('page', '1')
    setSearchParams(nextParams)
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
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Quản lý mã giảm giá</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tạo và quản lý voucher giảm phần trăm, tiền mặt cố định và miễn phí vận chuyển.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            setEditingVoucher(null)
            setErrorMessage(null)
            setIsFormOpen(true)
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Tạo mã giảm giá
        </Button>
      </div>

      {/* Banners */}
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

      {/* Filter & Search Bar */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Tìm theo mã hoặc tiêu đề..."
                className="pl-10"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="Lọc theo trạng thái"
                value={statusParam || 'all'}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-48"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang hoạt động</option>
                <option value="scheduled">Sắp diễn ra</option>
                <option value="exhausted">Hết lượt</option>
                <option value="expired">Hết hạn</option>
                <option value="inactive">Tạm ngưng</option>
              </Select>

              <Button type="submit" variant="primary">
                <Search className="h-4 w-4 mr-1.5" />
                Tìm kiếm
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
                title="Làm mới"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin text-blue-600' : ''}`} />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Main Table */}
      {isError ? (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-3" />
            <p className="font-semibold text-rose-900">Không thể tải danh sách mã giảm giá</p>
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
                  <TableHead>Mã & Tiêu đề</TableHead>
                  <TableHead>Loại & Mức giảm</TableHead>
                  <TableHead>Đơn tối thiểu</TableHead>
                  <TableHead>Lượt dùng</TableHead>
                  <TableHead>Hiệu lực</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Kích hoạt</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-10 text-center text-sm text-slate-500">
                      <RefreshCw className="h-5 w-5 animate-spin text-blue-600 mx-auto mb-2" />
                      Đang tải danh sách mã giảm giá...
                    </TableCell>
                  </TableRow>
                ) : vouchers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-12 text-center">
                      <Ticket className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                      <p className="font-semibold text-slate-800">Chưa có mã giảm giá nào</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Hãy nhấn "Tạo mã giảm giá" để thêm chương trình khuyến mãi mới.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  vouchers.map((voucher) => (
                    <TableRow key={voucher.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <span className="font-mono text-sm font-bold text-slate-900">
                            {voucher.code}
                          </span>
                          <p className="text-xs text-slate-600 line-clamp-1">{voucher.title}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-slate-800 block">
                            {VOUCHER_TYPE_LABELS[voucher.voucherType]}
                          </span>
                          <span className="text-xs text-blue-700 font-semibold block">
                            {formatDiscountSummary(voucher)}
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            {formatScopeSummary(voucher)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-700 whitespace-nowrap">
                        {formatVND(voucher.minOrderVnd)}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                        <div className="font-medium text-slate-800">
                          {voucher.usedCount} / {voucher.usageLimit ?? 'Không giới hạn'}
                        </div>
                        <div>Mỗi khách: {voucher.perUserLimit}</div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                        <div>Từ: {formatDateTime(voucher.startsAt)}</div>
                        <div>Đến: {formatDateTime(voucher.endsAt)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            STATUS_BADGE_CLASSES[voucher.effectiveStatus] ||
                            'bg-slate-100 text-slate-700'
                          }
                        >
                          {STATUS_LABELS[voucher.effectiveStatus] || voucher.effectiveStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          aria-label={`Bật/tắt mã ${voucher.code}`}
                          checked={voucher.active}
                          disabled={toggleActiveMutation.isPending}
                          onChange={() => toggleActiveMutation.mutate(voucher)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="iconSm"
                            aria-label={`Sửa ${voucher.code}`}
                            onClick={() => {
                              setEditingVoucher(voucher)
                              setErrorMessage(null)
                              setIsFormOpen(true)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="iconSm"
                            aria-label={`Xóa ${voucher.code}`}
                            onClick={() => {
                              setDeleteTarget(voucher)
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
                Tổng <span className="font-medium text-slate-700">{pagination.total}</span> mã giảm giá
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
      <VoucherFormDialog
        open={isFormOpen}
        editingVoucher={editingVoucher}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) setEditingVoucher(null)
        }}
        onSubmit={async (input) => {
          if (editingVoucher) {
            await updateMutation.mutateAsync({ id: editingVoucher.id, input })
          } else {
            await createMutation.mutateAsync(input)
          }
        }}
      />

      {/* Delete Confirm Dialog */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa mã giảm giá</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa mã giảm giá <strong>{deleteTarget?.code}</strong> không?
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
