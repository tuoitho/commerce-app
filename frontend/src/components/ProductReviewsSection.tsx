import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getProductReviews, setReviewHelpfulness, setReplyHelpfulness } from '@/api/reviews'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import {
  ApiError,
  type PublicReview,
  type ProductReviewSummary,
  type ReviewMedia,
  type HelpfulnessVote,
  type HelpfulnessState,
} from '@/api/types'
import { cn, formatDateTime } from '@/lib/utils'
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
  ThumbsUp,
  ThumbsDown,
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
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { error: toastError } = useToast()

  const [reviews, setReviews] = useState<PublicReview[]>([])
  const [summary, setSummary] = useState<ProductReviewSummary | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const [pendingTargetIds, setPendingTargetIds] = useState<Set<string>>(new Set())

  const isTargetPending = useCallback(
    (targetId: string) => pendingTargetIds.has(targetId),
    [pendingTargetIds]
  )

  const fetchReviews = useCallback(
    async (targetPage: number) => {
      if (!productId || authLoading) return
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
    [productId, authLoading, onSummaryLoaded]
  )

  useEffect(() => {
    if (!authLoading) {
      fetchReviews(1)
    }
  }, [authLoading, fetchReviews])

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === page) return
    fetchReviews(newPage)
  }

  const handleVote = async (
    targetType: 'review' | 'reply',
    targetId: string,
    clickedVote: HelpfulnessVote,
    currentHelpfulness?: HelpfulnessState
  ) => {
    if (isTargetPending(targetId)) return

    if (!isAuthenticated) {
      const redirectPath = encodeURIComponent(location.pathname + location.search)
      navigate(`/login?redirect=${redirectPath}`)
      return
    }

    const currentVote = currentHelpfulness?.viewerVote || null
    const desiredVote: HelpfulnessVote | null = currentVote === clickedVote ? null : clickedVote

    setPendingTargetIds((prev) => new Set(prev).add(targetId))

    try {
      let newState: HelpfulnessState
      if (targetType === 'review') {
        newState = await setReviewHelpfulness(targetId, desiredVote)
      } else {
        newState = await setReplyHelpfulness(targetId, desiredVote)
      }

      setReviews((prev) =>
        prev.map((r) => {
          if (targetType === 'review' && r.id === targetId) {
            return { ...r, helpfulness: newState }
          }
          if (targetType === 'reply' && r.adminReplyId === targetId) {
            return { ...r, adminReplyHelpfulness: newState }
          }
          return r
        })
      )
    } catch (err: unknown) {
      if (
        err instanceof ApiError &&
        (err.status === 401 || err.code === 'invalid_token' || err.code === 'unauthorized')
      ) {
        const redirectPath = encodeURIComponent(location.pathname + location.search)
        navigate(`/login?redirect=${redirectPath}`)
        return
      }
      if (err instanceof ApiError && err.message) {
        toastError(err.message)
      } else if (err instanceof Error && err.message) {
        toastError(err.message)
      } else {
        toastError('Không thể cập nhật bình chọn. Vui lòng thử lại.')
      }
    } finally {
      setPendingTargetIds((prev) => {
        const next = new Set(prev)
        next.delete(targetId)
        return next
      })
    }
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
                isFilled ? 'fill-amber-400 text-amber-400' : 'text-zinc-200 fill-zinc-100'
              }`}
            />
          )
        })}
      </div>
    )
  }

  const totalReviewsCount = summary?.totalReviews || 0
  const avgRatingNum = Number(summary?.averageRating) || 0
  const isSectionLoading = authLoading || isLoading

  return (
    <section
      id="product-reviews"
      aria-label="Đánh giá từ khách hàng"
      className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 space-y-8"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-950 flex items-center gap-2.5">
            <MessageSquare className="w-5 h-5 text-emerald-700" />
            <span>Đánh giá từ khách hàng đã mua</span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            Đánh giá thực tế từ người dùng đã mua hàng thành công tại AuraPhone
          </p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchReviews(page)}
            className="text-xs gap-1 border-rose-300 hover:bg-rose-100 self-end sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Thử lại</span>
          </Button>
        </div>
      )}

      {/* Loading state */}
      {isSectionLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 rounded-2xl bg-zinc-50 border border-zinc-200">
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
      {!isSectionLoading && !error && (
        <div className="space-y-8">
          {/* Summary & Rating Distribution Box */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 sm:p-8 rounded-2xl bg-zinc-50 border border-zinc-200">
            <div className="md:col-span-4 flex flex-col items-center justify-center text-center sm:border-r sm:border-zinc-200 sm:pr-6 space-y-2">
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-4xl sm:text-5xl font-bold text-zinc-950 tabular-nums">
                  {totalReviewsCount > 0 ? summary?.averageRating : '0.0'}
                </span>
                <span className="font-mono text-zinc-400 font-semibold text-lg sm:text-xl">/ 5</span>
              </div>
              <div>{renderStars(Math.round(avgRatingNum), 5, 'w-5 h-5')}</div>
              <p className="text-xs text-zinc-500 font-medium">
                Dựa trên{' '}
                <strong className="font-mono text-zinc-900 font-bold">
                  {totalReviewsCount}
                </strong>{' '}
                lượt đánh giá
              </p>
            </div>

            <div className="md:col-span-8 space-y-2.5 flex flex-col justify-center">
              {[5, 4, 3, 2, 1].map((starLevel) => {
                const count = summary?.ratingCounts?.[String(starLevel)] || 0
                const percent =
                  totalReviewsCount > 0
                    ? Math.round((count / totalReviewsCount) * 100)
                    : 0

                return (
                  <div key={starLevel} className="flex items-center gap-3 text-xs">
                    <span className="w-12 font-mono text-zinc-600 font-semibold text-right shrink-0">
                      {starLevel} sao
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-zinc-200 overflow-hidden">
                      <div
                        className="h-full bg-zinc-950 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="w-10 text-zinc-500 font-mono text-right tabular-nums">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Empty state when 0 reviews */}
          {totalReviewsCount === 0 || reviews.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-2xl border border-zinc-200 bg-zinc-50/50 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-white border border-zinc-200 text-zinc-500 flex items-center justify-center mx-auto">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-zinc-950">
                Chưa có đánh giá nào cho sản phẩm này
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Hãy là người đầu tiên sở hữu và chia sẻ cảm nhận thực tế về chất lượng sản phẩm sau khi mua hàng.
              </p>
            </div>
          ) : (
            <div className="space-y-4 divide-y divide-zinc-200">
              {reviews.map((rev) => {
                const reviewerEmail = rev.reviewer?.maskedEmail || 'Khách hàng AuraPhone'
                const isRevPending = isTargetPending(rev.id)
                const isRevHelpful = rev.helpfulness?.viewerVote === 'helpful'
                const isRevUnhelpful = rev.helpfulness?.viewerVote === 'unhelpful'
                const revHelpfulCount = rev.helpfulness?.helpfulCount ?? 0
                const revUnhelpfulCount = rev.helpfulness?.unhelpfulCount ?? 0

                return (
                  <div key={rev.id} className="pt-6 first:pt-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-zinc-950 text-white font-mono font-bold flex items-center justify-center text-xs">
                          {reviewerEmail.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-zinc-950">
                              {reviewerEmail}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold gap-1 py-0.5"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Đã mua tại AuraPhone</span>
                            </Badge>
                          </div>
                          <span className="font-mono text-[11px] text-zinc-400">
                            {formatDateTime(rev.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div>{renderStars(rev.rating, 5, 'w-4 h-4')}</div>
                    </div>

                    {(rev.purchase?.model || (rev.purchase?.options && rev.purchase.options.length > 0)) && (
                      <div className="text-xs text-zinc-600 bg-zinc-50 px-3 py-1.5 rounded-lg border border-zinc-200/80 flex items-center gap-2 flex-wrap">
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

                    {rev.comment && (
                      <p className="text-xs sm:text-sm text-zinc-800 leading-relaxed whitespace-pre-line">
                        {rev.comment}
                      </p>
                    )}

                    {rev.media && rev.media.length > 0 && (
                      <div className="flex flex-wrap gap-2.5 pt-1">
                        {rev.media.map((m: ReviewMedia) => (
                          <div
                            key={m.id}
                            className="relative rounded-xl overflow-hidden border border-zinc-200 bg-zinc-950"
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
                                className="w-20 h-20 sm:w-24 sm:h-24 block overflow-hidden group cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-700"
                              >
                                <img
                                  src={m.url}
                                  alt="Ảnh đánh giá của khách hàng"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  onError={(e) => {
                                    ;(e.target as HTMLElement).style.display = 'none'
                                  }}
                                />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <button
                        type="button"
                        aria-label={`Hữu ích (${revHelpfulCount})`}
                        aria-pressed={isRevHelpful}
                        disabled={isRevPending}
                        onClick={() => handleVote('review', rev.id, 'helpful', rev.helpfulness)}
                        className={cn(
                          'min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all inline-flex items-center gap-2 select-none cursor-pointer',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2',
                          'disabled:opacity-50 disabled:cursor-not-allowed',
                          isRevHelpful
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                            : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300'
                        )}
                      >
                        <ThumbsUp
                          className={cn(
                            'w-4 h-4 transition-all shrink-0',
                            isRevHelpful ? 'fill-emerald-700 text-emerald-700 scale-105' : 'text-zinc-500 fill-none'
                          )}
                        />
                        <span>{`Hữu ích (${revHelpfulCount})`}</span>
                      </button>

                      <button
                        type="button"
                        aria-label={`Không hữu ích (${revUnhelpfulCount})`}
                        aria-pressed={isRevUnhelpful}
                        disabled={isRevPending}
                        onClick={() => handleVote('review', rev.id, 'unhelpful', rev.helpfulness)}
                        className={cn(
                          'min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all inline-flex items-center gap-2 select-none cursor-pointer',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2',
                          'disabled:opacity-50 disabled:cursor-not-allowed',
                          isRevUnhelpful
                            ? 'bg-zinc-100 border-zinc-300 text-zinc-950 font-bold'
                            : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300'
                        )}
                      >
                        <ThumbsDown
                          className={cn(
                            'w-4 h-4 transition-all shrink-0',
                            isRevUnhelpful ? 'fill-zinc-800 text-zinc-800 scale-105' : 'text-zinc-500 fill-none'
                          )}
                        />
                        <span>{`Không hữu ích (${revUnhelpfulCount})`}</span>
                      </button>
                    </div>

                    {rev.adminReply && (
                      <div className="mt-3 rounded-xl bg-zinc-50 border border-zinc-200 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="bg-zinc-950 text-white border-zinc-900 font-semibold gap-1 text-[11px] py-0.5 px-2.5"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Phản hồi từ người bán</span>
                          </Badge>
                          {rev.adminRepliedAt && (
                            <span className="font-mono text-[11px] text-zinc-400">
                              {formatDateTime(rev.adminRepliedAt)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-zinc-700 leading-relaxed whitespace-pre-line">
                          {rev.adminReply}
                        </p>

                        {rev.adminReplyId && rev.adminReplyHelpfulness && (
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-200/80">
                            <button
                              type="button"
                              aria-label={`Hữu ích (${rev.adminReplyHelpfulness.helpfulCount})`}
                              aria-pressed={rev.adminReplyHelpfulness.viewerVote === 'helpful'}
                              disabled={isTargetPending(rev.adminReplyId)}
                              onClick={() =>
                                handleVote(
                                  'reply',
                                  rev.adminReplyId!,
                                  'helpful',
                                  rev.adminReplyHelpfulness
                                )
                              }
                              className={cn(
                                'min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all inline-flex items-center gap-2 select-none cursor-pointer',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2',
                                'disabled:opacity-50 disabled:cursor-not-allowed',
                                rev.adminReplyHelpfulness.viewerVote === 'helpful'
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                                  : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300'
                              )}
                            >
                              <ThumbsUp
                                className={cn(
                                  'w-4 h-4 transition-all shrink-0',
                                  rev.adminReplyHelpfulness.viewerVote === 'helpful'
                                    ? 'fill-emerald-700 text-emerald-700 scale-105'
                                    : 'text-zinc-500 fill-none'
                                )}
                              />
                              <span>{`Hữu ích (${rev.adminReplyHelpfulness.helpfulCount})`}</span>
                            </button>

                            <button
                              type="button"
                              aria-label={`Không hữu ích (${rev.adminReplyHelpfulness.unhelpfulCount})`}
                              aria-pressed={rev.adminReplyHelpfulness.viewerVote === 'unhelpful'}
                              disabled={isTargetPending(rev.adminReplyId)}
                              onClick={() =>
                                handleVote(
                                  'reply',
                                  rev.adminReplyId!,
                                  'unhelpful',
                                  rev.adminReplyHelpfulness
                                )
                              }
                              className={cn(
                                'min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all inline-flex items-center gap-2 select-none cursor-pointer',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2',
                                'disabled:opacity-50 disabled:cursor-not-allowed',
                                rev.adminReplyHelpfulness.viewerVote === 'unhelpful'
                                  ? 'bg-zinc-100 border-zinc-300 text-zinc-950 font-bold'
                                  : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300'
                              )}
                            >
                              <ThumbsDown
                                className={cn(
                                  'w-4 h-4 transition-all shrink-0',
                                  rev.adminReplyHelpfulness.viewerVote === 'unhelpful'
                                    ? 'fill-zinc-800 text-zinc-800 scale-105'
                                    : 'text-zinc-500 fill-none'
                                )}
                              />
                              <span>{`Không hữu ích (${rev.adminReplyHelpfulness.unhelpfulCount})`}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-200 pt-4 text-xs">
              <span className="text-zinc-500 font-medium">
                Trang <strong className="font-mono text-zinc-900">{page}</strong> / {totalPages}
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
              className="absolute -top-10 right-0 text-white hover:text-zinc-300 focus:outline-none p-1"
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
