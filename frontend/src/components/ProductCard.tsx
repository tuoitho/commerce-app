import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Star } from 'lucide-react'
import type { ProductSummary } from '@/api/types'
import { formatVND } from '@/lib/utils'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { FavoriteToggleButton } from './FavoriteToggleButton'
import { CompareToggleButton } from './CompareToggleButton'

interface ProductCardProps {
  product: ProductSummary
}

export function ProductCard({ product }: ProductCardProps) {
  const [imageFailed, setImageFailed] = useState(false)

  const minPrice = product.minPriceVnd || product.price
  const maxPrice = product.maxPriceVnd || product.price
  const isPriceRange = minPrice && maxPrice && minPrice !== maxPrice

  const formattedPrice = isPriceRange
    ? `${formatVND(minPrice)} - ${formatVND(maxPrice)}`
    : formatVND(minPrice || 0)

  const numPrice = Number(minPrice || 0)
  const installmentEstimate = numPrice > 0 ? Math.round(numPrice / 12) : 0
  const reviewCount = product.reviewCount ?? 0
  const averageRating = product.averageRating ?? 0
  const soldCount = product.soldCount ?? 0
  const imageAlt = `${product.brand || ''} ${product.name} ${product.model ?? ''}`.trim()

  return (
    <article className="group relative flex h-full flex-col justify-between rounded-2xl border border-zinc-200/90 bg-white p-4 sm:p-5 transition-all duration-300 hover:border-zinc-900 hover:shadow-lg hover:shadow-zinc-950/5">
      <div>
        {/* Top Architectural Metadata Row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border-zinc-200 text-zinc-700 bg-zinc-50"
            >
              {product.brand || 'Smartphone'}
            </Badge>
            <span className="font-mono text-[10px] font-medium text-zinc-500 border border-zinc-200/80 rounded-md px-1.5 py-0.5 bg-white">
              0% APR
            </span>
          </div>

          {product.inStock ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50/90 px-2 py-0.5 rounded-md border border-emerald-200/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              Còn hàng
            </span>
          ) : (
            <Badge variant="destructive" className="text-[10px] py-0.5 px-2">
              Hết hàng
            </Badge>
          )}
        </div>

        {/* Clean Studio Pedestal Image Container (No overlaid tags or fake light sweeps) */}
        <div className="relative my-2">
          <Link
            to={`/products/${product.id}`}
            className="relative flex h-48 sm:h-52 w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-100 bg-[#f7f7f5] p-5 transition-colors duration-300 group-hover:bg-zinc-100/70"
          >
            {!imageFailed && product.primaryImageUrl ? (
              <img
                src={product.primaryImageUrl}
                alt={imageAlt}
                className="max-h-full max-w-full object-contain transition-transform duration-500 ease-out group-hover:scale-105"
                onError={() => setImageFailed(true)}
                loading="lazy"
              />
            ) : (
              <img
                src="/iphone-16-pro.jpg"
                alt={imageAlt}
                className="max-h-full max-w-full object-contain transition-transform duration-500 ease-out group-hover:scale-105"
                loading="lazy"
              />
            )}
          </Link>

          <div className="absolute top-2.5 right-2.5 z-20">
            <FavoriteToggleButton
              productId={product.id}
              productName={product.name}
              size="sm"
            />
          </div>
        </div>

        {/* Lineage Row */}
        <div className="mt-3 flex items-center justify-between gap-2">
          {product.model ? (
            <span className="font-mono text-[11px] font-medium text-zinc-500 tracking-tight">
              {product.model}
            </span>
          ) : (
            <span className="font-mono text-[11px] font-medium text-zinc-400">
              VNA EDITION
            </span>
          )}
        </div>

        {/* Product Title */}
        <h3 className="mt-1 font-bold text-zinc-950 text-base leading-snug line-clamp-1 group-hover:text-emerald-700 transition-colors">
          <Link to={`/products/${product.id}`}>{product.name}</Link>
        </h3>

        {/* Rating & Sold Count */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1">
            {reviewCount > 0 ? (
              <>
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                <span className="font-mono font-bold text-zinc-900 tabular-nums">
                  {Number(averageRating).toFixed(1)}
                </span>
                <span className="text-zinc-500 font-medium">
                  ({reviewCount})
                </span>
              </>
            ) : (
              <span className="text-zinc-400 font-medium">Chưa có đánh giá</span>
            )}
          </div>

          {soldCount > 0 && (
            <span className="text-zinc-500 font-medium tabular-nums">
              Đã bán {soldCount}
            </span>
          )}
        </div>
      </div>

      {/* Pricing & Action Footer */}
      <div className="mt-4 pt-3.5 border-t border-zinc-100 space-y-3">
        <div>
          <span className="font-mono font-bold text-zinc-950 text-base sm:text-lg tracking-tight tabular-nums block">
            {formattedPrice}
          </span>
          {installmentEstimate > 0 && (
            <span className="block text-[11px] text-zinc-500 font-medium mt-0.5">
              Trả góp từ ~{formatVND(installmentEstimate)}/tháng
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CompareToggleButton product={product} className="flex-1 h-9 rounded-xl" />
          <Link to={`/products/${product.id}`} className="flex-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 rounded-xl px-3 text-xs font-semibold border-zinc-200 text-zinc-900 group-hover:bg-zinc-950 group-hover:text-white group-hover:border-zinc-950 transition-colors gap-1"
            >
              <span>Chi tiết</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </article>
  )
}
