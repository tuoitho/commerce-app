import React, { useState, useEffect, useRef } from 'react'
import { Star, Upload, X, Film, AlertCircle, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  type OrderItem,
  type Review,
  type ReviewMedia,
  ApiError,
} from '@/api/types'
import { createOrderItemReview, editOwnedReview } from '@/api/reviews'

export interface ReviewFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  orderId?: string
  orderItem?: OrderItem
  existingReview?: Review
  onSuccess: (review: Review) => void
  onRefreshAuthoritativeState?: () => Promise<void>
}

interface StagedFile {
  id: string
  file: File
  previewUrl: string
  isVideo: boolean
  sizeFormatted: string
}

const MAX_COMMENT_LENGTH = 1000
const MAX_MEDIA_COUNT = 5
const MAX_VIDEO_COUNT = 2
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024 // 50 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
])

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ReviewFormModal({
  open,
  onOpenChange,
  mode,
  orderId,
  orderItem,
  existingReview,
  onSuccess,
  onRefreshAuthoritativeState,
}: ReviewFormModalProps) {
  const [rating, setRating] = useState<number>(0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [comment, setComment] = useState<string>('')
  const [existingMedia, setExistingMedia] = useState<ReviewMedia[]>([])
  const [newFiles, setNewFiles] = useState<StagedFile[]>([])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && existingReview) {
        setRating(existingReview.rating || 0)
        setComment(existingReview.comment || '')
        setExistingMedia(existingReview.media || [])
      } else {
        setRating(0)
        setComment('')
        setExistingMedia([])
      }
      setNewFiles([])
      setFieldErrors({})
      setGlobalError(null)
      setRecoveryNotice(null)
      setIsRecovering(false)
    }
  }, [open, mode, existingReview])

  // Clean up object URLs on unmount/removal
  useEffect(() => {
    return () => {
      newFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    }
  }, [newFiles])

  const totalMediaCount = existingMedia.length + newFiles.length
  const existingVideoCount = existingMedia.filter((m) => m.type === 'video').length
  const newVideoCount = newFiles.filter((f) => f.isVideo).length
  const totalVideoCount = existingVideoCount + newVideoCount

  const handleStarKeyDown = (e: React.KeyboardEvent, starVal: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setRating(starVal)
      setFieldErrors((prev) => ({ ...prev, rating: '' }))
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(5, (rating || 0) + 1)
      setRating(next)
      setFieldErrors((prev) => ({ ...prev, rating: '' }))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      const prev = Math.max(1, (rating || 0) - 1)
      setRating(prev)
      setFieldErrors((prev) => ({ ...prev, rating: '' }))
    } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
      e.preventDefault()
      setRating(Number(e.key))
      setFieldErrors((prev) => ({ ...prev, rating: '' }))
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setFieldErrors((prev) => ({ ...prev, media: '', files: '' }))
    setGlobalError(null)

    const nextStaged: StagedFile[] = [...newFiles]
    let currentTotal = existingMedia.length + nextStaged.length
    let currentVideos = totalVideoCount

    for (const file of files) {
      if (currentTotal >= MAX_MEDIA_COUNT) {
        setFieldErrors((prev) => ({
          ...prev,
          media: `Tối đa ${MAX_MEDIA_COUNT} tệp hình ảnh/video`,
        }))
        break
      }

      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        setFieldErrors((prev) => ({
          ...prev,
          media: 'Định dạng tệp không được hỗ trợ. Chỉ chấp nhận JPEG, PNG, WebP, MP4, WebM',
        }))
        continue
      }

      const isVideo = file.type.startsWith('video/')
      if (isVideo) {
        if (currentVideos >= MAX_VIDEO_COUNT) {
          setFieldErrors((prev) => ({
            ...prev,
            media: `Tối đa ${MAX_VIDEO_COUNT} video cho mỗi đánh giá`,
          }))
          continue
        }
        if (file.size > MAX_VIDEO_BYTES) {
          setFieldErrors((prev) => ({
            ...prev,
            media: `Kích thước video ${file.name} vượt quá giới hạn 50MB`,
          }))
          continue
        }
        currentVideos++
      } else {
        if (file.size > MAX_IMAGE_BYTES) {
          setFieldErrors((prev) => ({
            ...prev,
            media: `Kích thước ảnh ${file.name} vượt quá giới hạn 5MB`,
          }))
          continue
        }
      }

      const staged: StagedFile = {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        isVideo,
        sizeFormatted: formatBytes(file.size),
      }
      nextStaged.push(staged)
      currentTotal++
    }

    setNewFiles(nextStaged)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveExistingMedia = (mediaId: string) => {
    setExistingMedia((prev) => prev.filter((m) => m.id !== mediaId))
    setFieldErrors((prev) => ({ ...prev, media: '' }))
  }

  const handleRemoveNewFile = (id: string) => {
    setNewFiles((prev) => {
      const target = prev.find((f) => f.id === id)
      if (target) {
        URL.revokeObjectURL(target.previewUrl)
      }
      return prev.filter((f) => f.id !== id)
    })
    setFieldErrors((prev) => ({ ...prev, media: '' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setGlobalError(null)

    // Client-side validation
    const errors: Record<string, string> = {}
    if (rating < 1 || rating > 5) {
      errors.rating = 'Vui lòng chọn điểm đánh giá từ 1 đến 5 sao'
    }
    const trimmed = comment.trim()
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      errors.comment = `Nhận xét không được vượt quá ${MAX_COMMENT_LENGTH} ký tự`
    }
    if (totalMediaCount > MAX_MEDIA_COUNT) {
      errors.media = `Tối đa ${MAX_MEDIA_COUNT} tệp hình ảnh/video`
    }
    if (totalVideoCount > MAX_VIDEO_COUNT) {
      errors.media = `Tối đa ${MAX_VIDEO_COUNT} video cho mỗi đánh giá`
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setIsSubmitting(true)
    const rawFiles = newFiles.map((f) => f.file)

    try {
      let savedReview: Review
      if (mode === 'create') {
        if (!orderId || !orderItem) {
          throw new Error('Thiếu thông tin đơn hàng hoặc sản phẩm')
        }
        savedReview = await createOrderItemReview(
          orderId,
          orderItem.id,
          { rating, comment: trimmed },
          rawFiles
        )
      } else {
        if (!existingReview) {
          throw new Error('Thiếu thông tin đánh giá cần chỉnh sửa')
        }
        savedReview = await editOwnedReview(
          existingReview.id,
          {
            rating,
            comment: trimmed,
            existingMediaIds: existingMedia.map((m) => m.id),
          },
          rawFiles
        )
      }

      onSuccess(savedReview)
      onOpenChange(false)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.isValidationError()) {
          setFieldErrors(err.fields || {})
        } else {
          setGlobalError(err.message || 'Đã xảy ra lỗi khi gửi đánh giá')
        }
      } else if (err instanceof TypeError || (err instanceof Error && err.name === 'AbortError')) {
        // Network timeout / drop
        setIsRecovering(true)
        setRecoveryNotice(
          'Không thể hoàn tất yêu cầu do mạng bị gián đoạn. Đang kiểm tra lại trạng thái...'
        )
        if (onRefreshAuthoritativeState) {
          try {
            await onRefreshAuthoritativeState()
          } catch {
            // Ignore refresh error
          }
        }
        setIsRecovering(false)
        setGlobalError(
          'Đã tải lại trạng thái mới nhất từ hệ thống. Bạn có thể kiểm tra và thử lại.'
        )
      } else {
        setGlobalError((err as Error).message || 'Đã xảy ra lỗi không xác định')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900">
            {mode === 'create' ? 'Đánh giá sản phẩm' : 'Chỉnh sửa đánh giá'}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {mode === 'create'
              ? 'Chia sẻ trải nghiệm của bạn về sản phẩm đã mua'
              : 'Đánh giá chỉ có thể chỉnh sửa 1 lần duy nhất'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'edit' && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <span>
              <strong>Lưu ý:</strong> Bạn chỉ có thể cập nhật đánh giá một lần duy nhất. Sau khi lưu, thông tin sẽ được giữ cố định.
            </span>
          </div>
        )}

        {/* Product item summary */}
        {orderItem && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
            <img
              src={orderItem.imageUrl || '/placeholder.png'}
              alt={orderItem.productName}
              className="w-14 h-14 object-cover rounded-md border border-slate-200 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-slate-800 truncate">
                {orderItem.productName}
              </h4>
              <p className="text-xs text-slate-500 truncate">
                {orderItem.brandName} {orderItem.model && `• ${orderItem.model}`}
              </p>
              {orderItem.options && orderItem.options.length > 0 && (
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  Phân loại:{' '}
                  {orderItem.options
                    .map((opt) => `${opt.groupLabel}: ${opt.valueLabel}`)
                    .join(', ')}
                </p>
              )}
            </div>
          </div>
        )}

        {recoveryNotice && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
            <span>{recoveryNotice}</span>
          </div>
        )}

        {globalError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <span>{globalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Star rating */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-800 flex items-center justify-between">
              <span>
                Chất lượng sản phẩm <span className="text-red-500">*</span>
              </span>
              <span className="text-xs font-normal text-slate-500">
                {rating > 0
                  ? ['Rất tệ', 'Tệ', 'Bình thường', 'Hài lòng', 'Rất tuyệt vời'][rating - 1]
                  : 'Chọn số sao'}
              </span>
            </Label>

            <div
              className="flex items-center gap-1.5 focus:outline-none"
              role="radiogroup"
              aria-label="Đánh giá sao"
            >
              {[1, 2, 3, 4, 5].map((starVal) => {
                const active = (hoverRating || rating) >= starVal
                return (
                  <button
                    key={starVal}
                    type="button"
                    role="radio"
                    aria-checked={rating === starVal}
                    aria-label={`${starVal} sao`}
                    tabIndex={0}
                    className="p-1 rounded-md transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    onMouseEnter={() => setHoverRating(starVal)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => {
                      setRating(starVal)
                      setFieldErrors((prev) => ({ ...prev, rating: '' }))
                    }}
                    onKeyDown={(e) => handleStarKeyDown(e, starVal)}
                  >
                    <Star
                      className={`w-7 h-7 transition-colors ${
                        active
                          ? 'fill-amber-400 text-amber-400'
                          : 'fill-transparent text-slate-300 hover:text-slate-400'
                      }`}
                    />
                  </button>
                )
              })}
            </div>
            {fieldErrors.rating && (
              <p className="text-xs text-red-600 font-medium">{fieldErrors.rating}</p>
            )}
          </div>

          {/* Comment text */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="review-comment" className="text-sm font-semibold text-slate-800">
                Nhận xét chi tiết
              </Label>
              <span
                className={`text-xs ${
                  comment.length > MAX_COMMENT_LENGTH ? 'text-red-600 font-bold' : 'text-slate-400'
                }`}
              >
                {comment.length}/{MAX_COMMENT_LENGTH}
              </span>
            </div>
            <textarea
              id="review-comment"
              rows={4}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value)
                setFieldErrors((prev) => ({ ...prev, comment: '' }))
              }}
              placeholder="Hãy chia sẻ cảm nhận thực tế về chất lượng, thiết kế, thời gian giao hàng..."
              className="w-full rounded-md border border-slate-200 p-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none resize-none transition"
            />
            {fieldErrors.comment && (
              <p className="text-xs text-red-600 font-medium">{fieldErrors.comment}</p>
            )}
          </div>

          {/* Media uploader */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-slate-800">
                Hình ảnh và video ({totalMediaCount}/{MAX_MEDIA_COUNT})
              </Label>
              <span className="text-xs text-slate-500">
                Tối đa {MAX_MEDIA_COUNT} tệp (tối đa {MAX_VIDEO_COUNT} video)
              </span>
            </div>

            {/* Media list / preview grid */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {/* Existing media */}
              {existingMedia.map((m) => (
                <div
                  key={m.id}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center"
                >
                  {m.type === 'video' ? (
                    <div className="relative w-full h-full flex items-center justify-center bg-slate-900">
                      <video src={m.url} className="w-full h-full object-cover opacity-80" />
                      <Film className="w-6 h-6 text-white absolute" />
                    </div>
                  ) : (
                    <img src={m.url} alt="Media preview" className="w-full h-full object-cover" />
                  )}
                  <button
                    type="button"
                    aria-label="Xóa tệp hiện có"
                    onClick={() => handleRemoveExistingMedia(m.id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-600 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white">
                    {m.type === 'video' ? 'Video' : 'Ảnh'}
                  </span>
                </div>
              ))}

              {/* Newly staged files */}
              {newFiles.map((staged) => (
                <div
                  key={staged.id}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-emerald-300 bg-emerald-50 flex items-center justify-center"
                >
                  {staged.isVideo ? (
                    <div className="relative w-full h-full flex items-center justify-center bg-slate-900">
                      <video src={staged.previewUrl} className="w-full h-full object-cover opacity-80" />
                      <Film className="w-6 h-6 text-white absolute" />
                    </div>
                  ) : (
                    <img src={staged.previewUrl} alt="Staged preview" className="w-full h-full object-cover" />
                  )}
                  <button
                    type="button"
                    aria-label="Xóa tệp vừa thêm"
                    onClick={() => handleRemoveNewFile(staged.id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-600 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-emerald-700/80 text-[10px] text-white">
                    {staged.sizeFormatted}
                  </span>
                </div>
              ))}

              {/* Upload trigger button */}
              {totalMediaCount < MAX_MEDIA_COUNT && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/50 flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-emerald-600 transition p-2 text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-[11px] font-medium leading-tight">Thêm ảnh/video</span>
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            {fieldErrors.media && (
              <p className="text-xs text-red-600 font-medium">{fieldErrors.media}</p>
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting || isRecovering}
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isRecovering || rating === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang lưu...
                </>
              ) : mode === 'create' ? (
                'Gửi đánh giá'
              ) : (
                'Lưu thay đổi'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
