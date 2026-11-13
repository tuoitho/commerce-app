import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, ShoppingBag, X } from 'lucide-react'
import { catalogApi } from '@/api/catalog'
import { ApiError } from '@/api/client'
import type { LiveProduct } from '@/api/live'
import type { ProductDetail, ProductVariant } from '@/api/types'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { formatVND } from '@/lib/utils'
import { allLiveQuotaExhausted, formatPriceRange, isQuotaExhausted } from './livePricing'

interface LiveCartSheetProps {
  open: boolean
  products: LiveProduct[]
  /** Product to open straight at its variant picker ("Mua ngay"). */
  focusProductId: string | null
  onClose: () => void
}

export function LiveCartSheet({ open, products, focusProductId, onClose }: LiveCartSheetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(focusProductId)

  useEffect(() => {
    if (open) setSelectedId(focusProductId)
  }, [open, focusProductId])

  const selected = products.find((p) => p.productId === selectedId) ?? null

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:justify-end md:p-8" role="dialog" aria-modal="true" aria-label="Giỏ hàng live">
      <button type="button" aria-label="Đóng giỏ hàng live" className="absolute inset-0 bg-zinc-950/40" onClick={onClose} />
      <div className="relative flex max-h-[78vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:max-h-[80vh] md:max-w-md md:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
          {selected && (
            <button type="button" onClick={() => setSelectedId(null)} aria-label="Quay lại danh sách" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-zinc-100">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h2 className="flex-1 text-sm font-bold text-zinc-950">
            {selected ? 'Chọn phiên bản' : `Giỏ hàng live · ${products.length} sản phẩm`}
          </h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {selected ? <VariantPicker product={selected} /> : <ProductList products={products} onSelect={setSelectedId} />}
        </div>
      </div>
    </div>
  )
}

function ProductList({ products, onSelect }: { products: LiveProduct[]; onSelect: (id: string) => void }) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center text-sm text-zinc-500">
        <ShoppingBag className="mb-2 h-6 w-6" />
        Chưa có sản phẩm nào trong giỏ hàng live
      </div>
    )
  }
  return (
    <ul className="divide-y divide-zinc-100">
      {products.map((product, index) => (
        <li key={product.productId} data-testid={`live-cart-item-${product.productId}`} className="flex items-center gap-3 px-4 py-3">
          <span className="w-4 shrink-0 text-center font-mono text-xs text-zinc-400">{index + 1}</span>
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
            {product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <Link
              to={`/products/${product.productId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-950 hover:underline"
            >
              {product.name}
            </Link>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {product.hasLivePrice && <span className="rounded bg-rose-600 px-1 py-px text-[10px] font-bold uppercase text-white">Giá live</span>}
              <span className={`text-sm font-bold tabular-nums ${product.hasLivePrice ? 'text-rose-600' : 'text-zinc-950'}`}>
                {formatPriceRange(product.minPriceVnd, product.maxPriceVnd)}
              </span>
              {product.hasLivePrice && (
                <span className="text-xs tabular-nums text-zinc-400 line-through">
                  {formatPriceRange(product.regularMinPriceVnd, product.regularMaxPriceVnd)}
                </span>
              )}
            </div>
            {!product.inStock && <p className="mt-0.5 text-xs font-semibold text-zinc-500">Hết hàng</p>}
            {product.inStock && allLiveQuotaExhausted(product) && <p className="mt-0.5 text-xs text-zinc-500">Hết suất giá live</p>}
          </div>
          <button
            type="button"
            onClick={() => onSelect(product.productId)}
            disabled={!product.inStock}
            className="shrink-0 rounded-xl bg-zinc-950 px-3.5 py-2 text-xs font-bold text-white hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-500"
          >
            Chọn
          </button>
        </li>
      ))}
    </ul>
  )
}

function VariantPicker({ product }: { product: LiveProduct }) {
  const { addItem } = useCart()
  const { success } = useToast()
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setError(null)
    catalogApi
      .getProduct(product.productId)
      .then((loaded) => {
        if (cancelled) return
        setDetail(loaded)
        setSelectedValues(defaultSelection(loaded))
      })
      .catch(() => {
        if (!cancelled) setError('Không tải được thông tin sản phẩm')
      })
    return () => {
      cancelled = true
    }
  }, [product.productId])

  const variant = useMemo(() => (detail ? findVariant(detail, selectedValues) : null), [detail, selectedValues])

  if (!detail) {
    return (
      <div className="flex justify-center py-12 text-zinc-400">
        {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : <Loader2 className="h-5 w-5 animate-spin" />}
      </div>
    )
  }

  const livePrice = variant ? product.livePrices.find((p) => p.variantId === variant.id) : undefined
  const liveActive = !!livePrice?.active
  const price = liveActive ? livePrice.livePriceVnd : variant?.priceVnd
  const outOfStock = !variant || variant.stockQuantity <= 0

  const add = async () => {
    if (!variant) return
    setAdding(true)
    setError(null)
    try {
      await addItem(variant.id)
      success('Đã thêm sản phẩm vào giỏ hàng')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thêm được vào giỏ hàng, vui lòng thử lại')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
          {product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug text-zinc-950">{product.name}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            {liveActive && <span className="rounded bg-rose-600 px-1 py-px text-[10px] font-bold uppercase text-white">Giá live</span>}
            <span data-testid="live-variant-price" className={`text-lg font-bold tabular-nums ${liveActive ? 'text-rose-600' : 'text-zinc-950'}`}>
              {price ? formatVND(price) : '—'}
            </span>
            {liveActive && variant && <span className="text-xs tabular-nums text-zinc-400 line-through">{formatVND(variant.priceVnd)}</span>}
          </div>
          {liveActive && livePrice.remaining !== null && (
            <p className="mt-0.5 text-xs font-semibold text-rose-600">Còn {livePrice.remaining} suất giá live</p>
          )}
          {isQuotaExhausted(livePrice) && <p className="mt-0.5 text-xs text-zinc-500">Hết suất giá live</p>}
        </div>
      </div>

      {detail.optionGroups.map((group) => (
        <div key={group.id}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">{group.label}</p>
          <div className="flex flex-wrap gap-2">
            {group.values.map((value) => {
              const active = selectedValues[group.id] === value.id
              return (
                <button
                  key={value.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedValues((current) => ({ ...current, [group.id]: value.id }))}
                  className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 text-zinc-800 hover:border-zinc-400'
                  }`}
                >
                  {value.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

      <button
        type="button"
        onClick={add}
        disabled={outOfStock || adding}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-bold text-white hover:bg-teal-800 disabled:bg-zinc-200 disabled:text-zinc-500"
      >
        {adding && <Loader2 className="h-4 w-4 animate-spin" />}
        {!variant ? 'Phiên bản không khả dụng' : outOfStock ? 'Hết hàng' : 'Thêm vào giỏ'}
      </button>
    </div>
  )
}

function defaultSelection(detail: ProductDetail): Record<string, string> {
  const firstAvailable = detail.variants.find((v) => v.active !== false && v.stockQuantity > 0) ?? detail.variants[0]
  return firstAvailable ? { ...firstAvailable.optionValueIds } : {}
}

function findVariant(detail: ProductDetail, selected: Record<string, string>): ProductVariant | null {
  return (
    detail.variants.find(
      (v) => v.active !== false && detail.optionGroups.every((group) => v.optionValueIds[group.id] === selected[group.id]),
    ) ?? null
  )
}
