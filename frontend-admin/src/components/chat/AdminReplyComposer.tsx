import { useState, useRef, useEffect, type ChangeEvent, type KeyboardEvent } from 'react'
import { Paperclip, Send, Loader2, X, AlertCircle, Film, FileQuestion } from 'lucide-react'
import { uploadAdminMedia, type AdminChatAttachment, type ChatAttachmentType } from '@/api/chat'

export interface PendingMedia {
  tempId: string
  file: File
  previewUrl: string
  fileType: ChatAttachmentType | 'unsupported'
  isUploading: boolean
  attachment?: AdminChatAttachment
  error?: string
}

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm']

export function validateMediaFile(file: File): {
  valid: boolean
  error?: string
  fileType?: ChatAttachmentType
} {
  if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
    if (file.size > MAX_IMAGE_SIZE) {
      return { valid: false, error: 'Kích thước ảnh không được vượt quá 10MB' }
    }
    return { valid: true, fileType: 'image' }
  }

  if (ALLOWED_VIDEO_TYPES.includes(file.type)) {
    if (file.size > MAX_VIDEO_SIZE) {
      return { valid: false, error: 'Kích thước video không được vượt quá 50MB' }
    }
    return { valid: true, fileType: 'video' }
  }

  return {
    valid: false,
    error: 'Chỉ hỗ trợ định dạng ảnh (JPEG, PNG, WebP, GIF) hoặc video (MP4, WebM)',
  }
}

export interface AdminReplyComposerProps {
  conversationId: string
  onSendMessage: (payload: { content?: string; attachmentIds?: string[] }) => Promise<void>
  disabled?: boolean
}

