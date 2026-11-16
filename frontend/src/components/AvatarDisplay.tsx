import { useState } from 'react'
import { cn } from '@/lib/utils'

interface AvatarDisplayProps {
  src?: string | null
  name?: string | null
  email?: string | null
  size?: 'xs' | 'sm' | 'lg'
  className?: string
  alt?: string
}

const sizeClasses: Record<NonNullable<AvatarDisplayProps['size']>, string> = {
  xs: 'h-6 w-6 text-xs rounded-lg',
  sm: 'h-9 w-9 text-sm rounded-xl',
  lg: 'h-20 w-20 text-2xl rounded-2xl',
}

function AvatarImage({
  src,
  alt,
  onError,
}: {
  src: string
  alt: string
  onError: () => void
}) {
  return (
    <img
      src={src}
      alt={alt}
      onError={onError}
      className="h-full w-full object-cover"
    />
  )
}

export function AvatarDisplay({
  src,
  name,
  email,
  size = 'sm',
  className,
  alt,
}: AvatarDisplayProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const trimmedSrc = src?.trim() || ''
  const showImage = Boolean(trimmedSrc) && failedSrc !== trimmedSrc

  const sourceLabel = name?.trim() || email?.trim() || '?'
  const initial = Array.from(sourceLabel)[0]?.toUpperCase() || '?'
  const displayAlt = alt || `Ảnh đại diện của ${sourceLabel}`

  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-zinc-950 text-white font-mono font-bold uppercase shrink-0 select-none',
        sizeClasses[size],
        className
      )}
    >
      {showImage ? (
        <AvatarImage
          key={trimmedSrc}
          src={trimmedSrc}
          alt={displayAlt}
          onError={() => setFailedSrc(trimmedSrc)}
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  )
}
