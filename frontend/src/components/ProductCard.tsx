import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import type { ProductSummary } from '@/api/types'
import { formatVND } from '@/lib/utils'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { FavoriteToggleButton } from './FavoriteToggleButton'

interface ProductCardProps {
  product: ProductSummary
}

function getPhoneSpecs(name: string): string[] {
  const lower = name.toLowerCase()
  if (lower.includes('16 pro') || lower.includes('15 pro')) {
    return ['OLED 120Hz', 'A-Series Pro', '48MP ProRAW']
  }
  if (lower.includes('16e') || lower.includes('15') || lower.includes('iphone')) {
    return ['Super Retina XDR', 'Apple Silicon', '48MP Fusion']
  }
  if (lower.includes('xiaomi 15') || lower.includes('xiaomi 14')) {
    return ['AMOLED 120Hz', 'Snapdragon 8', 'Leica Optics']
  }
  if (lower.includes('redmi')) {
    return ['120Hz Display', '5000mAh', '50MP OIS']
  }
  return ['Chính hãng VNA', 'Hỗ trợ 5G', 'Bảo hành 12T']
}

function getPhoneColors(name: string): string[] {
  const lower = name.toLowerCase()
  if (lower.includes('pro')) {
    return ['#9b9893', '#2a2928', '#dfdfd9', '#bfae98']
  }
  if (lower.includes('xiaomi')) {
    return ['#1f2022', '#f2f2f2', '#8fae9b']
  }
  return ['#1c1c1e', '#f4f4f6', '#7fa0b8']
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
  const specs = getPhoneSpecs(product.name)
  const colors = getPhoneColors(product.name)
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

        {/* Lineage & Color Finish Indicators (Below image, never overlaid) */}
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

          <div className="flex items-center gap-1" aria-label="Bảng màu hoàn thiện">
            {colors.map((c, i) => (
              <span
                key={i}
                className="h-2.5 w-2.5 rounded-full border border-zinc-300"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Product Title */}
        <h3 className="mt-1 font-bold text-zinc-950 text-base leading-snug line-clamp-1 group-hover:text-emerald-700 transition-colors">
          <Link to={`/products/${product.id}`}>{product.name}</Link>
        </h3>

        {/* Concise Technical Spec Ledger */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {specs.map((spec, i) => (
            <span
              key={i}
              className="rounded-md bg-zinc-100/90 border border-zinc-200/60 px-2 py-0.5 text-[10px] font-medium text-zinc-600"
            >
              {spec}
            </span>
          ))}
        </div>
      </div>

      {/* Pricing & Action Footer */}
      <div className="mt-4 pt-3.5 border-t border-zinc-100 flex items-end justify-between gap-2">
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
        <Link to={`/products/${product.id}`}>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl px-3 py-1.5 text-xs font-semibold border-zinc-200 text-zinc-900 group-hover:bg-zinc-950 group-hover:text-white group-hover:border-zinc-950 transition-colors gap-1"
          >
            <span>Chi tiết</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </article>
  )
}
