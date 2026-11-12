import { Link } from 'react-router-dom'
import { ArrowRight, Smartphone } from 'lucide-react'
import type { ReferredProductCard } from '@/api/posts'
import { formatVND } from '@/lib/utils'

export interface ReferredProductCardListProps {
  products: ReferredProductCard[]
  className?: string
}

export function ReferredProductCardList({ products, className = '' }: ReferredProductCardListProps) {
  if (!products || products.length === 0) {
    return null
  }

  return (
    <div className={`space-y-2.5 ${className}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        <Smartphone className="h-3.5 w-3.5 text-emerald-600" />
        <span>Sản phẩm giới thiệu ({products.length})</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {products.map((prod) => (
          <Link
            key={prod.id}
            to={`/products/${prod.id}`}
            className="group flex items-center gap-3 rounded-xl border border-zinc-200/90 bg-white p-2.5 shadow-2xs transition-all duration-150 hover:border-zinc-400 hover:bg-zinc-50/80 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-zinc-200/70 bg-zinc-50">
              {prod.imageUrl ? (
                <img
                  src={prod.imageUrl}
                  alt={prod.name}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-400">
                  <Smartphone className="h-6 w-6 stroke-[1.5]" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 truncate">
                  {prod.brand || 'AuraPhone'}
                </span>
                <span className="text-zinc-300">•</span>
                {prod.inStock ? (
                  <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700">
                    Còn hàng
                  </span>
                ) : (
                  <span className="inline-flex items-center text-[10px] font-semibold text-zinc-500">
                    Hết hàng
                  </span>
                )}
              </div>

              <h4 className="truncate text-xs sm:text-sm font-semibold text-zinc-900 group-hover:text-emerald-700 transition-colors">
                {prod.name}
              </h4>

              <div className="mt-0.5 text-xs font-bold text-emerald-700 font-mono">
                {formatVND(prod.price)}
              </div>
            </div>

            <div className="shrink-0 pl-1 text-zinc-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-emerald-700">
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
