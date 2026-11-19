import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Link as LinkIcon,
  Loader2,
  Star,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { uploadProductImage } from '@/api/products'
import { ApiError } from '@/api/types'
import { isValidProductImageUrl, validateProductImageFile } from '@/lib/validations/product'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface ProductImagesUploaderProps {
  imageUrls: string[]
  onChange: (urls: string[]) => void
  errors?: Record<string, string>
  disabled?: boolean
}

/**
 * Multi-file Object Storage image uploader and gallery manager with optional external URL fallback.
 */
export const ProductImagesUploader: React.FC<ProductImagesUploaderProps> = ({
  imageUrls,
  onChange,
  errors = {},
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const latestImageUrlsRef = useRef<string[]>(imageUrls)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showExternalUrl, setShowExternalUrl] = useState(false)
  const [externalUrlInput, setExternalUrlInput] = useState('')
  const [externalUrlError, setExternalUrlError] = useState<string | null>(null)

  useEffect(() => {
    latestImageUrlsRef.current = imageUrls
  }, [imageUrls])

  const handleFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0 || disabled || isUploading) return

    const files = Array.from(fileList)
    const validFiles: File[] = []
    const validationErrors: string[] = []

    for (const file of files) {
      const err = validateProductImageFile(file)
      if (err) {
        validationErrors.push(`${file.name}: ${err}`)
      } else {
        validFiles.push(file)
      }
    }

    if (validationErrors.length > 0) {
      setUploadError(validationErrors[0])
    } else {
      setUploadError(null)
    }

    if (validFiles.length === 0) return

    setIsUploading(true)
    const uploadedUrls: string[] = []
    const apiErrors: string[] = []

    try {
      for (const file of validFiles) {
        try {
          const result = await uploadProductImage(file)
          uploadedUrls.push(result.url)
        } catch (err) {
          if (err instanceof ApiError) {
            apiErrors.push(err.fields?.file || err.message)
          } else {
            apiErrors.push(`Không thể tải tệp ${file.name}. Vui lòng thử lại.`)
          }
        }
      }

      if (uploadedUrls.length > 0) {
        const next = [...latestImageUrlsRef.current, ...uploadedUrls]
        latestImageUrlsRef.current = next
        onChange(next)
      }
      if (apiErrors.length > 0) {
        setUploadError(apiErrors[0])
      }
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!disabled && !isUploading) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled || isUploading) return
    void handleFiles(e.dataTransfer?.files ?? null)
  }

  const handleMove = (index: number, direction: -1 | 1) => {
    if (disabled) return
    const current = latestImageUrlsRef.current
    const target = index + direction
    if (target < 0 || target >= current.length) return
    const next = [...current]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    latestImageUrlsRef.current = next
    onChange(next)
  }

  const handleSetPrimary = (index: number) => {
    const current = latestImageUrlsRef.current
    if (disabled || index <= 0 || index >= current.length) return
    const next = [...current]
    const [selected] = next.splice(index, 1)
    next.unshift(selected)
    latestImageUrlsRef.current = next
    onChange(next)
  }

  const handleDelete = (index: number) => {
    if (disabled) return
    const next = latestImageUrlsRef.current.filter((_, idx) => idx !== index)
    latestImageUrlsRef.current = next
    onChange(next)
  }

  const handleAddExternalUrl = () => {
    if (disabled) return
    const trimmed = externalUrlInput.trim()
    if (!isValidProductImageUrl(trimmed)) {
      setExternalUrlError('Đường dẫn ảnh phải là URL http(s) hợp lệ hoặc /media/products/...')
      return
    }
    setExternalUrlError(null)
    const next = [...latestImageUrlsRef.current, trimmed]
    latestImageUrlsRef.current = next
    onChange(next)
    setExternalUrlInput('')
  }

  const rootError = errors['imageUrls']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label htmlFor="product-images-upload" className="text-sm font-semibold text-slate-800">
            Hình ảnh sản phẩm
          </Label>
          <p className="text-xs text-slate-500 mt-0.5">
            Tải trực tiếp nhiều ảnh lên Object Storage (JPEG, PNG, WebP, tối đa 10 MB/tệp). Ảnh đầu tiên là ảnh đại diện.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-expanded={showExternalUrl}
          onClick={() => setShowExternalUrl((prev) => !prev)}
        >
          <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
          Thêm URL ảnh ngoài
          {showExternalUrl ? (
            <ChevronUp className="h-3.5 w-3.5 ml-1" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 ml-1" />
          )}
        </Button>
      </div>

      {/* Dropzone */}
      <div
        data-testid="product-image-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'rounded-xl border-2 border-dashed p-5 text-center transition-colors',
          isDragging
            ? 'border-blue-500 bg-blue-50/70'
            : 'border-slate-200 bg-slate-50/50 hover:border-slate-300',
          disabled && 'opacity-60 pointer-events-none'
        )}
      >
        <input
          ref={fileInputRef}
          id="product-images-upload"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          aria-label="Tải lên hình ảnh sản phẩm"
          disabled={disabled || isUploading}
          onChange={handleFileInputChange}
          className="sr-only"
        />

        <div className="flex flex-col items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-xs">
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            ) : (
              <UploadCloud className="h-5 w-5 text-blue-600" />
            )}
          </div>
          <div className="text-sm text-slate-700 font-medium">
            {isUploading ? 'Đang tải ảnh lên...' : 'Kéo thả ảnh vào đây hoặc chọn từ máy'}
          </div>
          <p className="text-xs text-slate-500">
            Hỗ trợ JPEG, PNG, WebP (tối đa 10 MB mỗi ảnh)
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="mt-1"
          >
            <ImagePlus className="h-4 w-4 mr-1.5" />
            Chọn tệp ảnh
          </Button>
        </div>
      </div>

      {/* Optional External URL Input */}
      {showExternalUrl && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
          <Label htmlFor="external-image-url" className="text-xs font-medium text-slate-700">
            Đường dẫn URL ảnh ngoài
          </Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="external-image-url"
              type="text"
              aria-label="Đường dẫn URL ảnh ngoài"
              placeholder="https://example.com/image.jpg hoặc /media/products/..."
              value={externalUrlInput}
              disabled={disabled}
              error={Boolean(externalUrlError)}
              onChange={(e) => {
                setExternalUrlInput(e.target.value)
                if (externalUrlError) setExternalUrlError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddExternalUrl()
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={handleAddExternalUrl}
              className="shrink-0"
            >
              Thêm URL
            </Button>
          </div>
          {externalUrlError && (
            <p className="text-xs text-rose-600 font-medium" role="alert">
              {externalUrlError}
            </p>
          )}
        </div>
      )}

      {/* Upload / Root Errors */}
      {(uploadError || rootError) && (
        <p className="text-xs text-rose-600 font-medium" role="alert">
          {uploadError || rootError}
        </p>
      )}

      {/* Image Preview Grid */}
      {imageUrls.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {imageUrls.map((url, index) => {
            const itemError = errors[`imageUrls.${index}`] || errors[`imageUrls[${index}]`]
            return (
              <div
                key={`${url}-${index}`}
                className={cn(
                  'rounded-xl border bg-white p-3 flex flex-col gap-2.5 shadow-2xs',
                  index === 0 ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'
                )}
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-slate-100 border border-slate-100">
                  <img
                    src={url}
                    alt={`Ảnh sản phẩm ${index + 1}`}
                    className="h-full w-full object-contain"
                  />
                  {index === 0 && (
                    <Badge variant="default" className="absolute top-2 left-2 bg-blue-600">
                      Ảnh đại diện
                    </Badge>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 truncate" title={url}>
                  {url}
                </p>

                {itemError && (
                  <p className="text-xs text-rose-600 font-medium" role="alert">
                    {itemError}
                  </p>
                )}

                <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Di chuyển ảnh ${index + 1} lên`}
                      disabled={disabled || index === 0}
                      onClick={() => handleMove(index, -1)}
                      className="h-7 w-7 p-0"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Di chuyển ảnh ${index + 1} xuống`}
                      disabled={disabled || index === imageUrls.length - 1}
                      onClick={() => handleMove(index, 1)}
                      className="h-7 w-7 p-0"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    {index > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Đặt ảnh ${index + 1} làm ảnh đại diện`}
                        disabled={disabled}
                        onClick={() => handleSetPrimary(index)}
                        className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Star className="h-3.5 w-3.5 mr-1" />
                        Đặt đại diện
                      </Button>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Xóa ảnh ${index + 1}`}
                    disabled={disabled}
                    onClick={() => handleDelete(index)}
                    className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