export function AdminReplyComposer({
  conversationId,
  onSendMessage,
  disabled = false,
}: AdminReplyComposerProps) {
  const [content, setContent] = useState('')
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingMediaRef = useRef<PendingMedia[]>(pendingMedia)

  useEffect(() => {
    pendingMediaRef.current = pendingMedia
  }, [pendingMedia])

  // Cleanup object URLs when unmounting
  useEffect(() => {
    return () => {
      pendingMediaRef.current.forEach((item) => {
        if (item.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(item.previewUrl)
        }
      })
    }
  }, [])

  // Clear composer state when conversation changes
  useEffect(() => {
    setContent('')
    pendingMediaRef.current.forEach((item) => {
      if (item.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl)
      }
    })
    setPendingMedia([])
    setComposerError(null)
  }, [conversationId])

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setComposerError(null)
    const newPendingItems: PendingMedia[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const validation = validateMediaFile(file)
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const previewUrl = URL.createObjectURL(file)

      if (!validation.valid) {
        newPendingItems.push({
          tempId,
          file,
          previewUrl,
          fileType: 'unsupported',
          isUploading: false,
          error: validation.error,
        })
      } else {
        newPendingItems.push({
          tempId,
          file,
          previewUrl,
          fileType: validation.fileType!,
          isUploading: true,
        })
      }
    }

    setPendingMedia((prev) => [...prev, ...newPendingItems])

    // Reset file input value so same files can be re-selected if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    // Trigger upload for valid items
    for (const item of newPendingItems) {
      if (item.error) continue

      try {
        const attachment = await uploadAdminMedia(item.file)
        setPendingMedia((prev) =>
          prev.map((p) =>
            p.tempId === item.tempId
              ? { ...p, isUploading: false, attachment }
              : p
          )
        )
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : 'Tải tệp thất bại, vui lòng thử lại'
        setPendingMedia((prev) =>
          prev.map((p) =>
            p.tempId === item.tempId
              ? { ...p, isUploading: false, error: errorMsg }
              : p
          )
        )
      }
    }
  }

  const handleRemovePendingMedia = (tempId: string) => {
    setPendingMedia((prev) => {
      const target = prev.find((p) => p.tempId === tempId)
      if (target && target.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(target.previewUrl)
      }
      return prev.filter((p) => p.tempId !== tempId)
    })
  }

  const hasUploadingMedia = pendingMedia.some((m) => m.isUploading)
  const readyAttachments = pendingMedia.filter((m) => m.attachment && !m.error)
  const isMessageEmpty = content.trim().length === 0 && readyAttachments.length === 0
  const isSendDisabled =
    disabled || isSubmitting || hasUploadingMedia || isMessageEmpty || content.length > 2000

  const handleSend = async () => {
    if (isSendDisabled) return

    setIsSubmitting(true)
    setComposerError(null)

    try {
      const attachmentIds = readyAttachments.map((m) => m.attachment!.id)
      await onSendMessage({
        content: content.trim() || undefined,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
      })

      // Clean up object URLs
      pendingMedia.forEach((m) => {
        if (m.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(m.previewUrl)
        }
      })
      setContent('')
      setPendingMedia([])
      if (textareaRef.current) {
        textareaRef.current.focus()
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Gửi tin nhắn thất bại, vui lòng thử lại'
      setComposerError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isSendDisabled) {
        handleSend()
      }
    }
  }

  return (
    <div
      data-testid="admin-reply-composer"
      className="border-t border-slate-200 bg-white p-3 flex flex-col gap-2 shrink-0"
    >
      {/* Error alert */}
      {composerError && (
        <div
          data-testid="composer-error-alert"
          className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
          <span className="flex-1">{composerError}</span>
          <button
            type="button"
            onClick={() => setComposerError(null)}
            className="text-rose-400 hover:text-rose-600"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Pending Media Preview Chips */}
      {pendingMedia.length > 0 && (
        <div
          data-testid="admin-pending-media-container"
          className="flex flex-wrap gap-2 rounded-xl bg-slate-50 p-2 border border-slate-100"
        >
          {pendingMedia.map((item) => (
            <div
              key={item.tempId}
              data-testid={`admin-pending-media-${item.tempId}`}
              className={`group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white shadow-2xs ${
                item.error ? 'border-rose-300' : 'border-slate-200'
              }`}
            >
              {item.fileType === 'image' ? (
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="h-full w-full object-cover"
                />
              ) : item.fileType === 'video' ? (
                <div className="flex flex-col items-center justify-center text-slate-500 gap-1 p-1">
                  <Film className="h-5 w-5 text-slate-600" />
                  <span className="max-w-[50px] truncate text-[9px]">{item.file.name}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-rose-500 gap-1 p-1">
                  <FileQuestion className="h-5 w-5" />
                  <span className="max-w-[50px] truncate text-[9px]">{item.file.name}</span>
                </div>
              )}

              {/* Uploading Spinner */}
              {item.isUploading && (
                <div
                  data-testid="media-uploading-spinner"
                  className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}

              {/* Error Indicator */}
              {item.error && (
                <div
                  title={item.error}
                  className="absolute inset-0 flex items-center justify-center bg-rose-900/60 text-white p-1"
                >
                  <AlertCircle className="h-4 w-4 text-rose-200" />
                </div>
              )}

              {/* Remove Button */}
              <button
                type="button"
                data-testid={`remove-pending-media-${item.tempId}`}
                onClick={() => handleRemovePendingMedia(item.tempId)}
                aria-label={`Xóa tệp ${item.file.name}`}
                className="absolute -top-1 -right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-white hover:bg-rose-600 transition"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="flex items-end gap-2">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
          multiple
          className="hidden"
          data-testid="admin-chat-file-input"
        />

        {/* Attach Media Button */}
        <button
          type="button"
          data-testid="admin-attach-file-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isSubmitting}
          title="Đính kèm hình ảnh hoặc video"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-blue-600 disabled:opacity-50 transition"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            data-testid="admin-chat-textarea"
            rows={2}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || isSubmitting}
            placeholder="Nhập nội dung phản hồi khách hàng... (Enter để gửi, Shift+Enter xuống dòng)"
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
          />
          {content.length > 1800 && (
            <span
              className={`absolute right-2 bottom-2 text-[10px] tabular-nums ${
                content.length > 2000 ? 'text-rose-600 font-bold' : 'text-slate-400'
              }`}
            >
              {content.length}/2000
            </span>
          )}
        </div>

        {/* Send Button */}
        <button
          type="button"
          data-testid="admin-send-message-btn"
          onClick={handleSend}
          disabled={isSendDisabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs hover:bg-blue-700 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none transition"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  )
}
