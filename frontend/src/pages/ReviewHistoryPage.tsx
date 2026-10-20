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
  ShieldCheck,
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
  const parsedRating = ratingParam ? parseInt(ratingParam, 10) : 0
  const currentRating = !Number.isNaN(parsedRating) && parsedRating > 0 ? parsedRating : 0

  const pageParam = searchParams.get('page')
  const currentPage = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1

  const [reviews, setReviews] = useState<UserReview[]>([])
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [failedMediaIds, setFailedMediaIds] = useState<Record<string, boolean>>({})

  const [editingReview, setEditingReview] = useState<UserReview | null>(null)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login?redirect=/reviews')
    }
  }, [authLoading, isAuthenticated, navigate])

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
    nextParams.delete('page')
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
      <div className="min-h-screen bg-[#f7f7f5] pb-24">
        <div className="border-b border-zinc-200 bg-white py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-4">
            <Skeleton className="h-8 w-64 rounded-xl" />
            <Skeleton className="h-5 w-96 rounded-lg" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
          <Skeleton className="h-12 w-full rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="review-history-page" className="min-h-screen bg-[#f7f7f5] pb-24">
      {/* Page Header */}
      <div className="border-b border-zinc-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
                MEMBER FEEDBACK ARCHIVE
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 mt-1">
                Lịch sử đánh giá
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500 mt-1">
                Xem lại và quản lý các đánh giá sản phẩm bạn đã gửi tại AuraPhone
              </p>
            </div>
            <div className="flex items-center gap-2.5 self-start sm:self-auto">
              <Link to="/orders?status=reviewable">
                <Button variant="outline" size="sm" className="rounded-xl font-semibold gap-1.5 text-xs text-zinc-900 bg-zinc-50 border-zinc-300 hover:bg-zinc-100">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
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
        <div className="border border-zinc-200 bg-white rounded-2xl p-1.5 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 min-w-max" role="tablist" aria-label="Bộ lọc số sao đánh giá">
            {RATING_TABS.map((tab) => {
              const isSelected = currentRating === tab.rating
              return (
                <button
                  key={tab.rating}
                  data-testid={`rating-filter-tab-${tab.rating}`}
                  role="tab"
                  aria-selected={isSelected}
                  type="button"
                  onClick={() => handleRatingChange(tab.rating)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 ${
                    isSelected
                      ? 'bg-zinc-950 text-white'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
                  }`}
                >
                  {tab.rating > 0 && (
                    <Star
                      className={`h-4 w-4 ${
                        isSelected ? 'fill-amber-400 text-amber-400' : 'fill-amber-400 text-amber-500'
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
          <div data-testid="review-loading-skeleton" className="space-y-4">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        ) : error ? (
          <div className="p-8 rounded-2xl border border-rose-200 bg-rose-50/50 text-center space-y-4 max-w-lg mx-auto">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-rose-100 text-rose-700 mx-auto">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-950">Lỗi tải dữ liệu</h3>
              <p className="text-xs sm:text-sm text-zinc-600">{error}</p>
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
          <div className="py-12">
            {currentRating === 0 ? (
              <EmptyState
                icon={<Star className="h-7 w-7 text-amber-500 fill-amber-400" />}
                title="Chưa có đánh giá nào"
                description="Bạn chưa gửi đánh giá nào cho các sản phẩm đã mua tại AuraPhone. Hãy chia sẻ cảm nhận để giúp mọi người mua sắm tốt hơn!"
                actionLabel="Xem đơn chờ đánh giá"
                actionLink="/orders?status=reviewable"
              />
            ) : (
              <EmptyState
                icon={<Star className="h-7 w-7 text-amber-500 fill-amber-400" />}
                title={`Chưa có đánh giá ${currentRating} sao nào`}
                description="Bạn chưa có đánh giá nào khớp với bộ lọc số sao này."
                actionLabel="Xem tất cả đánh giá"
                onAction={() => handleRatingChange(0)}
              />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((rev) => {
              const images = rev.media?.filter((m) => m.type === 'image') || []
              const video = rev.media?.find((m) => m.type === 'video')

              return (
                <div
                  key={rev.id}
                  data-testid="review-history-card"
                  data-review-id={rev.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 hover:border-zinc-400 transition-all space-y-4"
                >
                  {/* Card Header: Order info & Review timestamps */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3.5">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
                      <Link
                        to={`/orders/${rev.order.id}`}
                        data-testid="review-order-link"
                        className="inline-flex items-center gap-1 font-mono font-bold text-zinc-900 bg-zinc-100 hover:bg-emerald-50 hover:text-emerald-700 px-2.5 py-1 rounded-md border border-zinc-200/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        title="Xem chi tiết đơn hàng này"
                      >
                        <Package className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Mã đơn: {rev.order.id}</span>
                        <ExternalLink className="h-3 w-3 text-zinc-400 ml-0.5" />
                      </Link>
                      <span className="text-zinc-500 font-sans">
                        Ngày đặt: {formatDateTime(rev.order.createdAt)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-zinc-500">
                        Đánh giá ngày: {formatDateTime(rev.createdAt)}
                      </span>
                      {rev.edited && (
                        <>
                          <span data-testid="review-updated-at" className="text-xs text-zinc-500">
                            • Cập nhật: {formatDateTime(rev.updatedAt)}
                          </span>
                          <Badge
                            data-testid="review-edited-badge"
                            variant="outline"
                            className="text-[10px] bg-zinc-100 text-zinc-600 border-zinc-200 font-medium px-2 py-0.5"
                          >
                            Đã chỉnh sửa
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Product Info Section */}
                  <div className="flex items-center gap-3 sm:gap-4">
                    <Link
                      to={`/products/${rev.product.id}`}
                      data-testid="review-product-image-link"
                      aria-label={`Xem sản phẩm ${rev.product.name}`}
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#f7f7f5] border border-zinc-200 p-1.5 overflow-hidden hover:border-zinc-950 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      {rev.product.imageUrl ? (
                        <img
                          src={rev.product.imageUrl}
                          alt={rev.product.name}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <Smartphone className="h-6 w-6 text-zinc-300" />
                      )}
                    </Link>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                          {rev.product.brandName}
                        </span>
                        {rev.product.model && (
                          <span className="text-[10px] text-zinc-400 font-mono">
                            ({rev.product.model})
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-zinc-950 text-sm sm:text-base truncate">
                        <Link
                          to={`/products/${rev.product.id}`}
                          data-testid="review-product-name-link"
                          className="hover:text-emerald-700 transition-colors inline-flex items-center gap-1 max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded"
                        >
                          <span className="truncate">{rev.product.name}</span>
                          <ExternalLink className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                        </Link>
                      </h3>

                      {rev.product.options && rev.product.options.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {rev.product.options.map((opt, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md font-medium"
                            >
                              {opt.groupLabel}: <strong className="text-zinc-900">{opt.valueLabel}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Review Content & Star Rating */}
                  <div className="rounded-xl bg-[#f7f7f5] p-4 border border-zinc-200/80 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-4 w-4 ${
                              star <= rev.rating
                                ? 'fill-amber-400 text-amber-400'
                                : 'fill-zinc-200 text-zinc-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="font-mono text-xs font-bold text-zinc-900">
                        {rev.rating}/5 sao
                      </span>
                    </div>

                    {rev.comment && (
                      <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line">
                        {rev.comment}
                      </p>
                    )}

                    {/* Media Attachments */}
                    {(images.length > 0 || video) && (
                      <div className="pt-1 space-y-2">
                        {images.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {images.map((img) =>
                              failedMediaIds[img.id] ? (
                                <div
                                  key={img.id}
                                  data-testid="review-media-fallback"
                                  className="flex flex-col items-center justify-center h-20 w-20 rounded-xl border border-dashed border-zinc-300 bg-zinc-100 text-zinc-400 p-1 text-center shrink-0"
                                >
                                  <AlertTriangle className="h-4 w-4 mb-0.5" />
                                  <span className="text-[10px] leading-tight">Ảnh lỗi</span>
                                </div>
                              ) : (
                                <button
                                  key={img.id}
                                  type="button"
                                  data-testid="review-image-thumb"
                                  onClick={() => setPreviewImageUrl(img.url)}
                                  className="relative h-20 w-20 rounded-xl overflow-hidden border border-zinc-200 hover:border-zinc-950 transition-all cursor-pointer group shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                                  title="Nhấn để xem ảnh kích thước lớn"
                                >
                                  <img
                                    src={img.url}
                                    alt="Ảnh đánh giá"
                                    onError={() =>
                                      setFailedMediaIds((prev) => ({ ...prev, [img.id]: true }))
                                    }
                                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  />
                                </button>
                              )
                            )}
                          </div>
                        )}

                        {video && (
                          failedMediaIds[video.id] ? (
                            <div
                              data-testid="review-media-fallback"
                              className="flex items-center gap-2 max-w-md rounded-xl border border-dashed border-zinc-300 bg-zinc-100 text-zinc-500 px-4 py-3 text-xs"
                            >
                              <AlertTriangle className="h-4 w-4 text-zinc-400 shrink-0" />
                              <span>Không thể tải video đính kèm</span>
                            </div>
                          ) : (
                            <div className="max-w-md rounded-xl overflow-hidden border border-zinc-200 bg-zinc-950">
                              <video
                                data-testid="review-video-player"
                                src={video.url}
                                controls
                                playsInline
                                preload="metadata"
                                onError={() =>
                                  setFailedMediaIds((prev) => ({ ...prev, [video.id]: true }))
                                }
                                className="w-full max-h-64 object-contain"
                              >
                                Trình duyệt của bạn không hỗ trợ phát video.
                              </video>
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {/* Admin Reply */}
                    {rev.adminReply && (
                      <div
                        data-testid="review-admin-reply"
                        className="rounded-xl bg-white border border-zinc-200 p-4 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold gap-1 text-[11px] py-0.5 px-2"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Phản hồi từ người bán</span>
                          </Badge>
                          {rev.adminRepliedAt && (
                            <span className="text-[11px] text-zinc-400">
                              {formatDateTime(rev.adminRepliedAt)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-zinc-700 leading-relaxed whitespace-pre-line">
                          {rev.adminReply}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Actions */}
                  {rev.canEdit && (
                    <div className="flex justify-end pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="review-edit-btn"
                        onClick={() => setEditingReview(rev)}
                        className="text-xs h-8 px-3 rounded-xl border-zinc-300 hover:border-zinc-950 font-semibold gap-1.5"
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
          <div data-testid="review-pagination" className="flex items-center justify-between border-t border-zinc-200 pt-6 px-2">
            <div className="text-xs text-zinc-500">
              Trang <span className="font-mono font-bold text-zinc-900">{pagination.page}</span> /{' '}
              <span className="font-mono font-bold text-zinc-900">{pagination.totalPages}</span> ({pagination.total} đánh giá)
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                data-testid="pagination-prev"
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
                        data-testid={`pagination-page-${p}`}
                        onClick={() => handlePageChange(p)}
                        className={`font-mono h-8 min-w-8 px-2 rounded-xl text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                          p === pagination.page
                            ? 'bg-zinc-950 text-white'
                            : 'text-zinc-600 hover:bg-zinc-100'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  }
                  if (p === pagination.page - 2 || p === pagination.page + 2) {
                    return (
                      <span key={p} className="px-1 text-zinc-400 text-xs">
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
                data-testid="pagination-next"
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
          <DialogContent
            hideCloseButton
            data-testid="review-lightbox-dialog"
            className="max-w-3xl p-2 bg-zinc-950/95 border border-zinc-800 shadow-2xl overflow-hidden rounded-2xl"
          >
            <DialogTitle className="sr-only">Xem ảnh đánh giá</DialogTitle>
            <div className="relative flex items-center justify-center p-4">
              <button
                type="button"
                onClick={() => setPreviewImageUrl(null)}
                className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/15 text-white hover:bg-white/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Đóng xem ảnh"
              >
                <X className="h-5 w-5" />
              </button>
              {previewImageUrl && (
                <img
                  data-testid="review-lightbox-image"
                  src={previewImageUrl}
                  alt="Ảnh đánh giá kích thước lớn"
                  className="max-h-[80vh] w-auto max-w-full object-contain rounded-xl shadow-lg"
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
