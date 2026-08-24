import { type MouseEvent, type KeyboardEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Heart, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useFavorites } from '@/context/FavoritesContext'
import { useToast } from '@/context/ToastContext'
import { createFavoriteLoginRedirect } from '@/utils/authRedirect'

export interface FavoriteButtonProps {
  productId: string
  initialIsFavorite?: boolean
  surface: 'product-card' | 'product-detail'
  className?: string
  disabled?: boolean
}

export function FavoriteButton({
  productId,
  initialIsFavorite = false,
  surface,
  className = '',
  disabled = false,
}: FavoriteButtonProps) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const { resolveIsFavorite, isPending, mutate } = useFavorites()
  const { error: toastError } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const isFavorite = resolveIsFavorite(productId, initialIsFavorite)
  const pending = isPending(productId)

  const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()

    if (disabled || pending || isAuthLoading) {
      return
    }

    if (!isAuthenticated) {
      const redirectUrl = createFavoriteLoginRedirect({
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      })
      navigate(redirectUrl)
      return
    }

    const outcome = await mutate({
      productId,
      nextState: !isFavorite,
    })

    if (outcome.kind === 'failed') {
      toastError(
        'Không thể cập nhật yêu thích',
        'Đã xảy ra lỗi khi cập nhật danh sách yêu thích. Vui lòng thử lại.'
      )
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation()
    }
  }

  const accessibleName = isFavorite ? 'Bỏ khỏi yêu thích' : 'Thêm vào yêu thích'

  if (surface === 'product-detail') {
    return (
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={disabled || pending || isAuthLoading}
        aria-label={accessibleName}
        aria-pressed={isFavorite}
        title={accessibleName}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border font-bold transition-all select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
          isFavorite
            ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-300'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400'
        } ${
          disabled || pending || isAuthLoading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        } ${className}`}
      >
        {pending ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : (
          <Heart
            className={`h-5 w-5 transition-transform ${
              isFavorite ? 'fill-rose-500 text-rose-500' : 'text-slate-600'
            }`}
          />
        )}
        <span>{isFavorite ? 'Đã yêu thích' : 'Yêu thích'}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled || pending || isAuthLoading}
      aria-label={accessibleName}
      aria-pressed={isFavorite}
      title={accessibleName}
      className={`relative flex items-center justify-center rounded-full border shadow-xs backdrop-blur-xs transition-all select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
        isFavorite
          ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
          : 'border-slate-200/90 bg-white/90 text-slate-600 hover:bg-white hover:text-rose-600 hover:border-rose-200'
      } ${
        disabled || pending || isAuthLoading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      ) : (
        <Heart
          className={`h-4 w-4 transition-transform ${
            isFavorite ? 'fill-rose-500 text-rose-500 scale-110' : 'text-slate-500'
          }`}
        />
      )}
    </button>
  )
}
