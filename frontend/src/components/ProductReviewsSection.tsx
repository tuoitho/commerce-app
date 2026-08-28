import React, { useState, useEffect, useCallback } from 'react'
import { getProductReviews } from '@/api/reviews'
import type {
  PublicReview,
  ProductReviewSummary,
  ReviewMedia,
} from '@/api/types'
import { formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Star,
  ShieldCheck,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  AlertCircle,
  X,
} from 'lucide-react'

interface ProductReviewsSectionProps {
  productId: string
  onSummaryLoaded?: (summary: ProductReviewSummary) => void
}

export const ProductReviewsSection: React.FC<ProductReviewsSectionProps> = ({
  productId,
  onSummaryLoaded,
}) => {
  const [reviews, setReviews] = useState<PublicReview[]>([])
  const [summary, setSummary] = useState<ProductReviewSummary | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedImage, setExpandedImage] = useState<string | null>(null)

  const fetchReviews = useCallback(
    async (targetPage: number) => {
      if (!productId) return
      setIsLoading(true)
      setError(null)
      try {
        const res = await getProductReviews(productId, { page: targetPage, limit: 10 })
        const data = res.data
        setSummary(data.summary)
        setReviews(data.reviews || [])
        if (onSummaryLoaded) {
          onSummaryLoaded(data.summary)
        }
        if (res.meta.pagination) {
          setTotalPages(res.meta.pagination.totalPages || 1)
          setPage(res.meta.pagination.page || 1)
        }
      } catch {
        setError('Không thể tải đánh giá sản phẩm. Vui lòng thử lại.')
      } finally {
        setIsLoading(false)
      }
    },
    [productId, onSummaryLoaded]
  )

  useEffect(() => {
    fetchReviews(1)
  }, [fetchReviews])

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === page) return
    fetchReviews(newPage)
  }

  const renderStars = (rating: number, max = 5, sizeClass = 'w-4 h-4') => {
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: max }).map((_, idx) => {
          const isFilled = idx < rating
          return (
            <Star
              key={idx}
              className={`${sizeClass} ${
                isFilled ? 'fill-amber-400 text-amber-400' : 'text-slate-200 fill-slate-100'
              }`}
            />
          )
        })}
      </div>
    )
  }

  const totalReviewsCount = summary?.totalReviews || 0
  const avgRatingNum = Number(summary?.averageRating) || 0

  return (
    <section
      id="product-reviews"
      aria-label="Đánh giá từ khách hàng"
      className="rounded-3xl border border-slate-200/90 bg-white/90 backdrop-blur-md p-6 sm:p-8 shadow-sm space-y-8"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
            <MessageSquare className="w-6 h-6 text-emerald-600" />
            <span>Đánh giá từ khách hàng đã mua</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Đánh giá thực tế từ người dùng đã mua hàng thành công tại AuraPhone
          </p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchReviews(page)}
            className="text-xs gap-1 border-destructive/30 hover:bg-destructive/10 self-end sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Thử lại</span>
          </Button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 rounded-2xl bg-slate-50/80 border border-slate-200/80">
            <div className="md:col-span-4 space-y-3 flex flex-col items-center justify-center">
              <Skeleton className="h-12 w-24 rounded-xl" />
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-4 w-28 rounded-md" />
            </div>
            <div className="md:col-span-8 space-y-2">
              {[5, 4, 3, 2, 1].map((s) => (
                <Skeleton key={s} className="h-4 w-full rounded-md" />
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        </div>
      )}

      {/* Loaded Content */}
      {!isLoading && !error && (
        <div className="space-y-8">
          {/* Summary & Rating Distribution Box */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-slate-50 via-slate-50/90 to-emerald-50/30 border border-slate-200/80">
            {/* Left: Overall Score */}
            <div className="md:col-span-4 flex flex-col items-center justify-center text-center sm:border-r sm:border-slate-200/80 sm:pr-6 space-y-2">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl sm:text-5xl font-black text-slate-900 tabular-nums">
                  {totalReviewsCount > 0 ? summary?.averageRating : '0.0'}
                </span>
                <span className="text-slate-400 font-bold text-lg sm:text-xl">/ 5</span>
              </div>
              <div>{renderStars(Math.round(avgRatingNum), 5, 'w-5 h-5')}</div>
              <p className="text-xs text-slate-500 font-medium">
                Dựa trên{' '}
                <strong className="text-slate-800 font-bold">
                  {totalReviewsCount}
                </strong>{' '}
                lượt đánh giá
              </p>
            </div>

            {/* Right: Star breakdown progress bars */}
            <div className="md:col-span-8 space-y-2 flex flex-col justify-center">
              {[5, 4, 3, 2, 1].map((starLevel) => {
                const count = summary?.ratingCounts?.[String(starLevel)] || 0
                const percent =
                  totalReviewsCount > 0
                    ? Math.round((count / totalReviewsCount) * 100)
                    : 0

                return (
                  <div key={starLevel} className="flex items-center gap-3 text-xs">
                    <span className="w-12 text-slate-600 font-semibold text-right shrink-0">
                      {starLevel} sao
                    </span>
                    <div className="flex-1 h-2.5 rounded-full bg-slate-200/70 overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="w-10 text-slate-400 font-mono text-right tabular-nums">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Empty state when 0 reviews */}
          {totalReviewsCount === 0 || reviews.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Chưa có đánh giá nào cho sản phẩm này
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Hãy là người đầu tiên sở hữu và chia sẻ cảm nhận thực tế về chất lượng sản phẩm sau khi mua hàng.
              </p>
            </div>
          ) : (
            /* Reviews List */
            <div className="space-y-4 divide-y divide-slate-100">
              {reviews.map((rev) => {
                const reviewerEmail = rev.reviewer?.maskedEmail || 'Khách hàng AuraPhone'

                return (
                  <div key={rev.id} className="pt-5 first:pt-0 space-y-3">
                    {/* Review Header: User & Verified Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs">
                          {reviewerEmail.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900">
                              {reviewerEmail}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold gap-1 py-0.5"
                            >
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>Đã mua tại AuraPhone</span>
                            </Badge>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {formatDateTime(rev.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Stars */}
                      <div>{renderStars(rev.rating, 5, 'w-4 h-4')}</div>
                    </div>

                    {/* Purchase Snapshot */}
                    {(rev.purchase?.model || (rev.purchase?.options && rev.purchase.options.length > 0)) && (
                      <div className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 flex items-center gap-2 flex-wrap">
                        {rev.purchase.model && (
                          <span>
                            Phân loại: <strong>{rev.purchase.model}</strong>
                          </span>
                        )}
                        {rev.purchase.options && rev.purchase.options.length > 0 && (
                          <span>
                            ({rev.purchase.options.map((o) => `${o.groupLabel}: ${o.valueLabel}`).join(', ')})
                          </span>
                        )}
                      </div>
                    )}

                    {/* Comment */}
                    {rev.comment && (
                      <p className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                        {rev.comment}
                      </p>
                    )}

                    {/* Media Attachments */}
                    {rev.media && rev.media.length > 0 && (
                      <div className="flex flex-wrap gap-2.5 pt-1">
                        {rev.media.map((m: ReviewMedia) => (
                          <div
                            key={m.id}
                            className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900"
                          >
                            {m.type === 'video' ? (
                              <div className="w-48 sm:w-56 aspect-video bg-black flex items-center justify-center">
                                <video
                                  src={m.url}
                                  controls
                                  preload="metadata"
                                  className="w-full h-full object-contain"
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setExpandedImage(m.url)}
                                className="w-20 h-20 sm:w-24 sm:h-24 block overflow-hidden group cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                              >
                                <img
                                  src={m.url}
                                  alt="Ảnh đánh giá của khách hàng"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  onError={(e) => {
                                    // Hide broken media gracefully
                                    ;(e.target as HTMLElement).style.display = 'none'
                                  }}
                                />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
              <span className="text-slate-500 font-medium">
                Trang <strong className="text-slate-800">{page}</strong> / {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                  className="h-8 px-3 rounded-lg text-xs gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Trước</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                  className="h-8 px-3 rounded-lg text-xs gap-1"
                >
                  <span>Sau</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expanded Image Modal */}
      {expandedImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh phóng to"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex items-center justify-center">
            <button
              type="button"
              aria-label="Đóng ảnh"
              onClick={() => setExpandedImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-slate-300 focus:outline-none p-1"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={expandedImage}
              alt="Ảnh phóng to"
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </section>
  )
}

