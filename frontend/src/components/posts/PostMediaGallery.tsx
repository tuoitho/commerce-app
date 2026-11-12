import { useState } from 'react'
import type { PostMediaAttachment } from '@/api/posts'
import { ImageLightbox } from '@/components/chat/ImageLightbox'

export interface PostMediaGalleryProps {
  media: PostMediaAttachment[]
  className?: string
}

export function PostMediaGallery({ media, className = '' }: PostMediaGalleryProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [lightboxAlt, setLightboxAlt] = useState<string>('')

  if (!media || media.length === 0) {
    return null
  }

  const images = media.filter((m) => m.fileType === 'image')
  const videos = media.filter((m) => m.fileType === 'video')

  const openLightbox = (src: string, alt: string) => {
    setLightboxSrc(src)
    setLightboxAlt(alt)
  }

  const closeLightbox = () => {
    setLightboxSrc(null)
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Videos */}
      {videos.map((vid) => (
        <div key={vid.id} className="overflow-hidden rounded-xl bg-black shadow-xs">
          <video
            src={vid.fileUrl}
            controls
            preload="metadata"
            playsInline
            className="w-full max-h-[480px] object-contain"
            aria-label={vid.fileName || 'Video bài viết'}
          />
        </div>
      ))}

      {/* Images Grid */}
      {images.length === 1 && (
        <button
          type="button"
          onClick={() => openLightbox(images[0].fileUrl, images[0].fileName)}
          aria-label={`Xem ảnh phóng to: ${images[0].fileName}`}
          className="group relative block w-full overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-100 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-600"
        >
          <img
            src={images[0].fileUrl}
            alt={images[0].fileName}
            className="w-full max-h-[480px] object-cover transition duration-200 group-hover:scale-[1.01]"
            loading="lazy"
          />
        </button>
      )}

      {images.length === 2 && (
        <div className="grid grid-cols-2 gap-2 overflow-hidden rounded-xl">
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => openLightbox(img.fileUrl, img.fileName)}
              aria-label={`Xem ảnh phóng to: ${img.fileName}`}
              className="group relative aspect-4/3 w-full overflow-hidden border border-zinc-200/80 bg-zinc-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-600 rounded-lg"
            >
              <img
                src={img.fileUrl}
                alt={img.fileName}
                className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {images.length === 3 && (
        <div className="grid grid-cols-3 gap-2 overflow-hidden rounded-xl">
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => openLightbox(img.fileUrl, img.fileName)}
              aria-label={`Xem ảnh phóng to: ${img.fileName}`}
              className="group relative aspect-square w-full overflow-hidden border border-zinc-200/80 bg-zinc-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-600 rounded-lg"
            >
              <img
                src={img.fileUrl}
                alt={img.fileName}
                className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {images.length >= 4 && (
        <div className="grid grid-cols-2 gap-2 overflow-hidden rounded-xl">
          {images.slice(0, 4).map((img, idx) => {
            const isLast = idx === 3 && images.length > 4
            const extraCount = images.length - 4

            return (
              <button
                key={img.id}
                type="button"
                onClick={() => openLightbox(img.fileUrl, img.fileName)}
                aria-label={`Xem ảnh phóng to: ${img.fileName}`}
                className="group relative aspect-square w-full overflow-hidden border border-zinc-200/80 bg-zinc-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-600 rounded-lg"
              >
                <img
                  src={img.fileUrl}
                  alt={img.fileName}
                  className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                  loading="lazy"
                />
                {isLast && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xl font-bold text-white backdrop-blur-[2px]">
                    +{extraCount}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Lightbox Modal */}
      <ImageLightbox
        isOpen={Boolean(lightboxSrc)}
        src={lightboxSrc || ''}
        alt={lightboxAlt}
        onClose={closeLightbox}
      />
    </div>
  )
}
