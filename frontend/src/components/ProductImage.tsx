import { useState } from 'react'

interface ProductImageProps {
  src: string
  alt: string
  className?: string
}

export default function ProductImage({ src, alt, className }: ProductImageProps) {
  const [failed, setFailed] = useState(!src)
  if (failed) {
    return <div className={`${className ?? ''} image-fallback`} role="img" aria-label={alt}>No image</div>
  }
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
}
