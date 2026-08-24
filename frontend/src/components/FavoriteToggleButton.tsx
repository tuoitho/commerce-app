import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useFavorites } from '@/context/FavoritesContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/api/types'
import { cn } from '@/lib/utils'

export interface FavoriteToggleButtonProps {
  productId: string
  productName?: string
  showText?: boolean
  className?: string
  size?: 'sm' | 'default' | 'lg'
}

export function FavoriteToggleButton({
  productId,
  productName,
  showText = false,
  className,
  size = 'default',
}: FavoriteToggleButtonProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  const { favoriteIds, isPending, toggle } = useFavorites()
  const { success, error: toastError } = useToast()

  const isFavorited = favoriteIds.has(productId)
  const pending = isPending(productId)

  const accessibleName = isFavorited
    ? productName
      ? `Bỏ ${productName} khỏi yêu thích`
      : 'Bỏ khỏi yêu thích'
    : productName
    ? `Thêm ${productName} vào yêu thích`
    : 'Thêm vào yêu thích'

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()

    if (pending) {
      return
    }

    if (!isAuthenticated) {
      const redirectPath = encodeURIComponent(location.pathname + location.search)
      navigate(`/login?redirect=${redirectPath}`)
      return
    }

    try {
      await toggle(productId)
      if (isFavorited) {
        success('Đã xóa sản phẩm khỏi danh sách yêu thích')
      } else {
        success('Đã thêm sản phẩm vào danh sách yêu thích')
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError(err.message || 'Không thể cập nhật danh sách yêu thích')
      } else if (err instanceof Error) {
        toastError(err.message)
      } else {
        toastError('Không thể cập nhật danh sách yêu thích. Vui lòng thử lại.')
      }
    }
  }

  const iconSizes = {
    sm: 'h-3.5 w-3.5',
    default: 'h-4 w-4',
    lg: 'h-5 w-5',
  }

  return (
    <button
      type="button"
      aria-label={accessibleName}
      aria-pressed={isFavorited}
      title={accessibleName}
      disabled={pending}
      onClick={handleClick}
      className={cn(
        'inline-flex items-center justify-center transition-all select-none cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        showText
          ? 'gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
          : 'p-2 rounded-full bg-white/90 hover:bg-white text-slate-600 hover:text-rose-600 border border-slate-200/80 shadow-2xs backdrop-blur-xs',
        isFavorited && showText && 'border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100/60',
        className
      )}
    >
      <Heart
        className={cn(
          iconSizes[size],
          'transition-all shrink-0',
          isFavorited
            ? 'fill-rose-500 text-rose-500 scale-105'
            : 'text-slate-500 fill-none group-hover:text-rose-500 hover:scale-110'
        )}
      />
      {showText && (
        <span className="truncate">{isFavorited ? 'Đã yêu thích' : 'Yêu thích'}</span>
      )}
    </button>
  )
}
