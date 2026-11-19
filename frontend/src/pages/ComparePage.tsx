import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  GitCompareArrows,
  RotateCcw,
  ShoppingCart,
  Star,
  X,
  Zap,
} from 'lucide-react'
import { catalogApi } from '@/api/catalog'
import { ApiError, type ProductDetail, type ProductVariant } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useCompare, MAX_COMPARE_ITEMS } from '@/context/CompareContext'
import { useToast } from '@/context/ToastContext'
import { getVariantEffectivePricing } from '@/lib/pricing'
import { formatVND } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

function normalizeSpecText(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function getVariantLabel(product: ProductDetail, variant: ProductVariant, index: number): string {
  if (!product.optionGroups || product.optionGroups.length === 0) {
    return `Phiên bản #${index + 1}`
  }
  const sortedGroups = [...product.optionGroups].sort((a, b) => a.position - b.position)
  const parts = sortedGroups
    .map((group) => {
      const valueId = variant.optionValueIds?.[group.id]
      const value = group.values.find((v) => v.id === valueId)
      return value?.label
    })
    .filter((label): label is string => Boolean(label))

  return parts.length > 0 ? parts.join(' · ') : `Phiên bản #${index + 1}`
}

function getDefaultVariantId(product: ProductDetail): string {
  if (!product.variants || product.variants.length === 0) return ''
  const firstAvailable = product.variants.find(
    (v) => v.active !== false && v.stockQuantity > 0
  )
  return (firstAvailable ?? product.variants[0]).id
}

interface AlignedSpecRow {
  labelKey: string
  label: string
  values: Array<string | null>
}

interface AlignedSpecGroup {
  groupKey: string
  group: string
  rows: AlignedSpecRow[]
}

function buildAlignedSpecGroups(products: ProductDetail[]): AlignedSpecGroup[] {
  const groupOrder: string[] = []
  const groupMap = new Map<
    string,
    {
      group: string
      rowOrder: string[]
      rows: Map<string, { label: string; values: Array<string | null> }>
    }
  >()

  products.forEach((product, productIdx) => {
    const specs = product.specs ?? []
    specs.forEach((specGroup) => {
      const groupKey = normalizeSpecText(specGroup.group)
      if (!groupKey) return

      let groupEntry = groupMap.get(groupKey)
      if (!groupEntry) {
        groupEntry = {
          group: specGroup.group.trim(),
          rowOrder: [],
          rows: new Map(),
        }
        groupMap.set(groupKey, groupEntry)
        groupOrder.push(groupKey)
      }

      specGroup.items.forEach((item) => {
        const labelKey = normalizeSpecText(item.label)
        if (!labelKey) return

        let rowEntry = groupEntry!.rows.get(labelKey)
        if (!rowEntry) {
          rowEntry = {
            label: item.label.trim(),
            values: Array.from({ length: products.length }, () => null),
          }
          groupEntry!.rows.set(labelKey, rowEntry)
          groupEntry!.rowOrder.push(labelKey)
        }
        if (rowEntry.values[productIdx] === null) {
          rowEntry.values[productIdx] = item.value
        }
      })
    })
  })

  return groupOrder.map((groupKey) => {
    const entry = groupMap.get(groupKey)!
    return {
      groupKey,
      group: entry.group,
      rows: entry.rowOrder.map((labelKey) => {
        const row = entry.rows.get(labelKey)!
        return {
          labelKey,
          label: row.label,
          values: row.values,
        }
      }),
    }
  })
}

export function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  const { addItem } = useCart()
  const { items: trayItems, removeProduct } = useCompare()
  const { success, error: toastError } = useToast()

  const targetIds = useMemo(() => {
    const rawIds = searchParams.get('ids')
    const sourceIds = rawIds
      ? rawIds
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : trayItems.map((item) => item.id)

    const seen = new Set<string>()
    const unique: string[] = []
    for (const id of sourceIds) {
      if (!seen.has(id)) {
        seen.add(id)
        unique.push(id)
      }
      if (unique.length >= MAX_COMPARE_ITEMS) break
    }
    return unique
  }, [searchParams, trayItems])

  const idsKey = targetIds.join(',')

  const [products, setProducts] = useState<ProductDetail[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedVariantIds, setSelectedVariantIds] = useState<Record<string, string>>({})
  const [addingProductId, setAddingProductId] = useState<string | null>(null)
  const [onlyDifferences, setOnlyDifferences] = useState(false)
  const requestSeqRef = useRef(0)

  const loadProducts = useCallback(async () => {
    const seq = ++requestSeqRef.current
    const ids = idsKey ? idsKey.split(',') : []
    if (ids.length < 2) {
      setProducts([])
      setLoadError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setLoadError(null)
    try {
      const results = await Promise.all(ids.map((id) => catalogApi.getProduct(id)))
      if (seq !== requestSeqRef.current) return
      setProducts(results)
      setSelectedVariantIds((prev) => {
        const next: Record<string, string> = {}
        results.forEach((product) => {
          const prevSelected = prev[product.id]
          const exists = product.variants?.some((v) => v.id === prevSelected)
          next[product.id] = exists ? prevSelected : getDefaultVariantId(product)
        })
        return next
      })
    } catch (err: unknown) {
      if (seq !== requestSeqRef.current) return
      console.error('Failed to load comparison products', err)
      setLoadError('Không thể tải thông tin so sánh sản phẩm. Vui lòng thử lại sau.')
      setProducts([])
    } finally {
      if (seq === requestSeqRef.current) {
        setIsLoading(false)
      }
    }
  }, [idsKey])

  useEffect(() => {
    void loadProducts()
    return () => {
      requestSeqRef.current += 1
    }
  }, [loadProducts])

  const handleSelectVariant = (productId: string, variantId: string) => {
    setSelectedVariantIds((prev) => ({
      ...prev,
      [productId]: variantId,
    }))
  }

  const handleRemoveFromCompare = (productId: string) => {
    removeProduct(productId)
    const remainingIds = targetIds.filter((id) => id !== productId)
    if (remainingIds.length > 0) {
      setSearchParams({ ids: remainingIds.join(',') })
    } else {
      setSearchParams({})
    }
  }

  const handleAddToCart = async (product: ProductDetail, variant: ProductVariant | null) => {
    if (!isAuthenticated) {
      const redirect = encodeURIComponent(location.pathname + location.search)
      navigate(`/login?redirect=${redirect}`)
      return
    }

    if (!variant || variant.active === false || variant.stockQuantity <= 0) {
      toastError('Hết hàng', 'Phiên bản sản phẩm này tạm thời hết hàng.')
      return
    }

    setAddingProductId(product.id)
    try {
      await addItem(variant.id)
      success('Đã thêm vào giỏ hàng!', `${product.name} đã được thêm vào giỏ hàng thành công.`)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'stock_limit') {
        toastError('Vượt quá tồn kho', err.message || 'Số lượng vượt quá tồn kho khả dụng.')
      } else {
        toastError('Thêm vào giỏ thất bại', 'Không thể thêm sản phẩm vào giỏ. Vui lòng thử lại.')
      }
    } finally {
      setAddingProductId(null)
    }
  }

  const alignedSpecGroups = useMemo(() => buildAlignedSpecGroups(products), [products])

  const visibleSpecGroups = useMemo(() => {
    if (!onlyDifferences) return alignedSpecGroups
    return alignedSpecGroups
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => {
          const normalized = row.values.map((v) => normalizeSpecText(v))
          return new Set(normalized).size > 1
        }),
      }))
      .filter((group) => group.rows.length > 0)
  }, [alignedSpecGroups, onlyDifferences])

  if (targetIds.length < 2) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-900">
          <GitCompareArrows className="h-7 w-7 text-emerald-700" />
        </div>
        <div className="space-y-2">
          <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-700 font-semibold">
            SO SÁNH CẤU HÌNH
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight">
            Chưa đủ sản phẩm để so sánh
          </h1>
          <p className="text-sm text-zinc-600 leading-relaxed max-w-md mx-auto">
            Vui lòng chọn từ 2 đến 3 mẫu điện thoại trong danh mục để đối chiếu thông số kỹ thuật, phiên bản dung lượng và giá bán cạnh nhau.
          </p>
        </div>
        <div className="pt-2">
          <Link to="/products">
            <Button className="h-11 rounded-xl bg-zinc-950 px-6 text-sm font-semibold text-white hover:bg-emerald-700 gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Chọn điện thoại từ danh mục</span>
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {targetIds.map((id) => (
            <Skeleton key={id} className="h-80 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-extrabold text-zinc-950">Không thể tải bảng so sánh</h1>
        <p className="text-sm text-zinc-600">{loadError}</p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={loadProducts}
            className="rounded-xl gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Thử lại</span>
          </Button>
          <Link to="/products">
            <Button className="rounded-xl bg-zinc-950 hover:bg-emerald-700 text-white">
              Về danh mục
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-20">
      <div className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <Link
                to="/products"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-950 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Quay lại danh mục điện thoại</span>
              </Link>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950">
                So sánh điện thoại ({products.length})
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500">
                Đối chiếu giá bán theo từng phiên bản dung lượng, tồn kho và thông số kỹ thuật chi tiết.
              </p>
            </div>

            <label className="inline-flex items-center gap-2.5 self-start sm:self-auto rounded-xl border border-zinc-200 bg-[#f7f7f5] px-3.5 py-2 text-xs sm:text-sm font-semibold text-zinc-900 cursor-pointer select-none hover:border-zinc-400 transition-colors">
              <input
                type="checkbox"
                checked={onlyDifferences}
                onChange={(e) => setOnlyDifferences(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 accent-emerald-700 cursor-pointer"
              />
              <span>Chỉ hiện điểm khác biệt</span>
            </label>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8 space-y-8">
        <div className="w-full overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table
            className={`w-full border-collapse text-left ${
              products.length >= 3 ? 'min-w-[660px]' : 'min-w-[500px]'
            }`}
          >
            <thead>
              <tr className="border-b border-zinc-200 align-top">
                <th
                  scope="col"
                  className="w-28 sm:w-44 lg:w-56 p-3 sm:p-4 lg:p-5 bg-[#f7f7f5]/70 border-r border-zinc-200 align-bottom"
                >
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 block">
                    ĐỐI CHIẾU THIẾT BỊ
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-zinc-950 mt-1 block">
                    Phiên bản & Giá bán
                  </span>
                </th>

                {products.map((product) => {
                  const activeVariants = product.variants ?? []
                  const selectedVariant =
                    activeVariants.find((v) => v.id === selectedVariantIds[product.id]) ??
                    activeVariants[0] ??
                    null
                  const pricing = getVariantEffectivePricing(selectedVariant)
                  const inStock = Boolean(
                    selectedVariant &&
                      selectedVariant.active !== false &&
                      selectedVariant.stockQuantity > 0
                  )
                  const reviewCount = product.reviewCount ?? 0
                  const averageRating = product.averageRating ?? 0
                  const soldCount = product.soldCount ?? 0

                  return (
                    <th
                      key={product.id}
                      scope="col"
                      className="p-3 sm:p-5 font-normal border-r last:border-r-0 border-zinc-200 align-top"
                    >
                      <div className="space-y-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border-zinc-200 bg-zinc-50 text-zinc-700"
                          >
                            {product.brand || 'Smartphone'}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromCompare(product.id)}
                            aria-label={`Bỏ ${product.name} khỏi so sánh`}
                            title={`Bỏ ${product.name}`}
                            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <Link
                          to={`/products/${product.id}`}
                          className="flex h-36 sm:h-44 w-full items-center justify-center rounded-xl bg-[#f7f7f5] p-4 border border-zinc-100 hover:border-zinc-300 transition-colors"
                        >
                          <img
                            src={product.imageUrls?.[0] || '/iphone-16-pro.jpg'}
                            alt={product.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </Link>

                        <div className="space-y-1">
                          <h2 className="text-base font-bold text-zinc-950 leading-snug">
                            <Link
                              to={`/products/${product.id}`}
                              className="hover:text-emerald-700 transition-colors"
                            >
                              {product.name}
                            </Link>
                          </h2>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                            {reviewCount > 0 ? (
                              <span className="inline-flex items-center gap-1 font-medium text-zinc-800">
                                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                <span className="font-mono font-bold tabular-nums">
                                  {Number(averageRating).toFixed(1)}
                                </span>
                                <span className="text-zinc-500">({reviewCount})</span>
                              </span>
                            ) : (
                              <span className="text-zinc-400">Chưa có đánh giá</span>
                            )}
                            {soldCount > 0 && (
                              <span className="tabular-nums">Đã bán {soldCount}</span>
                            )}
                          </div>
                        </div>

                        {activeVariants.length > 0 && (
                          <div className="space-y-1">
                            <label
                              htmlFor={`compare-variant-${product.id}`}
                              className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500"
                            >
                              Phiên bản
                            </label>
                            <Select
                              id={`compare-variant-${product.id}`}
                              aria-label={`Phiên bản ${product.name}`}
                              value={selectedVariant?.id ?? ''}
                              onChange={(e) => handleSelectVariant(product.id, e.target.value)}
                              className="h-9 text-xs font-semibold border-zinc-200"
                            >
                              {activeVariants.map((variant, idx) => (
                                <option key={variant.id} value={variant.id}>
                                  {getVariantLabel(product, variant, idx)}
                                </option>
                              ))}
                            </Select>
                          </div>
                        )}

                        <div className="space-y-1.5 pt-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {pricing.source === 'live' && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                Giá live
                              </span>
                            )}
                            {pricing.source === 'flash_sale' && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-950">
                                <Zap className="h-3 w-3 fill-zinc-950" />
                                Flash Sale
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-baseline gap-2">
                            <span
                              className={`font-mono text-lg font-bold tabular-nums ${
                                pricing.isDiscounted ? 'text-rose-600' : 'text-zinc-950'
                              }`}
                            >
                              {formatVND(pricing.effectivePriceVnd)}
                            </span>
                            {pricing.isDiscounted && (
                              <span className="font-mono text-xs text-zinc-400 line-through tabular-nums">
                                {formatVND(pricing.regularPriceVnd)}
                              </span>
                            )}
                          </div>

                          <div>
                            {inStock && selectedVariant ? (
                              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-800">
                                Còn {selectedVariant.stockQuantity} máy
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-700">
                                Hết hàng
                              </span>
                            )}
                          </div>
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          disabled={!inStock || addingProductId === product.id}
                          isLoading={addingProductId === product.id}
                          title={!inStock ? 'Phiên bản này tạm hết hàng' : undefined}
                          onClick={() => handleAddToCart(product, selectedVariant)}
                          className="w-full h-10 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold gap-1.5"
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          <span>Thêm vào giỏ</span>
                        </Button>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {alignedSpecGroups.length === 0 ? (
                <tr>
                  <td
                    colSpan={products.length + 1}
                    className="p-10 text-center text-sm text-zinc-500"
                  >
                    Các sản phẩm đang chọn chưa có dữ liệu thông số kỹ thuật chi tiết.
                  </td>
                </tr>
              ) : visibleSpecGroups.length === 0 ? (
                <tr>
                  <td
                    colSpan={products.length + 1}
                    className="p-10 text-center text-sm text-zinc-500"
                  >
                    Tất cả thông số kỹ thuật của các sản phẩm đang so sánh đều giống nhau.
                  </td>
                </tr>
              ) : (
                visibleSpecGroups.map((group) => (
                  <SpecGroupRows
                    key={group.groupKey}
                    group={group}
                    colSpan={products.length + 1}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SpecGroupRows({
  group,
  colSpan,
}: {
  group: AlignedSpecGroup
  colSpan: number
}) {
  return (
    <>
      <tr className="border-t border-b border-zinc-200 bg-zinc-950/95 text-white">
        <th
          colSpan={colSpan}
          scope="colgroup"
          className="px-4 sm:px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-emerald-400"
        >
          {group.group}
        </th>
      </tr>
      {group.rows.map((row) => (
        <tr
          key={`${group.groupKey}::${row.labelKey}`}
          className="border-b last:border-b-0 border-zinc-200/80 hover:bg-[#f7f7f5]/60 transition-colors"
        >
          <th
            scope="row"
            className="w-28 sm:w-44 lg:w-56 px-3 sm:px-5 py-3 sm:py-3.5 bg-[#f7f7f5]/50 border-r border-zinc-200 text-xs font-semibold text-zinc-700 align-top"
          >
            {row.label}
          </th>
          {row.values.map((val, idx) => (
            <td
              key={idx}
              className="px-3 sm:px-5 py-3 sm:py-3.5 border-r last:border-r-0 border-zinc-200 text-xs sm:text-sm font-medium text-zinc-900 align-top"
            >
              {val && val.trim() ? (
                val
              ) : (
                <span className="text-zinc-400 font-mono">—</span>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
