import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Heart,
  ShoppingBag,
  ArrowUpRight,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useFavorites } from '@/context/FavoritesContext'
import type { FavoriteProduct } from '@/types/favorite'
import { formatVND } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { FavoriteToggleButton } from '@/components/FavoriteToggleButton'

interface FavoriteCardProps {
  item: FavoriteProduct
}

function FavoriteCard({ item }: FavoriteCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const isActive = item.availability === 'active'
  const isDeleted = item.availability === 'deleted'
  const isUnavailable = item.availability === 'unavailable'

  const minPrice = item.minPriceVnd
  const maxPrice = item.maxPriceVnd
  const isPriceRange = minPrice && maxPrice && minPrice !== maxPrice
  const formattedPrice = isPriceRange
    ? `${formatVND(minPrice)} - ${formatVND(maxPrice)}`
    : minPrice
    ? formatVND(minPrice)
    : ''

  return (
    <article className="group relative flex h-full flex-col justify-between rounded-2xl border border-zinc-200/90 bg-white p-4 sm:p-5 transition-all duration-300 hover:border-zinc-900 hover:shadow-lg hover:shadow-zinc-950/5">
      <div>
        {/* Top Metadata & Availability Status */}
        <div className="flex items-center justify-between gap-1.5 mb-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <Badge
              variant="outline"
              className="font-mono uppercase tracking-wider text-[10px] px-2 py-0.5 border-zinc-200 text-zinc-700 bg-zinc-50 truncate"
            >
              {item.brand || 'Smartphone'}
            </Badge>
          </div>

          {isActive && (
            item.inStock ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50/90 px-2 py-0.5 rounded-md border border-emerald-200/80 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                Còn hàng
              </span>
            ) : (
              <Badge variant="destructive" className="text-[10px] py-0.5 px-2 shrink-0">
                Hết hàng
              </Badge>
            )
          )}

          {isDeleted && (
            <Badge variant="destructive" className="text-[10px] font-semibold py-0.5 px-2 shrink-0">
              Sản phẩm đã bị xóa
            </Badge>
          )}

          {isUnavailable && (
            <Badge variant="secondary" className="text-[10px] font-semibold py-0.5 px-2 bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
              Sản phẩm hiện không khả dụng
            </Badge>
          )}
        </div>

        {/* Product Image Container */}
        <div className="relative my-2">
          {isActive ? (
            <Link
              to={`/products/${item.id}`}
              className="relative flex h-48 sm:h-52 w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-100 bg-[#f7f7f5] p-5 transition-colors duration-300 group-hover:bg-zinc-100/70"
            >
              {!imageFailed && item.primaryImageUrl ? (
                <img
                  src={item.primaryImageUrl}
                  alt={`${item.brand || ''} ${item.name} ${item.model ?? ''}`.trim()}
                  className="max-h-full max-w-full object-contain transition-transform duration-500 ease-out group-hover:scale-105"
                  onError={() => setImageFailed(true)}
                  loading="lazy"
                />
              ) : (
                <img
                  src="/iphone-16-pro.jpg"
                  alt={`${item.brand || ''} ${item.name} ${item.model ?? ''}`.trim()}
                  className="max-h-full max-w-full object-contain transition-transform duration-500 ease-out group-hover:scale-105"
                  loading="lazy"
                />
              )}
            </Link>
          ) : (
            <div className="relative flex h-48 sm:h-52 w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100/70 p-5 opacity-75">
              {!imageFailed && item.primaryImageUrl ? (
                <img
                  src={item.primaryImageUrl}
                  alt={`${item.brand || ''} ${item.name} ${item.model ?? ''}`.trim()}
                  className="max-h-full max-w-full object-contain grayscale-30"
                  onError={() => setImageFailed(true)}
                  loading="lazy"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-zinc-400">
                  <Smartphone className="h-12 w-12 stroke-[1.5]" />
                </div>
              )}
            </div>
          )}

          <div className="absolute top-2.5 right-2.5 z-20">
            <FavoriteToggleButton
              productId={item.id}
              productName={item.name}
              size="sm"
            />
          </div>
        </div>

        {/* Product Title & Info */}
        <div className="pt-2">
          <h3 className="font-bold text-zinc-950 text-sm sm:text-base leading-snug line-clamp-1 group-hover:text-emerald-700 transition-colors">
            {isActive ? (
              <Link to={`/products/${item.id}`}>{item.name}</Link>
            ) : (
              <span>{item.name}</span>
            )}
          </h3>

          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {item.model && (
              <span className="text-[11px] font-mono font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                {item.model}
              </span>
            )}
            {item.category && item.category.name && (
              <>
                <span className="text-[10px] text-zinc-300">•</span>
                <span className="text-[11px] text-zinc-500 font-medium truncate max-w-[120px]">
                  {item.category.name}
                </span>
              </>
            )}
            {isActive && (
              <>
                <span className="text-[10px] text-zinc-300">•</span>
                <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                  <ShieldCheck className="h-3 w-3 text-emerald-700" /> VNA Chính hãng
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Pricing / Action Bottom Area */}
      <div className="mt-4 pt-3.5 border-t border-zinc-100">
        {isActive ? (
          <div className="flex items-end justify-between gap-2">
            <div>
              <span className="font-mono font-bold text-zinc-950 text-base sm:text-lg tracking-tight tabular-nums block">
                {formattedPrice}
              </span>
            </div>
            <Link to={`/products/${item.id}`}>
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
        ) : (
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium py-1.5">
            <span>Không thể đặt mua</span>
          </div>
        )}
      </div>
    </article>
  )
}

export function FavoritesPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const { items, isLoading: isFavoritesLoading, loadError, refresh } = useFavorites()

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate('/login?redirect=/favorites')
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#f7f7f5] pb-24">
        <div className="border-b border-zinc-200 bg-white py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-4">
            <Skeleton className="h-8 w-64 rounded-xl" />
            <Skeleton className="h-5 w-96 rounded-lg" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-24">
      {/* Page Header */}
      <div className="border-b border-zinc-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 flex items-center gap-2.5">
                <span>Sản phẩm yêu thích</span>
                <Heart className="h-5 w-5 text-rose-500 fill-rose-500" />
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500 mt-1">
                Quản lý và theo dõi danh sách các sản phẩm điện thoại bạn quan tâm tại AuraPhone
              </p>
            </div>
            <Link to="/products">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl font-semibold gap-1.5 self-start sm:self-auto"
              >
                <ShoppingBag className="h-4 w-4" />
                <span>Tiếp tục mua sắm</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {isFavoritesLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6" aria-busy="true">
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        ) : loadError ? (
          <div className="p-8 rounded-2xl border border-rose-200 bg-white text-center space-y-4 max-w-lg mx-auto">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-950">Lỗi tải danh sách yêu thích</h3>
              <p className="text-xs sm:text-sm text-zinc-600">{loadError}</p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => void refresh()}
              className="rounded-xl font-semibold gap-1.5 bg-zinc-950 hover:bg-emerald-700 text-white"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Thử lại</span>
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-12">
            <EmptyState
              icon={<Heart className="h-7 w-7 text-zinc-500" />}
              title="Chưa có sản phẩm yêu thích"
              description="Bạn chưa lưu sản phẩm nào vào danh sách yêu thích. Hãy khám phá ngay các dòng điện thoại mới nhất và lưu lại sản phẩm bạn quan tâm!"
              actionLabel="Khám phá sản phẩm ngay"
              actionLink="/products"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
            {items.map((item) => (
              <FavoriteCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default FavoritesPage
