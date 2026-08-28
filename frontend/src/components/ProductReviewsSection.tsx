import { useState, useEffect, useCallback } from 'react'
import {
  Star,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Film,
  X,
  Edit3,
  MessageSquare,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ReviewFormModal } from '@/components/ReviewFormModal'
import { listProductReviews } from '@/api/reviews'
import type { Review, ReviewMedia, ReviewSummary, PaginationMeta } from '@/api/types'

export interface ProductReviewsSectionProps {
  productId: string
  reviewSummary?: ReviewSummary
  onReviewUpdated?: () => void
}

export function ProductReviewsSection({
  productId,
  reviewSummary,
  onReviewUpdated,
}: ProductReviewsSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 5,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Lightbox modal state
  const [activeMedia, setActiveMedia] = useState<ReviewMedia | null>(null)

  // Edit review modal state
  const [editingReview, setEditingReview] = useState<Review | null>(null)

  const fetchReviews = useCallback(
    async (page: number) => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await listProductReviews(productId, page, 5)
        setReviews(res.data || [])
        if (res.meta?.pagination) {
          setPagination(res.meta.pagination)
        }
      } catch {
        setError('Không thể tải danh sách đánh giá. Vui lòng thử lại sau.')
      } finally {
        setIsLoading(false)
      }
    },
    [productId]
  )

  useEffect(() => {
    fetchReviews(1)
  }, [fetchReviews])

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchReviews(newPage)
    }
  }

  const handleEditSuccess = (updated: Review) => {
    setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    setEditingReview(null)
    onReviewUpdated?.()
  }

  const totalReviews = reviewSummary?.reviewCount ?? pagination.total
  const avgRating = reviewSummary?.averageRating

  return (
    <section
      id="product-reviews-section"
      className="rounded-3xl border border-slate-200/90 bg-white/90 backdrop-blur-md p-6 sm:p-8 shadow-sm space-y-8 scroll-mt-20"
    >
      {/* Section Header & Rating Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            <h3 className="text-xl font-bold text-slate-900">Đánh giá từ khách hàng</h3>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Đánh giá thực tế từ những khách hàng đã mua sản phẩm này
          </p>
        </div>

        {/* Aggregated Rating Card */}
        <div className="flex items-center gap-4 bg-slate-50 border border-slate-100 rounded-2xl p-4 sm:px-6">
          <div className="text-center sm:text-left">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-slate-900">
                {avgRating !== null && avgRating !== undefined ? avgRating.toFixed(1) : '--'}
              </span>
              <span className="text-sm font-semibold text-slate-400">/ 5</span>
            </div>
            <div className="flex items-center gap-0.5 mt-1">
              {[1, 2, 3, 4, 5].map((s) => {
                const filled = avgRating ? s <= Math.round(avgRating) : false
                return (
                  <Star
                    key={s}
                    className={`w-4 h-4 ${
                      filled ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'
                    }`}
                  />
                )
              })}
            </div>
          </div>
          <div className="border-l border-slate-200 pl-4 text-xs text-slate-500">
            <p className="font-semibold text-slate-700">{totalReviews} đánh giá</p>
            <p className="text-slate-400 mt-0.5">100% người mua xác thực</p>
          </div>
        </div>
      </div>

      {/* Review List or States */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-sm font-medium">Đang tải đánh giá...</p>
        </div>
      ) : error ? (
        <div className="py-10 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-sm text-slate-600">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchReviews(pagination.page)}>
            Thử lại
          </Button>
        </div>
      ) : reviews.length === 0 ? (
        <div className="py-12 text-center space-y-3 bg-slate-50/60 rounded-2xl border border-slate-100 p-8">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <Star className="w-6 h-6" />
          </div>
          <h4 className="text-base font-semibold text-slate-800">Chưa có đánh giá nào</h4>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Sản phẩm chưa có lượt đánh giá nào. Hãy là người đầu tiên chia sẻ cảm nhận sau khi mua hàng!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="divide-y divide-slate-100">
            {reviews.map((rev) => (
              <div key={rev.id} className="py-6 first:pt-0 last:pb-0 space-y-3">
                {/* Review Header: User & Rating */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">
                        {rev.authorLabel || 'Khách hàng đã mua hàng'}
                      </span>
                      {rev.verifiedPurchase && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Đã mua hàng
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3.5 h-3.5 ${
                              s <= rev.rating
                                ? 'fill-amber-400 text-amber-400'
                                : 'fill-slate-200 text-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(rev.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  </div>

                  {/* Owner Edit Action */}
                  {rev.viewer?.isOwner && rev.viewer.canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingReview(rev)}
                      className="text-xs font-semibold gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Sửa đánh giá</span>
                    </Button>
                  )}
                  {rev.viewer?.isOwner && !rev.viewer.canEdit && (
                    <span className="text-xs text-slate-400 italic">Đã chỉnh sửa</span>
                  )}
                </div>

                {/* Purchased options snapshot */}
                {rev.purchasedOptions && rev.purchasedOptions.length > 0 && (
                  <p className="text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md inline-block">
                    Phân loại:{' '}
                    <span className="text-slate-700 font-medium">
                      {rev.purchasedOptions
                        .map((opt) => `${opt.groupLabel}: ${opt.valueLabel}`)
                        .join(', ')}
                    </span>
                  </p>
                )}

                {/* Review Comment */}
                {rev.comment && (
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    {rev.comment}
                  </p>
                )}

                {/* Media Gallery */}
                {rev.media && rev.media.length > 0 && (
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    {rev.media.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setActiveMedia(m)}
                        aria-label={`Xem ${m.type === 'video' ? 'video' : 'ảnh'} đánh giá`}
                        className="group relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 hover:ring-2 hover:ring-emerald-500 transition shrink-0"
                      >
                        {m.type === 'video' ? (
                          <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                            <video src={m.url} className="w-full h-full object-cover opacity-80" />
                            <Film className="w-6 h-6 text-white absolute group-hover:scale-110 transition" />
                          </div>
                        ) : (
                          <img
                            src={m.url}
                            alt="Media review thumbnail"
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                Trang {pagination.page} / {pagination.totalPages} ({pagination.total} đánh giá)
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasPrev}
                  onClick={() => handlePageChange(pagination.page - 1)}
                  className="h-8 px-2.5 text-xs gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Trước</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasNext}
                  onClick={() => handlePageChange(pagination.page + 1)}
                  className="h-8 px-2.5 text-xs gap-1"
                >
                  <span>Sau</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Media Lightbox Dialog */}
      <Dialog open={Boolean(activeMedia)} onOpenChange={(open) => !open && setActiveMedia(null)}>
        <DialogContent className="sm:max-w-[700px] p-2 bg-black/95 border-none text-white overflow-hidden flex flex-col items-center justify-center">
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setActiveMedia(null)}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
          {activeMedia && activeMedia.type === 'video' ? (
            <video
              src={activeMedia.url}
              controls
              autoPlay
              className="max-h-[75vh] w-auto max-w-full rounded-lg"
            />
          ) : (
            activeMedia && (
              <img
                src={activeMedia.url}
                alt="Full preview"
                className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
              />
            )
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Review Modal */}
      {editingReview && (
        <ReviewFormModal
          open={Boolean(editingReview)}
          onOpenChange={(open) => !open && setEditingReview(null)}
          mode="edit"
          existingReview={editingReview}
          onSuccess={handleEditSuccess}
        />
      )}
    </section>
  )
}
