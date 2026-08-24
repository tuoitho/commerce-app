import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Heart,
  ShoppingBag,
  ArrowRight,
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

  // Price calculation for active items only
  const minPrice = item.minPriceVnd
  const maxPrice = item.maxPriceVnd
  const isPriceRange = minPrice && maxPrice && minPrice !== maxPrice
  const formattedPrice = isPriceRange
    ? `${formatVND(minPrice)} - ${formatVND(maxPrice)}`
    : minPrice
    ? formatVND(minPrice)
    : ''

  return (
    <div className="group relative flex flex-col justify-between">
      {/* Ambient underlay gradient glow */}
      <div
        className="pointer-events-none absolute -inset-1 rounded-[28px] bg-gradient-to-br from-emerald-500/20 via-teal-400/15 to-cyan-500/15 opacity-0 blur-md transition-all duration-500 group-hover:opacity-100 group-hover:blur-xl"
        aria-hidden="true"
      />

      {/* Main Card Surface */}
      <div className="relative z-10 flex h-full flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs transition-all duration-300 group-hover:-translate-y-1.5 group-hover:border-emerald-300 group-hover:shadow-xl group-hover:shadow-emerald-950/10">
        <div>
          {/* Top Badges & Availability Status */}
          <div className="flex items-center justify-between gap-1.5 mb-2.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Badge variant="brand" className="font-bold text-[11px] px-2.5 py-0.5 shadow-2xs truncate">
                {item.brand || 'Smartphone'}
              </Badge>
            </div>

            {/* Availability Indicator */}
            {isActive && (
              item.inStock ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-100 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Còn hàng
                </span>
              ) : (
                <Badge variant="destructive" className="text-[10px] py-0 px-2 shrink-0">
                  Hết hàng
                </Badge>
              )
            )}

            {isDeleted && (
              <Badge variant="destructive" className="text-[10px] font-bold py-0.5 px-2 bg-rose-600 shrink-0">
                Sản phẩm đã bị xóa
              </Badge>
            )}

            {isUnavailable && (
              <Badge variant="secondary" className="text-[10px] font-bold py-0.5 px-2 bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                Sản phẩm hiện không khả dụng
              </Badge>
            )}
          </div>

          {/* Product Image Container */}
          <div className="relative my-2.5">
            {isActive ? (
              <Link
                to={`/products/${item.id}`}
                className="relative flex h-48 sm:h-52 w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/70 p-4 transition-all duration-300 group-hover:border-emerald-200/80 group-hover:bg-gradient-to-b group-hover:from-emerald-50/30 group-hover:to-slate-50"
              >
                {!imageFailed && item.primaryImageUrl ? (
                  <img
                    src={item.primaryImageUrl}
                    alt={`${item.brand || ''} ${item.name} ${item.model ?? ''}`.trim()}
                    className="max-h-full max-w-full object-contain transition-transform duration-500 ease-out group-hover:scale-108 group-hover:-translate-y-1"
                    onError={() => setImageFailed(true)}
                    loading="lazy"
                  />
                ) : (
                  <img
                    src="/iphone-16-pro.jpg"
                    alt={`${item.brand || ''} ${item.name} ${item.model ?? ''}`.trim()}
                    className="max-h-full max-w-full object-contain transition-transform duration-500 ease-out group-hover:scale-108 group-hover:-translate-y-1"
                    loading="lazy"
                  />
                )}
              </Link>
            ) : (
              <div className="relative flex h-48 sm:h-52 w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-100/60 p-4 opacity-75">
                {!imageFailed && item.primaryImageUrl ? (
                  <img
                    src={item.primaryImageUrl}
                    alt={`${item.brand || ''} ${item.name} ${item.model ?? ''}`.trim()}
                    className="max-h-full max-w-full object-contain grayscale-30"
                    onError={() => setImageFailed(true)}
                    loading="lazy"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <Smartphone className="h-12 w-12 stroke-[1.5]" />
                  </div>
                )}
              </div>
            )}

            {/* Favorite Toggle Button in top-right */}
            <div className="absolute top-2 right-2 z-20">
              <FavoriteToggleButton
                productId={item.id}
                productName={item.name}
                size="sm"
              />
            </div>
          </div>

          {/* Product Title & Info */}
          <div className="pt-1.5">
            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug line-clamp-1 group-hover:text-emerald-600 transition-colors">
              {isActive ? (
                <Link to={`/products/${item.id}`}>{item.name}</Link>
              ) : (
                <span>{item.name}</span>
              )}
            </h3>

            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {item.model && (
                <span className="text-[11px] font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                  {item.model}
                </span>
              )}
              {item.category && item.category.name && (
                <>
                  <span className="text-[10px] text-slate-300">•</span>
                  <span className="text-[11px] text-slate-500 font-medium truncate max-w-[120px]">
                    {item.category.name}
                  </span>
                </>
              )}
              {isActive && (
                <>
                  <span className="text-[10px] text-slate-300">•</span>
                  <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                    <ShieldCheck className="h-3 w-3 text-emerald-600" /> VNA Chính hãng
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Pricing / Action Bottom Area */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          {isActive ? (
            <div className="flex items-end justify-between gap-2">
              <div>
                <span className="font-extrabold text-rose-600 text-base sm:text-lg tracking-tight tabular-nums block">
                  {formattedPrice}
                </span>
              </div>
              <Link to={`/products/${item.id}`}>
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
          ) : (
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium py-1.5">
              <span className="italic">Không thể đặt mua</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function FavoritesPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const { items, isLoading: isFavoritesLoading, loadError, refresh } = useFavorites()

  // Protect route for unauthenticated guests
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate('/login?redirect=/favorites')
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  // Auth Loading Skeleton
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50/60 pb-24">
        <div className="border-b border-slate-200 bg-white py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-4">
            <Skeleton className="h-8 w-64 rounded-xl" />
            <Skeleton className="h-5 w-96 rounded-lg" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
            <Skeleton className="h-80 w-full rounded-3xl" />
            <Skeleton className="h-80 w-full rounded-3xl" />
            <Skeleton className="h-80 w-full rounded-3xl" />
            <Skeleton className="h-80 w-full rounded-3xl" />
          </div>
        </div>
      </div>
    )
  }

  // Not authenticated (will redirect via useEffect)
  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-50/60 pb-24">
      {/* Page Header */}
      <div className="border-b border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
                <span>Sản phẩm yêu thích</span>
                <Heart className="h-6 w-6 text-rose-500 fill-rose-500" />
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
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
          /* Favorites Loading Skeleton */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6" aria-busy="true">
            <Skeleton className="h-80 w-full rounded-3xl" />
            <Skeleton className="h-80 w-full rounded-3xl" />
            <Skeleton className="h-80 w-full rounded-3xl" />
            <Skeleton className="h-80 w-full rounded-3xl" />
          </div>
        ) : loadError ? (
          /* Error & Retry State */
          <div className="p-8 rounded-3xl border border-rose-200 bg-rose-50/50 text-center space-y-4 max-w-lg mx-auto">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 mx-auto">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Lỗi tải danh sách yêu thích</h3>
              <p className="text-xs sm:text-sm text-slate-600">{loadError}</p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => void refresh()}
              className="rounded-xl font-semibold gap-1.5 bg-slate-900 hover:bg-emerald-600 text-white"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Thử lại</span>
            </Button>
          </div>
        ) : items.length === 0 ? (
          /* Empty State */
          <div className="py-12">
            <EmptyState
              icon={<Heart className="h-8 w-8 text-slate-400" />}
              title="Chưa có sản phẩm yêu thích"
              description="Bạn chưa lưu sản phẩm nào vào danh sách yêu thích. Hãy khám phá ngay các dòng điện thoại mới nhất và lưu lại sản phẩm bạn quan tâm!"
              actionLabel="Khám phá sản phẩm ngay"
              actionLink="/products"
            />
          </div>
        ) : (
          /* Favorites Grid */
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
