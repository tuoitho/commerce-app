import React, { useState, useEffect, useId, useRef } from 'react'
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
import { useToast } from '@/context/ToastContext'
import { createOrderItemReview, updateOrderItemReview } from '@/api/reviews'
import {
  ApiError,
  type OrderItem,
  type Review,
  type ReviewMedia,
} from '@/api/types'
import { Star, ImagePlus, X, AlertCircle, Film, Info } from 'lucide-react'

interface ReviewFormDialogProps {
  isOpen: boolean
  onClose: () => void
  orderId: string
  item: OrderItem
  existingReview?: Review | null
  onSuccess: (review: Review) => void
}

interface NewMediaFile {
  id: string
  file: File
  type: 'image' | 'video'
  previewUrl: string
}

const RATING_LABELS: Record<number, string> = {
  1: 'Rất tệ',
  2: 'Tệ',
  3: 'Bình thường',
  4: 'Hài lòng',
  5: 'Tuyệt vời',
}

const MAX_IMAGES = 5
const MAX_VIDEO = 1
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024 // 50MB
const MAX_COMMENT_LENGTH = 1000

export const ReviewFormDialog: React.FC<ReviewFormDialogProps> = ({
  isOpen,
  onClose,
  orderId,
  item,
  existingReview,
  onSuccess,
}) => {
  const { success } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEditMode = Boolean(existingReview)
  const [rating, setRating] = useState<number>(0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [comment, setComment] = useState<string>('')
  const [retainedMedia, setRetainedMedia] = useState<ReviewMedia[]>([])
  const [newMedia, setNewMedia] = useState<NewMediaFile[]>([])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const commentId = useId()

  // Initialize or reset form state when dialog opens
  useEffect(() => {
    if (isOpen) {
      if (existingReview) {
        setRating(existingReview.rating || 0)
        setComment(existingReview.comment || '')
        setRetainedMedia(existingReview.media || [])
      } else {
        setRating(5)
        setComment('')
        setRetainedMedia([])
      }
      setNewMedia([])
      setFieldErrors({})
      setGeneralError(null)
      setHoverRating(0)
    } else {
      // Cleanup all preview object URLs on close
      newMedia.forEach((m) => URL.revokeObjectURL(m.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, existingReview])

  const handleRatingSelect = (selectedRating: number) => {
    setRating(selectedRating)
    if (fieldErrors.rating) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next.rating
        return next
      })
    }
  }

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setComment(val)
    if (fieldErrors.comment) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next.comment
        return next
      })
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const currentImagesCount =
      retainedMedia.filter((m) => m.type === 'image').length +
      newMedia.filter((m) => m.type === 'image').length
    const currentVideosCount =
      retainedMedia.filter((m) => m.type === 'video').length +
      newMedia.filter((m) => m.type === 'video').length

    let addedImagesCount = 0
    let addedVideosCount = 0
    const newFiles: NewMediaFile[] = []
    const errors: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')

      if (!isImage && !isVideo) {
        errors.push(`Định dạng tệp "${file.name}" không được hỗ trợ.`)
        continue
      }

      if (isImage) {
        if (currentImagesCount + addedImagesCount >= MAX_IMAGES) {
          errors.push(`Tối đa ${MAX_IMAGES} hình ảnh cho mỗi đánh giá.`)
          continue
        }
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
          errors.push(`Hình ảnh "${file.name}" vượt quá kích thước 5MB.`)
          continue
        }
        addedImagesCount++
        newFiles.push({
          id: `new-${Date.now()}-${Math.random()}`,
          file,
          type: 'image',
          previewUrl: URL.createObjectURL(file),
        })
      } else if (isVideo) {
        if (currentVideosCount + addedVideosCount >= MAX_VIDEO) {
          errors.push(`Tối đa ${MAX_VIDEO} video cho mỗi đánh giá.`)
          continue
        }
        if (file.size > MAX_VIDEO_SIZE_BYTES) {
          errors.push(`Video "${file.name}" vượt quá kích thước 50MB.`)
          continue
        }
        addedVideosCount++
        newFiles.push({
          id: `new-${Date.now()}-${Math.random()}`,
          file,
          type: 'video',
          previewUrl: URL.createObjectURL(file),
        })
      }
    }

    if (errors.length > 0) {
      setFieldErrors((prev) => ({ ...prev, media: errors[0] }))
    } else if (fieldErrors.media) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next.media
        return next
      })
    }

    if (newFiles.length > 0) {
      setNewMedia((prev) => [...prev, ...newFiles])
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveRetainedMedia = (mediaId: string) => {
    setRetainedMedia((prev) => prev.filter((m) => m.id !== mediaId))
    if (fieldErrors.media) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next.media
        return next
      })
    }
  }

  const handleRemoveNewMedia = (id: string) => {
    setNewMedia((prev) => {
      const item = prev.find((m) => m.id === id)
      if (item) {
        URL.revokeObjectURL(item.previewUrl)
      }
      return prev.filter((m) => m.id !== id)
    })
    if (fieldErrors.media) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next.media
        return next
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: Record<string, string> = {}
    if (rating < 1 || rating > 5) {
      errors.rating = 'Vui lòng chọn mức đánh giá từ 1 đến 5 sao.'
    }

    const charCount = Array.from(comment).length
    if (charCount > MAX_COMMENT_LENGTH) {
      errors.comment = `Nhận xét tối đa ${MAX_COMMENT_LENGTH} ký tự (hiện tại: ${charCount}).`
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setSubmitting(true)
    setFieldErrors({})
    setGeneralError(null)

    const imagesToUpload = newMedia.filter((m) => m.type === 'image').map((m) => m.file)
    const videoToUpload = newMedia.find((m) => m.type === 'video')?.file

    try {
      let savedReview: Review
      if (isEditMode) {
        savedReview = await updateOrderItemReview(orderId, item.id, {
          rating,
          comment: comment.trim(),
          retainedMediaIds: retainedMedia.map((m) => m.id),
          images: imagesToUpload,
          video: videoToUpload,
        })
        success('Cập nhật đánh giá thành công!')
      } else {
        savedReview = await createOrderItemReview(orderId, item.id, {
          rating,
          comment: comment.trim(),
          images: imagesToUpload,
          video: videoToUpload,
        })
        success('Gửi đánh giá sản phẩm thành công!')
      }

      onSuccess(savedReview)
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isValidationError() && err.fields) {
          setFieldErrors(err.fields)
        } else {
          setGeneralError(err.message)
        }
      } else {
        setGeneralError('Đã có lỗi xảy ra khi lưu đánh giá. Vui lòng thử lại.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const activeStarRating = hoverRating || rating
  const commentCharCount = Array.from(comment).length
  const totalImagesCount =
    retainedMedia.filter((m) => m.type === 'image').length +
    newMedia.filter((m) => m.type === 'image').length
  const totalVideosCount =
    retainedMedia.filter((m) => m.type === 'video').length +
    newMedia.filter((m) => m.type === 'video').length

  const canAddMoreMedia = totalImagesCount < MAX_IMAGES || totalVideosCount < MAX_VIDEO

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? 'Chỉnh sửa đánh giá sản phẩm' : 'Đánh giá sản phẩm'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Chia sẻ trải nghiệm sử dụng thực tế của bạn sau khi chỉnh sửa.'
              : 'Đánh giá chân thực giúp người mua khác đưa ra quyết định tốt hơn.'}
          </DialogDescription>
        </DialogHeader>

        {isEditMode && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Lưu ý quan trọng:</span> Đánh giá chỉ được chỉnh sửa một lần duy nhất. Hãy kiểm tra kỹ trước khi hoàn tất.
            </div>
          </div>
        )}

        {generalError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{generalError}</span>
          </div>
        )}

        {/* Product Snapshot Info */}
        <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border border-border/50">
          <div className="w-14 h-14 rounded-md overflow-hidden bg-background shrink-0 border border-border/40">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.productName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                Ảnh
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground line-clamp-1">
              {item.productName}
            </p>
            {item.model && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                Phân loại: {item.model}
              </p>
            )}
            {item.options && item.options.length > 0 && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {item.options.map((opt) => `${opt.groupLabel}: ${opt.valueLabel}`).join(', ')}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Star Rating */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Chất lượng sản phẩm <span className="text-destructive">*</span>
            </Label>
            <div
              className="flex items-center gap-1.5"
              role="radiogroup"
              aria-label="Đánh giá sao"
            >
              {[1, 2, 3, 4, 5].map((star) => {
                const isFilled = star <= activeStarRating
                return (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={rating === star}
                    aria-label={`${star} sao`}
                    disabled={submitting}
                    onClick={() => handleRatingSelect(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 rounded-md text-muted-foreground hover:text-amber-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  >
                    <Star
                      className={`w-7 h-7 transition-transform active:scale-90 ${
                        isFilled
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-muted-foreground/40'
                      }`}
                    />
                  </button>
                )
              })}
              {activeStarRating > 0 && (
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400 ml-2">
                  {RATING_LABELS[activeStarRating]}
                </span>
              )}
            </div>
            {fieldErrors.rating && (
              <p className="text-xs text-destructive mt-1">{fieldErrors.rating}</p>
            )}
          </div>

          {/* Comment Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={commentId} className="text-sm font-medium">
                Nhận xét chi tiết
              </Label>
              <span
                className={`text-xs ${
                  commentCharCount > MAX_COMMENT_LENGTH
                    ? 'text-destructive font-semibold'
                    : 'text-muted-foreground'
                }`}
              >
                {commentCharCount}/{MAX_COMMENT_LENGTH}
              </span>
            </div>
            <textarea
              id={commentId}
              rows={4}
              value={comment}
              onChange={handleCommentChange}
              disabled={submitting}
              placeholder="Hãy chia sẻ trải nghiệm sử dụng, chất lượng sản phẩm, độ hoàn thiện..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 resize-y"
            />
            {fieldErrors.comment && (
              <p className="text-xs text-destructive mt-1">{fieldErrors.comment}</p>
            )}
          </div>

          {/* Media Attachments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Hình ảnh / Video thực tế
              </Label>
              <span className="text-xs text-muted-foreground">
                Tối đa {MAX_IMAGES} ảnh (5MB/ảnh) & {MAX_VIDEO} video (50MB)
              </span>
            </div>

            {/* Media list / thumbnails */}
            <div className="grid grid-cols-4 gap-2.5">
              {/* Retained Media (Edit mode) */}
              {retainedMedia.map((m) => (
                <div
                  key={m.id}
                  className="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted group"
                >
                  {m.type === 'video' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-black/80 text-white">
                      <Film className="w-6 h-6 mb-1 text-primary" />
                      <span className="text-[10px] uppercase font-semibold">Video</span>
                    </div>
                  ) : (
                    <img
                      src={m.url}
                      alt="Ảnh đánh giá cũ"
                      className="w-full h-full object-cover"
                    />
                  )}
                  {!submitting && (
                    <button
                      type="button"
                      aria-label="Xóa ảnh cũ"
                      onClick={() => handleRemoveRetainedMedia(m.id)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-destructive transition-colors focus:outline-none"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}

              {/* Newly added media */}
              {newMedia.map((m) => (
                <div
                  key={m.id}
                  className="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted group"
                >
                  {m.type === 'video' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-black/80 text-white">
                      <Film className="w-6 h-6 mb-1 text-primary" />
                      <span className="text-[10px] uppercase font-semibold">Video mới</span>
                    </div>
                  ) : (
                    <img
                      src={m.previewUrl}
                      alt="Ảnh tải lên"
                      className="w-full h-full object-cover"
                    />
                  )}
                  {!submitting && (
                    <button
                      type="button"
                      aria-label="Xóa tệp vừa thêm"
                      onClick={() => handleRemoveNewMedia(m.id)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-destructive transition-colors focus:outline-none"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}

              {/* Add file trigger */}
              {canAddMoreMedia && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-border/80 hover:border-primary/60 hover:bg-muted/30 flex flex-col items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <ImagePlus className="w-5 h-5 mb-1 text-muted-foreground" />
                  <span className="text-[11px] font-medium">Thêm tệp</span>
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              multiple
              className="hidden"
              onChange={handleFileChange}
              disabled={submitting}
            />

            {fieldErrors.media && (
              <p className="text-xs text-destructive mt-1">{fieldErrors.media}</p>
            )}
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Hủy bỏ
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Đang gửi...'
                : isEditMode
                ? 'Hoàn tất chỉnh sửa'
                : 'Gửi đánh giá'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
