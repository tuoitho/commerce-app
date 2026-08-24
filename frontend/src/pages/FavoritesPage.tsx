import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Heart,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { favoritesApi } from '@/api/favorites'
import type { FavoriteProductSummary, PaginationMeta } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { useFavorites } from '@/context/FavoritesContext'
import { useToast } from '@/context/ToastContext'
import { formatVND } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { FavoriteButton } from '@/components/FavoriteButton'

export function FavoritesPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const { mutate } = useFavorites()
  const { success, error: toastError } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const rawPage = parseInt(searchParams.get('page') || '1', 10)
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage
  const limit = 12

  const [items, setItems] = useState<FavoriteProductSummary[]>([])
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Route protection
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate('/login?redirect=%2Ffavorites', { replace: true })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  const loadFavorites = useCallback(
    async (targetPage: number) => {
      if (!isAuthenticated) return

      setIsLoading(true)
      setError(null)

      try {
        const res = await favoritesApi.listFavorites(targetPage, limit)
        const paginationMeta = res.meta.pagination as PaginationMeta

        // Handle out-of-range recovery
        if (paginationMeta) {
          const totalPages = paginationMeta.totalPages
          if (totalPages > 0 && targetPage > totalPages) {
            setSearchParams({ page: String(totalPages) }, { replace: true })
            return
          }
          if (totalPages === 0 && targetPage > 1) {
            setSearchParams({ page: '1' }, { replace: true })
            return
          }
        }

        setItems(res.data || [])
        setPagination(paginationMeta || null)
      } catch (err: unknown) {
        console.error('Failed to fetch favorites', err)
        setError('Không thể tải danh sách yêu thích. Vui lòng thử lại sau.')
      } finally {
        setIsLoading(false)
      }
    },
    [isAuthenticated, limit, setSearchParams]
  )

  useEffect(() => {
    if (isAuthenticated) {
      loadFavorites(page)
    }
  }, [isAuthenticated, page, loadFavorites])

  const handlePageChange = (newPage: number) => {
    if (newPage === page || (pagination && (newPage < 1 || newPage > pagination.totalPages))) {
      return
    }
    setSearchParams({ page: String(newPage) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleRemoveFavorite = async (productId: string) => {
    const outcome = await mutate({ productId, nextState: false })
    if (outcome.kind === 'confirmed') {
      success('Đã bỏ yêu thích', 'Sản phẩm đã được xóa khỏi danh sách yêu thích.')
      // Refetch current page to maintain authoritative pagination metadata
      loadFavorites(page)
    } else if (outcome.kind === 'failed') {
      toastError(
        'Không thể xóa yêu thích',
        'Đã xảy ra lỗi khi cập nhật danh sách yêu thích. Vui lòng thử lại.'
      )
    }
  }

  // Auth loading state
  if (isAuthLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-64 rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-full rounded-3xl" />
          ))}
        </div>
      </div>
    )
  }

  // Unauthenticated (will be redirected by useEffect, render skeleton in the meantime)
  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-[80vh] py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-100 shadow-2xs">
                <Heart className="h-5 w-5 fill-rose-500 text-rose-500" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Danh sách yêu thích
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Quản lý các sản phẩm điện thoại bạn đã lưu để theo dõi và mua sắm dễ dàng hơn
            </p>
          </div>

          {pagination && pagination.total > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 self-start sm:self-auto">
              <span>Tổng cộng:</span>
              <span className="text-emerald-700 font-extrabold">{pagination.total} sản phẩm</span>
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-fade-in">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-4 space-y-4 shadow-xs"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-5 w-20 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                  <Skeleton className="h-44 w-full rounded-2xl" />
                  <Skeleton className="h-5 w-3/4 rounded-md" />
                  <Skeleton className="h-4 w-1/2 rounded-md" />
                </div>
                <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                  <Skeleton className="h-6 w-28 rounded-md" />
                  <Skeleton className="h-8 w-20 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="py-16 text-center max-w-md mx-auto space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 mx-auto border border-rose-200 shadow-xs">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Không thể tải dữ liệu</h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">{error}</p>
            <Button
              variant="default"
              onClick={() => loadFavorites(page)}
              className="gap-2 rounded-xl font-bold bg-slate-900 hover:bg-emerald-600"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Thử lại</span>
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && items.length === 0 && (
          <EmptyState
            icon={<Heart className="h-8 w-8 text-rose-400" />}
            title="Chưa có sản phẩm yêu thích nào"
            description="Hãy duyệt qua danh mục điện thoại AuraPhone và nhấn vào biểu tượng trái tim để lưu lại những mẫu điện thoại bạn yêu thích."
            actionLabel="Khám phá điện thoại ngay"
            actionLink="/products"
          />
        )}

        {/* Populated Grid */}
        {!isLoading && !error && items.length > 0 && (
          <div className="space-y-10 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {items.map((item) => {
                const isInactive = item.active === false
                const minPrice = item.minPriceVnd || item.price
                const maxPrice = item.maxPriceVnd || item.price
                const isPriceRange = minPrice && maxPrice && minPrice !== maxPrice
                const formattedPrice = isPriceRange
                  ? `${formatVND(minPrice)} - ${formatVND(maxPrice)}`
                  : formatVND(minPrice || 0)

                return (
                  <div
                    key={item.id}
                    className={`relative flex flex-col justify-between rounded-3xl border bg-white p-4 sm:p-5 shadow-xs transition-all duration-300 ${
                      isInactive
                        ? 'border-slate-200/90 opacity-80 bg-slate-50/60'
                        : 'border-slate-200/90 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-950/10'
                    }`}
                  >
                    <div>
                      {/* Top Badges & Remove Button */}
                      <div className="flex items-center justify-between gap-1.5 mb-2.5">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="brand"
                            className="font-bold text-[11px] px-2.5 py-0.5 shadow-2xs"
                          >
                            {item.brand || 'Smartphone'}
                          </Badge>
                          {isInactive ? (
                            <Badge variant="destructive" className="text-[10px] py-0.5 px-2 font-bold">
                              Ngừng kinh doanh
                            </Badge>
                          ) : item.inStock ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Còn hàng
                            </span>
                          ) : (
                            <Badge variant="destructive" className="text-[10px] py-0 px-2">
                              Hết hàng
                            </Badge>
                          )}
                        </div>

                        {/* Favorite Toggle Button */}
                        <FavoriteButton
                          productId={item.id}
                          initialIsFavorite={true}
                          surface="product-card"
                          className="h-8 w-8 shrink-0"
                        />
                      </div>

                      {/* Product Image */}
                      {isInactive ? (
                        <div className="relative my-2.5 flex h-48 w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-100/60 p-4 select-none">
                          <img
                            src={item.primaryImageUrl || '/iphone-16-pro.jpg'}
                            alt={`${item.brand || ''} ${item.name}`.trim()}
                            className="max-h-full max-w-full object-contain grayscale opacity-60"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <Link
                          to={`/products/${item.id}`}
                          className="relative my-2.5 flex h-48 w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:bg-emerald-50/30"
                        >
                          <img
                            src={item.primaryImageUrl || '/iphone-16-pro.jpg'}
                            alt={`${item.brand || ''} ${item.name}`.trim()}
                            className="max-h-full max-w-full object-contain transition-transform duration-300 hover:scale-105"
                            loading="lazy"
                          />
                        </Link>
                      )}

                      {/* Product Title */}
                      <div className="pt-1.5">
                        {isInactive ? (
                          <h3 className="font-bold text-slate-500 text-sm sm:text-base leading-snug line-clamp-1">
                            {item.name}
                          </h3>
                        ) : (
                          <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug line-clamp-1 hover:text-emerald-600 transition-colors">
                            <Link to={`/products/${item.id}`}>{item.name}</Link>
                          </h3>
                        )}

                        {item.model && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[11px] font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              {item.model}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pricing & Actions */}
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <span
                            className={`font-extrabold text-base sm:text-lg tracking-tight tabular-nums block ${
                              isInactive ? 'text-slate-400 line-through' : 'text-rose-600'
                            }`}
                          >
                            {formattedPrice}
                          </span>
                        </div>

                        {isInactive ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveFavorite(item.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition"
                            title="Bỏ khỏi yêu thích"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Xóa</span>
                          </button>
                        ) : (
                          <Link to={`/products/${item.id}`}>
                            <Button
                              variant="default"
                              size="sm"
                              className="rounded-xl px-3 py-1.5 text-xs font-bold bg-slate-900 hover:bg-emerald-600 text-white shadow-xs gap-1"
                            >
                              <span>Chi tiết</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination Controls */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200 text-xs font-medium text-slate-600">
                <div>
                  Trang <strong className="text-slate-900">{pagination.page}</strong> /{' '}
                  <strong className="text-slate-900">{pagination.totalPages}</strong> (
                  {pagination.total} sản phẩm)
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasPrev || pagination.page <= 1}
                    onClick={() => handlePageChange(pagination.page - 1)}
                    className="h-9 px-3 rounded-xl border-slate-300 gap-1 font-bold text-xs"
                    aria-label="Trang trước"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Trước</span>
                  </Button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => {
                      const isActive = p === pagination.page
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handlePageChange(p)}
                          className={`h-9 w-9 rounded-xl font-bold text-xs transition-all ${
                            isActive
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasNext || pagination.page >= pagination.totalPages}
                    onClick={() => handlePageChange(pagination.page + 1)}
                    className="h-9 px-3 rounded-xl border-slate-300 gap-1 font-bold text-xs"
                    aria-label="Trang sau"
                  >
                    <span>Sau</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
