import { Pin } from 'lucide-react'
import type { LiveProduct } from '@/api/live'
import { allLiveQuotaExhausted, formatPriceRange } from './livePricing'

interface PinnedProductCardProps {
  product: LiveProduct
  onBuy: (productId: string) => void
}

export function PinnedProductCard({ product, onBuy }: PinnedProductCardProps) {
  const exhausted = allLiveQuotaExhausted(product)
  return (
    <div className="flex w-full max-w-xs items-center gap-3 rounded-2xl bg-white/95 p-2.5 pr-3 text-zinc-950 shadow-xl backdrop-blur">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
        {product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />}
        <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-zinc-950/70 text-white">
          <Pin className="h-2.5 w-2.5" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{product.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5">
          {product.hasLivePrice && (
            <span className="rounded bg-rose-600 px-1 py-px text-[10px] font-bold uppercase text-white">Giá live</span>
          )}
          <span className={`text-sm font-bold tabular-nums ${product.hasLivePrice ? 'text-rose-600' : 'text-zinc-950'}`}>
            {formatPriceRange(product.minPriceVnd, product.maxPriceVnd)}
          </span>
        </div>
        {exhausted && <p className="text-[11px] font-medium text-zinc-500">Hết suất giá live</p>}
      </div>
      <button
        type="button"
        onClick={() => onBuy(product.productId)}
        className="shrink-0 rounded-xl bg-zinc-950 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-800"
      >
        Mua ngay
      </button>
    </div>
  )
}
