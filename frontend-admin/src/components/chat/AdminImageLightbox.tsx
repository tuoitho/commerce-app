import { useEffect } from 'react'
import { X } from 'lucide-react'

export interface AdminImageLightboxProps {
  src: string
  alt?: string
  isOpen: boolean
  onClose: () => void
}

export function AdminImageLightbox({
  src,
  alt = 'Ảnh phóng to',
  isOpen,
  onClose,
}: AdminImageLightboxProps) {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      data-testid="image-lightbox-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh phóng to"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
    >
      <button
        type="button"
        data-testid="close-lightbox-btn"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Đóng xem ảnh"
        className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition focus:outline-none"
      >
        <X className="h-6 w-6" />
      </button>

      <div
        className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          data-testid="lightbox-image"
          src={src}
          alt={alt}
          className="max-h-[90vh] max-w-[90vw] object-contain select-none"
        />
      </div>
    </div>
  )
}
