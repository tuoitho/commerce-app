import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Star,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Edit3,
  ExternalLink,
} from 'lucide-react'
import { listOwnedReviews } from '@/api/reviews'
import type { OwnedReviewHistoryItem, PaginationMeta, Review } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { ReviewFormModal } from '@/components/ReviewFormModal'

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

export function MyReviewsPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const { success } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const rawPage = parseInt(searchParams.get('page') || '1', 10)
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage
  const limit = 10

  const [items, setItems] = useState<OwnedReviewHistoryItem[]>([])
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editingReview, setEditingReview] = useState<Review | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  // Route protection: safe login return
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate('/login?redirect=%2Freviews', { replace: true })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  // Clear items on user/session change
  useEffect(() => {
    setItems([])
    setPagination(null)
  }, [user?.id])

  const loadReviews = useCallback(
    async (targetPage: number) => {
      if (!isAuthenticated) return

      setIsLoading(true)
      setError(null)

      try {
        const res = await listOwnedReviews(targetPage, limit)
        const paginationMeta = res.meta.pagination as PaginationMeta

        // Out-of-range page recovery
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
        console.error('Failed to fetch owned reviews', err)
        setError('Không thể tải danh sách đánh giá. Vui lòng thử lại sau.')
      } finally {
        setIsLoading(false)
      }
    },
    [isAuthenticated, limit, setSearchParams]
  )

  useEffect(() => {
    if (isAuthenticated) {
      loadReviews(page)
    }
  }, [isAuthenticated, page, loadReviews])

  const handlePageChange = (newPage: number) => {
    if (newPage === page || (pagination && (newPage < 1 || newPage > pagination.totalPages))) {
      return
    }
    setSearchParams({ page: String(newPage) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleStartEdit = (review: Review) => {
    setEditingReview(review)
    setIsEditModalOpen(true)
  }

  const handleEditSuccess = (updatedReview: Review) => {
    success('Cập nhật thành công', 'Đánh giá của bạn đã được chỉnh sửa.')
    setItems((prev) =>
      prev.map((item) => {
        if (item.review.id === updatedReview.id) {
          return {
            ...item,
            review: {
              ...updatedReview,
              viewer: {
                isOwner: true,
                canEdit: false,
                remainingEdits: 0,
              },
            },
          }
        }
        return item
      })
    )
    setIsEditModalOpen(false)
    setEditingReview(null)
  }

  // Auth loading state
  if (isAuthLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-64 rounded-xl" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-3xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-[80vh] py-8 sm:py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500 border border-amber-200 shadow-2xs">
                <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Đánh giá của tôi
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Quản lý và xem lại tất cả các đánh giá sản phẩm bạn đã chia sẻ
            </p>
          </div>

          {pagination && pagination.total > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 self-start sm:self-auto">
              <span>Tổng cộng:</span>
              <span className="text-emerald-700 font-extrabold">{pagination.total} đánh giá</span>
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4 animate-fade-in">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs"
              >
                <div className="flex justify-between items-center">
                  <Skeleton className="h-6 w-48 rounded-md" />
                  <Skeleton className="h-8 w-24 rounded-xl" />
                </div>
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <div className="flex gap-2">
                  <Skeleton className="h-16 w-16 rounded-xl" />
                  <Skeleton className="h-16 w-16 rounded-xl" />
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
              onClick={() => loadReviews(page)}
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
            icon={<Star className="h-8 w-8 text-amber-400" />}
            title="Chưa có đánh giá nào"
            description="Bạn chưa viết đánh giá nào cho sản phẩm đã mua. Hãy kiểm tra các đơn hàng đã giao để viết đánh giá sản phẩm."
            actionLabel="Xem lịch sử đơn hàng"
            actionLink="/orders"
          />
        )}

        {/* Populated Reviews List */}
        {!isLoading && !error && items.length > 0 && (
          <div className="space-y-6 animate-fade-in">
            <div className="space-y-4">
              {items.map((item) => {
                const { review, product } = item
                const canEdit = review.viewer?.canEdit ?? false
                const isProductPublic = !!product.publicPath

                return (
                  <div
                    key={review.id}
                    className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs hover:border-slate-300 transition-all space-y-4"
                  >
                    {/* Header: Product Name, Options, Edit Action */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isProductPublic ? (
                            <Link
                              to={product.publicPath!}
                              className="font-extrabold text-base sm:text-lg text-slate-900 hover:text-emerald-600 transition-colors inline-flex items-center gap-1.5"
                            >
                              <span>{product.name}</span>
                              <ExternalLink className="h-4 w-4 text-slate-400 shrink-0" />
                            </Link>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              <span className="font-extrabold text-base sm:text-lg text-slate-700">
                                {product.name}
                              </span>
                              <Badge
                                variant="destructive"
                                className="text-[10px] py-0.5 px-2 font-bold"
                              >
                                Ngừng kinh doanh
                              </Badge>
                            </div>
                          )}
                        </div>

                        {review.purchasedOptions && review.purchasedOptions.length > 0 && (
                          <div className="text-xs font-medium text-slate-500">
                            Phân loại:{' '}
                            <span className="text-slate-700">
                              {review.purchasedOptions
                                .map((o) => `${o.groupLabel}: ${o.valueLabel}`)
                                .join(' • ')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Edit Button or Read-Only State */}
                      <div className="shrink-0 flex items-center gap-2">
                        {canEdit ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStartEdit(review)}
                            className="h-8 px-3 rounded-xl border-slate-300 hover:border-emerald-600 hover:text-emerald-600 font-bold text-xs gap-1.5"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Chỉnh sửa</span>
                          </Button>
                        ) : (
                          <span className="inline-flex items-center text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                            Đã chỉnh sửa (Chỉ đọc)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Rating Stars & Comment */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-4 w-4 ${
                              star <= review.rating
                                ? 'fill-amber-400 text-amber-400'
                                : 'fill-slate-100 text-slate-300'
                            }`}
                          />
                        ))}
                        <span className="ml-1 text-xs font-bold text-slate-700">
                          {review.rating}/5 sao
                        </span>
                      </div>

                      {review.comment ? (
                        <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                          {review.comment}
                        </p>
                      ) : (
                        <p className="text-xs italic text-slate-400">
                          (Không có nhận xét bằng chữ)
                        </p>
                      )}
                    </div>

                    {review.response && (
                      <div className="border-l-2 border-emerald-200 bg-emerald-50/60 px-4 py-3 space-y-1.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-xs font-bold text-emerald-800">
                            {review.response.authorLabel}
                          </p>
                          <time
                            className="text-[11px] text-slate-400"
                            dateTime={review.response.updatedAt}
                          >
                            {formatDate(review.response.updatedAt)}
                          </time>
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                          {review.response.content}
                        </p>
                      </div>
                    )}

                    {/* Media Items */}
                    {review.media && review.media.length > 0 && (
                      <div className="flex flex-wrap gap-2.5 pt-1">
                        {review.media.map((m) => {
                          if (m.type === 'video') {
                            return (
                              <div
                                key={m.id}
                                className="relative h-20 w-32 rounded-xl overflow-hidden border border-slate-200 bg-black flex items-center justify-center"
                              >
                                <video
                                  src={m.url}
                                  controls
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )
                          }
                          return (
                            <div
                              key={m.id}
                              className="relative h-20 w-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-50"
                            >
                              <img
                                src={m.url}
                                alt="Review media"
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Timestamp */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                      <div>Đã đánh giá vào {formatDate(review.createdAt)}</div>
                      {review.updatedAt && review.updatedAt !== review.createdAt && (
                        <div>(Chỉnh sửa vào {formatDate(review.updatedAt)})</div>
                      )}
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
                  {pagination.total} đánh giá)
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

        {/* Edit Review Modal */}
        {editingReview && (
          <ReviewFormModal
            open={isEditModalOpen}
            onOpenChange={(open) => {
              setIsEditModalOpen(open)
              if (!open) setEditingReview(null)
            }}
            mode="edit"
            existingReview={editingReview}
            onSuccess={handleEditSuccess}
          />
        )}
      </div>
    </div>
  )
}
