import { useState } from 'react'
import { X, Loader2, Film, AlertCircle, ZoomIn, FileQuestion } from 'lucide-react'
import { getAuthenticatedMediaUrl, type ChatAttachment, type ChatAttachmentType } from '@/api/chat'
import { ImageLightbox } from './ImageLightbox'

export interface PendingMedia {
  tempId: string
  file: File
  previewUrl: string
  fileType: ChatAttachmentType | 'unsupported'
  isUploading: boolean
  attachment?: ChatAttachment
  error?: string
}

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm']

export function validateMediaFile(file: File): { valid: boolean; error?: string; fileType?: ChatAttachmentType } {
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

export interface PendingMediaPreviewProps {
  pendingMedia: PendingMedia[]
  onRemove: (tempId: string) => void
}

export function PendingMediaPreview({ pendingMedia, onRemove }: PendingMediaPreviewProps) {
  if (pendingMedia.length === 0) return null

  return (
    <div
      data-testid="pending-media-preview-container"
      className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/70 p-2 text-xs"
    >
      {pendingMedia.map((item) => (
        <div
          key={item.tempId}
          data-testid={`pending-media-item-${item.tempId}`}
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
            onClick={() => onRemove(item.tempId)}
            aria-label={`Xóa tệp ${item.file.name}`}
            className="absolute -top-1 -right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-white hover:bg-rose-600 transition"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

export interface MessageAttachmentsProps {
  attachments: ChatAttachment[]
  token?: string | null
}

export function MessageAttachments({ attachments, token }: MessageAttachmentsProps) {
  const [activeImage, setActiveImage] = useState<string | null>(null)

  if (!attachments || attachments.length === 0) return null

  return (
    <>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {attachments.map((att) => {
          if (att.fileType === 'image') {
            const authImgUrl = getAuthenticatedMediaUrl(att.fileUrl, token)
            return (
              <button
                type="button"
                key={att.id}
                data-testid={`message-attachment-image-${att.id}`}
                aria-label={att.fileName || 'Xem ảnh phóng to'}
                className="group relative max-h-56 max-w-xs overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 cursor-pointer shadow-xs text-left focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                onClick={() => setActiveImage(authImgUrl)}
              >
                <img
                  src={authImgUrl}
                  alt={att.fileName || 'Ảnh đính kèm'}
                  loading="lazy"
                  className="max-h-56 w-auto object-cover transition duration-150 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 group-hover:bg-black/20 group-hover:opacity-100 transition">
                  <ZoomIn className="h-5 w-5 text-white drop-shadow-md" />
                </div>
              </button>
            )
          }

          if (att.fileType === 'video') {
            const authVideoUrl = getAuthenticatedMediaUrl(att.fileUrl, token)
            return (
              <div
                key={att.id}
                data-testid={`message-attachment-video-${att.id}`}
                className="w-full max-w-sm overflow-hidden rounded-xl border border-slate-200/80 bg-black shadow-xs"
              >
                <video
                  controls
                  preload="metadata"
                  className="max-h-60 w-full object-contain"
                >
                  <source src={authVideoUrl} type={att.mimeType || 'video/mp4'} />
                  Trình duyệt không hỗ trợ xem video trực tiếp.
                </video>
              </div>
            )
          }

          return null
        })}
      </div>

      <ImageLightbox
        src={activeImage || ''}
        isOpen={Boolean(activeImage)}
        onClose={() => setActiveImage(null)}
      />
    </>
  )
}
