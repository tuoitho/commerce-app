import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Star,
  ShoppingBag,
  RefreshCw,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Edit3,
  X,
  AlertTriangle,
  Package,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { getUserReviews } from '@/api/reviews'
import type {
  UserReview,
  PaginationMeta,
  OrderItem,
  Review,
} from '@/api/types'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { ReviewFormDialog } from '@/components/ReviewFormDialog'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface RatingTab {
  rating: number
  label: string
}

const RATING_TABS: RatingTab[] = [
  { rating: 0, label: 'Tất cả' },
  { rating: 5, label: '5 sao' },
  { rating: 4, label: '4 sao' },
  { rating: 3, label: '3 sao' },
  { rating: 2, label: '2 sao' },
  { rating: 1, label: '1 sao' },
]

export function ReviewHistoryPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const ratingParam = searchParams.get('rating')
  const currentRating = ratingParam ? Math.max(0, Math.min(5, parseInt(ratingParam, 10) || 0)) : 0

  const pageParam = searchParams.get('page')
  const currentPage = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1

  const [reviews, setReviews] = useState<UserReview[]>([])
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Media preview lightbox state
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)

  // Edit review state
  const [editingReview, setEditingReview] = useState<UserReview | null>(null)

  // Redirect if unauthenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login?redirect=/reviews')
    }
  }, [authLoading, isAuthenticated, navigate])

  // Fetch reviews
  const fetchReviews = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      setIsLoading(true)
      setError(null)
      const res = await getUserReviews({
        rating: currentRating > 0 ? currentRating : undefined,
        page: currentPage,
        limit: 10,
      })
      setReviews(res.data.reviews || [])
      setPagination(res.meta?.pagination || null)
    } catch {
      setError('Không thể tải danh sách đánh giá. Vui lòng thử lại.')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, currentRating, currentPage])

  useEffect(() => {
    if (isAuthenticated) {
      fetchReviews()
    }
  }, [isAuthenticated, fetchReviews])

  const handleRatingChange = (rating: number) => {
    const nextParams = new URLSearchParams(searchParams)
    if (rating === 0) {
      nextParams.delete('rating')
    } else {
      nextParams.set('rating', String(rating))
    }
    nextParams.delete('page') // Reset to page 1
    setSearchParams(nextParams)
  }

  const handlePageChange = (newPage: number) => {
    const nextParams = new URLSearchParams(searchParams)
    if (newPage <= 1) {
      nextParams.delete('page')
    } else {
      nextParams.set('page', String(newPage))
    }
    setSearchParams(nextParams)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleEditSuccess = (savedReview: Review) => {
    setReviews((prev) =>
      prev.map((r) => {
        if (r.id !== savedReview.id) return r
        return {
          ...r,
          rating: savedReview.rating,
          comment: savedReview.comment,
          editCount: savedReview.editCount,
          canEdit: savedReview.canEdit,
          edited: true,
          media: savedReview.media,
          updatedAt: savedReview.updatedAt,
        }
      })
    )
    setEditingReview(null)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50/60 pb-24">
        <div className="border-b border-slate-200 bg-white py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-4">
            <Skeleton className="h-8 w-64 rounded-xl" />
            <Skeleton className="h-5 w-96 rounded-lg" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
          <Skeleton className="h-12 w-full rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-3xl" />
            <Skeleton className="h-48 w-full rounded-3xl" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50/60 pb-24">
      {/* Page Header */}
      <div className="border-b border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                Lịch sử đánh giá
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Xem lại và quản lý các đánh giá sản phẩm bạn đã gửi tại AuraPhone
              </p>
            </div>
            <div className="flex items-center gap-2.5 self-start sm:self-auto">
              <Link to="/orders?status=reviewable">
                <Button variant="outline" size="sm" className="rounded-xl font-semibold gap-1.5 text-xs text-amber-900 bg-amber-50/60 border-amber-300 hover:bg-amber-100">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                  <span>Đơn chờ đánh giá</span>
                </Button>
              </Link>
              <Link to="/products">
                <Button variant="outline" size="sm" className="rounded-xl font-semibold gap-1.5 text-xs">
                  <ShoppingBag className="h-4 w-4" />
                  <span>Tiếp tục mua sắm</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Rating Filter Tabs */}
        <div className="border-b border-slate-200 bg-white rounded-2xl shadow-2xs p-1.5 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 min-w-max" role="tablist" aria-label="Bộ lọc số sao đánh giá">
            {RATING_TABS.map((tab) => {
              const isSelected = currentRating === tab.rating
              return (
                <button
                  key={tab.rating}
                  role="tab"
                  aria-selected={isSelected}
                  type="button"
                  onClick={() => handleRatingChange(tab.rating)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {tab.rating > 0 && (
                    <Star
                      className={`h-4 w-4 ${
                        isSelected ? 'fill-white text-white' : 'fill-amber-400 text-amber-500'
                      }`}
                    />
                  )}
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Content Section */}
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-3xl" />
            <Skeleton className="h-48 w-full rounded-3xl" />
            <Skeleton className="h-48 w-full rounded-3xl" />
          </div>
        ) : error ? (
          <div className="p-8 rounded-3xl border border-rose-200 bg-rose-50/50 text-center space-y-4 max-w-lg mx-auto">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 mx-auto">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Lỗi tải dữ liệu</h3>
              <p className="text-xs sm:text-sm text-slate-600">{error}</p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={fetchReviews}
              className="rounded-xl font-semibold gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Thử lại</span>
            </Button>
          </div>
        ) : reviews.length === 0 ? (
          /* Empty State */
          <div className="py-12">
            {currentRating === 0 ? (
              <EmptyState
                icon={<Star className="h-8 w-8 text-amber-500 fill-amber-400" />}
                title="Chưa có đánh giá nào"
                description="Bạn chưa gửi đánh giá nào cho các sản phẩm đã mua tại AuraPhone. Hãy chia sẻ cảm nhận để giúp mọi người mua sắm tốt hơn!"
                actionLabel="Xem đơn chờ đánh giá"
                actionLink="/orders?status=reviewable"
              />
            ) : (
              <EmptyState
                icon={<Star className="h-8 w-8 text-amber-500 fill-amber-400" />}
                title={`Chưa có đánh giá ${currentRating} sao nào`}
                description="Bạn chưa có đánh giá nào khớp với bộ lọc số sao này."
                actionLabel="Xem tất cả đánh giá"
                onAction={() => handleRatingChange(0)}
              />
            )}
          </div>
        ) : (
          /* Reviews List */
          <div className="space-y-4">
            {reviews.map((rev) => {
              const images = rev.media?.filter((m) => m.type === 'image') || []
              const video = rev.media?.find((m) => m.type === 'video')

              return (
                <div
                  key={rev.id}
                  className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all space-y-4"
                >
                  {/* Card Header: Order info & Review timestamps */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
                      <Link
                        to={`/orders/${rev.order.id}`}
                        className="inline-flex items-center gap-1 font-mono font-bold text-slate-800 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 px-2.5 py-1 rounded-lg transition-colors"
                        title="Xem chi tiết đơn hàng này"
                      >
                        <Package className="h-3.5 w-3.5 text-slate-400" />
                        <span>Mã đơn: {rev.order.id}</span>
                        <ExternalLink className="h-3 w-3 text-slate-400 ml-0.5" />
                      </Link>
                      <span className="text-slate-400 font-sans">
                        Ngày đặt: {formatDateTime(rev.order.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        Đánh giá ngày: {formatDateTime(rev.createdAt)}
                      </span>
                      {rev.edited && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-slate-100 text-slate-600 border-slate-200 font-medium px-2 py-0.5"
                        >
                          Đã chỉnh sửa
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Product Info Section */}
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-50 border border-slate-100 p-1.5 overflow-hidden">
                      {rev.product.imageUrl ? (
                        <img
                          src={rev.product.imageUrl}
                          alt={rev.product.name}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <Smartphone className="h-6 w-6 text-slate-300" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {rev.product.brandName}
                        </span>
                        {rev.product.model && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({rev.product.model})
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                        <Link
                          to={`/products/${rev.product.id}`}
                          className="hover:text-emerald-600 transition-colors inline-flex items-center gap-1"
                        >
                          <span>{rev.product.name}</span>
                          <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        </Link>
                      </h3>

                      {rev.product.options && rev.product.options.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {rev.product.options.map((opt, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium"
                            >
                              {opt.groupLabel}: <strong className="text-slate-800">{opt.valueLabel}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Review Content & Star Rating */}
                  <div className="rounded-2xl bg-slate-50/70 p-4 border border-slate-100 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-4 w-4 ${
                              star <= rev.rating
                                ? 'fill-amber-400 text-amber-500'
                                : 'fill-slate-200 text-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-slate-800">
                        {rev.rating}/5 sao
                      </span>
                    </div>

                    {rev.comment && (
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                        {rev.comment}
                      </p>
                    )}

                    {/* Media Attachments */}
                    {(images.length > 0 || video) && (
                      <div className="pt-1 space-y-2">
                        {images.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {images.map((img) => (
                              <button
                                key={img.id}
                                type="button"
                                onClick={() => setPreviewImageUrl(img.url)}
                                className="relative h-20 w-20 rounded-xl overflow-hidden border border-slate-200 hover:border-emerald-500 transition-all cursor-pointer group shrink-0"
                                title="Nhấn để xem ảnh kích thước lớn"
                              >
                                <img
                                  src={img.url}
                                  alt="Ảnh đánh giá"
                                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                              </button>
                            ))}
                          </div>
                        )}

                        {video && (
                          <div className="max-w-md rounded-xl overflow-hidden border border-slate-200 bg-black">
                            <video
                              src={video.url}
                              controls
                              playsInline
                              preload="metadata"
                              className="w-full max-h-64 object-contain"
                            >
                              Trình duyệt của bạn không hỗ trợ phát video.
                            </video>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Actions */}
                  {rev.canEdit && (
                    <div className="flex justify-end pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingReview(rev)}
                        className="text-xs h-8 px-3 rounded-xl border-slate-300 hover:border-emerald-500 hover:text-emerald-700 font-semibold gap-1.5"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Sửa đánh giá</span>
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination Section */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 pt-6 px-2">
            <div className="text-xs text-slate-500">
              Trang <span className="font-bold text-slate-800">{pagination.page}</span> /{' '}
              <span className="font-bold text-slate-800">{pagination.totalPages}</span> ({pagination.total} đánh giá)
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasPrev}
                onClick={() => handlePageChange(pagination.page - 1)}
                className="h-8 px-2.5 rounded-xl text-xs gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Trang trước</span>
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => {
                  if (
                    p === 1 ||
                    p === pagination.totalPages ||
                    (p >= pagination.page - 1 && p <= pagination.page + 1)
                  ) {
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handlePageChange(p)}
                        className={`h-8 min-w-8 px-2 rounded-xl text-xs font-bold transition-colors ${
                          p === pagination.page
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  }
                  if (p === pagination.page - 2 || p === pagination.page + 2) {
                    return (
                      <span key={p} className="px-1 text-slate-400 text-xs">
                        ...
                      </span>
                    )
                  }
                  return null
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasNext}
                onClick={() => handlePageChange(pagination.page + 1)}
                className="h-8 px-2.5 rounded-xl text-xs gap-1"
              >
                <span className="hidden sm:inline">Trang sau</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Image Preview Lightbox Modal */}
        <Dialog open={!!previewImageUrl} onOpenChange={() => setPreviewImageUrl(null)}>
          <DialogContent className="max-w-3xl p-2 bg-black/95 border-none shadow-2xl overflow-hidden rounded-3xl">
            <DialogTitle className="sr-only">Xem ảnh đánh giá</DialogTitle>
            <div className="relative flex items-center justify-center p-4">
              <button
                type="button"
                onClick={() => setPreviewImageUrl(null)}
                className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
                aria-label="Đóng xem ảnh"
              >
                <X className="h-5 w-5" />
              </button>
              {previewImageUrl && (
                <img
                  src={previewImageUrl}
                  alt="Ảnh đánh giá kích thước lớn"
                  className="max-h-[80vh] w-auto max-w-full object-contain rounded-2xl shadow-lg"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Review Form Dialog for Editing */}
        {editingReview && (
          <ReviewFormDialog
            isOpen={!!editingReview}
            onClose={() => setEditingReview(null)}
            orderId={editingReview.order.id}
            item={{
              id: editingReview.orderItemId,
              variantId: '',
              productId: editingReview.product.id,
              brandName: editingReview.product.brandName,
              productName: editingReview.product.name,
              model: editingReview.product.model,
              imageUrl: editingReview.product.imageUrl,
              options: editingReview.product.options,
              unitPriceVnd: '0',
              quantity: 1,
              lineTotalVnd: '0',
            } as OrderItem}
            existingReview={{
              id: editingReview.id,
              orderItemId: editingReview.orderItemId,
              rating: editingReview.rating,
              comment: editingReview.comment,
              editCount: editingReview.editCount,
              canEdit: editingReview.canEdit,
              edited: editingReview.edited,
              media: editingReview.media,
              createdAt: editingReview.createdAt,
              updatedAt: editingReview.updatedAt,
            }}
            onSuccess={handleEditSuccess}
          />
        )}
      </div>
    </div>
  )
}

export default ReviewHistoryPage
