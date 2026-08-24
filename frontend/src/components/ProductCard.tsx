import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Zap, ShieldCheck } from 'lucide-react'
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
    return ['OLED 120Hz', 'Chip A-Series Pro', 'Camera 48MP', 'Titanium']
  }
  if (lower.includes('16e') || lower.includes('15') || lower.includes('iphone')) {
    return ['OLED Retina', 'Chip Apple', 'Camera kép 48MP', 'Pin cả ngày']
  }
  if (lower.includes('xiaomi 15') || lower.includes('xiaomi 14')) {
    return ['AMOLED 1.5K 120Hz', 'Snapdragon 8 Elite', 'Ống kính Leica', 'Sạc 90W']
  }
  if (lower.includes('redmi')) {
    return ['Màn hình 120Hz', 'Pin 5000mAh', 'Camera 50MP AI', 'Sạc nhanh']
  }
  return ['Chính hãng 100%', 'Màn hình sắc nét', 'Hỗ trợ 5G', 'Bảo hành 12T']
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

  // Price formatting
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

  return (
    <div className="group relative flex flex-col justify-between">
      {/* Ambient underlay gradient glow (Tấm nền lót màu loang ngọc bích phát sáng khi hover) */}
      <div
        className="pointer-events-none absolute -inset-1 rounded-[28px] bg-gradient-to-br from-emerald-500/25 via-teal-400/20 to-cyan-500/20 opacity-0 blur-md transition-all duration-500 group-hover:opacity-100 group-hover:blur-xl"
        aria-hidden="true"
      />

      {/* Main Card Surface */}
      <div className="relative z-10 flex h-full flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs transition-all duration-300 group-hover:-translate-y-2 group-hover:border-emerald-300 group-hover:shadow-xl group-hover:shadow-emerald-950/10">
        {/* Top Badges & Promo */}
        <div>
          <div className="flex items-center justify-between gap-1.5 mb-2.5">
            <div className="flex items-center gap-1.5">
              <Badge variant="brand" className="font-bold text-[11px] px-2.5 py-0.5 shadow-2xs">
                {product.brand || 'Smartphone'}
              </Badge>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                <Zap className="h-2.5 w-2.5" />
                Góp 0%
              </span>
            </div>

            {product.inStock ? (
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Còn hàng
              </span>
            ) : (
              <Badge variant="destructive" className="text-[10px] py-0 px-2">
                Hết hàng
              </Badge>
            )}
          </div>

          {/* Studio Image Container with Light Sheen Sweep Effect */}
          <div className="relative my-2.5">
            <Link
              to={`/products/${product.id}`}
              className="relative flex h-48 sm:h-52 w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/70 p-4 transition-all duration-300 group-hover:border-emerald-200/80 group-hover:bg-gradient-to-b group-hover:from-emerald-50/30 group-hover:to-slate-50"
            >
              {/* Single-pass light sheen sweep on hover (Phát tia sáng quét qua khi hover) */}
              <div
                className="pointer-events-none absolute -inset-full top-0 block -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-0 transition-all duration-700 ease-out group-hover:opacity-100 group-hover:translate-x-[260%]"
                aria-hidden="true"
              />

              {!imageFailed && product.primaryImageUrl ? (
                <img
                  src={product.primaryImageUrl}
                  alt={`${product.brand || ''} ${product.name} ${product.model ?? ''}`.trim()}
                  className="max-h-full max-w-full object-contain transition-transform duration-500 ease-out group-hover:scale-108 group-hover:-translate-y-1"
                  onError={() => setImageFailed(true)}
                  loading="lazy"
                />
              ) : (
                <img
                  src="/iphone-16-pro.jpg"
                  alt={`${product.brand || ''} ${product.name} ${product.model ?? ''}`.trim()}
                  className="max-h-full max-w-full object-contain transition-transform duration-500 ease-out group-hover:scale-108 group-hover:-translate-y-1"
                  loading="lazy"
                />
              )}

              {/* Color Preview Swatches (Overlay on Image Bottom) */}
              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 backdrop-blur-xs border border-slate-200/80 shadow-xs">
                {colors.map((c, i) => (
                  <span
                    key={i}
                    className="h-2 w-2 rounded-full border border-black/15 shadow-2xs"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </Link>

            {/* Favorite Toggle Button in top-right of image container */}
            <div className="absolute top-2 right-2 z-20">
              <FavoriteToggleButton
                productId={product.id}
                productName={product.name}
                size="sm"
              />
            </div>
          </div>

          {/* Product Title & Lineage */}
          <div className="pt-1.5">
            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug line-clamp-1 group-hover:text-emerald-600 transition-colors">
              <Link to={`/products/${product.id}`}>{product.name}</Link>
            </h3>
            {product.model && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[11px] font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                  {product.model}
                </span>
                <span className="text-[10px] text-slate-300">•</span>
                <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                  <ShieldCheck className="h-3 w-3 text-emerald-600" /> VNA Chính hãng
                </span>
              </div>
            )}
          </div>

          {/* Quick Specs Tags */}
          <div className="mt-2.5 flex flex-wrap gap-1">
            {specs.map((spec, i) => (
              <span
                key={i}
                className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-800 transition-colors"
              >
                {spec}
              </span>
            ))}
          </div>
        </div>

        {/* Pricing & Interactive Action Area */}
        <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
          <div className="flex items-end justify-between gap-2">
            <div>
              <span className="font-extrabold text-rose-600 text-base sm:text-lg tracking-tight tabular-nums block">
                {formattedPrice}
              </span>
              {installmentEstimate > 0 && (
                <span className="block text-[10px] text-slate-400 font-medium">
                  Góp từ ~{formatVND(installmentEstimate)}/tháng
                </span>
              )}
            </div>
            <Link to={`/products/${product.id}`}>
              <Button
                variant="default"
                size="sm"
                className="rounded-xl px-3.5 py-1.5 text-xs font-bold bg-slate-900 group-hover:bg-emerald-600 text-white shadow-xs group-hover:shadow-md group-hover:shadow-emerald-600/25 transition-all gap-1"
              >
                <span>Chi tiết</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
