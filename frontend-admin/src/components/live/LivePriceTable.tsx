import { ArrowDown, ArrowUp, Pin, PinOff, Trash2 } from 'lucide-react'
import { formatVND } from '@/lib/utils'
import { productErrorKey, variantErrorKey, type DraftErrors, type DraftProduct, type DraftVariant } from './liveDraft'

interface LivePriceTableProps {
  products: DraftProduct[]
  errors: DraftErrors
  onChange: (products: DraftProduct[]) => void
  /** Present while broadcasting: pin a product for viewers. */
  pinnedProductId?: string | null
  onTogglePin?: (productId: string) => void
}

export function LivePriceTable({ products, errors, onChange, pinnedProductId, onTogglePin }: LivePriceTableProps) {
  if (products.length === 0) {
    return <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">Chưa có sản phẩm nào trong giỏ hàng live.</p>
  }

  const update = (productId: string, variantId: string, patch: Partial<DraftVariant>) =>
    onChange(products.map((p) => (p.productId !== productId ? p : { ...p, variants: p.variants.map((v) => (v.variantId === variantId ? { ...v, ...patch } : v)) })))
  const move = (index: number, delta: number) => {
    const next = [...products]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    onChange(next)
  }
  const remove = (productId: string) => onChange(products.filter((p) => p.productId !== productId))

  return (
    <ol className="flex flex-col gap-3">
      {products.map((product, index) => {
        const pinned = pinnedProductId === product.productId
        return (
          <li key={product.productId} data-testid={`live-product-${product.productId}`} className={`rounded-2xl border bg-white ${pinned ? 'border-teal-500 ring-1 ring-teal-500' : 'border-zinc-200'}`}>
            <div className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2.5">
              <span className="w-5 text-center font-mono text-xs text-zinc-400">{index + 1}</span>
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                {product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-900">{product.name}</p>
                {errors[productErrorKey(product.productId)] && (
                  <p className="text-xs text-rose-600">{errors[productErrorKey(product.productId)]}</p>
                )}
              </div>
              {onTogglePin && (
                <button
                  type="button"
                  onClick={() => onTogglePin(product.productId)}
                  aria-label={pinned ? `Bỏ ghim ${product.name}` : `Ghim ${product.name}`}
                  className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold ${pinned ? 'bg-teal-600 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}
                >
                  {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  {pinned ? 'Bỏ ghim' : 'Ghim'}
                </button>
              )}
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Đưa ${product.name} lên`} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 disabled:opacity-30">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === products.length - 1} aria-label={`Đưa ${product.name} xuống`} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 disabled:opacity-30">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => remove(product.productId)} aria-label={`Bỏ ${product.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-rose-50 hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-400">
                  <th className="px-3 py-1.5 font-semibold">Phiên bản</th>
                  <th className="px-3 py-1.5 font-semibold">Giá thường</th>
                  <th className="px-3 py-1.5 font-semibold">Giá live</th>
                  <th className="px-3 py-1.5 font-semibold">Số suất</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((variant) => {
                  const priceError = errors[variantErrorKey(product.productId, variant.variantId, 'livePriceVnd')] ?? errors[variantErrorKey(product.productId, variant.variantId, 'variantId')]
                  const quotaError = errors[variantErrorKey(product.productId, variant.variantId, 'quota')]
                  return (
                    <tr key={variant.variantId} className="border-t border-zinc-100 align-top">
                      <td className="px-3 py-2 text-zinc-800">{variant.label}</td>
                      <td className="px-3 py-2 font-mono tabular-nums text-zinc-500">{formatVND(variant.regularPriceVnd)}</td>
                      <td className="px-3 py-2">
                        <input
                          inputMode="numeric"
                          value={variant.livePriceVnd}
                          onChange={(e) => update(product.productId, variant.variantId, { livePriceVnd: e.target.value.replace(/\D/g, '') })}
                          placeholder="Không giảm"
                          aria-label={`Giá live ${product.name} ${variant.label}`}
                          aria-invalid={!!priceError}
                          className={`h-8 w-32 rounded-lg border px-2 font-mono text-sm tabular-nums outline-none focus:border-teal-600 ${priceError ? 'border-rose-400' : 'border-zinc-200'}`}
                        />
                        {priceError && <p className="mt-1 text-xs text-rose-600">{priceError}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          inputMode="numeric"
                          value={variant.quota}
                          onChange={(e) => update(product.productId, variant.variantId, { quota: e.target.value.replace(/\D/g, '') })}
                          placeholder="Không giới hạn"
                          disabled={variant.livePriceVnd === ''}
                          aria-label={`Số suất ${product.name} ${variant.label}`}
                          aria-invalid={!!quotaError}
                          className={`h-8 w-28 rounded-lg border px-2 font-mono text-sm tabular-nums outline-none focus:border-teal-600 disabled:bg-zinc-50 ${quotaError ? 'border-rose-400' : 'border-zinc-200'}`}
                        />
                        {variant.sold > 0 && (
                          <p className="mt-1 text-xs text-zinc-500">
                            Đã bán {variant.sold}{variant.quota ? `/${variant.quota}` : ''} suất
                          </p>
                        )}
                        {quotaError && <p className="mt-1 text-xs text-rose-600">{quotaError}</p>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </li>
        )
      })}
    </ol>
  )
}
