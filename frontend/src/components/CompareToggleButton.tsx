import React from 'react'
import { Check, GitCompareArrows } from 'lucide-react'
import { useCompare, type CompareInput } from '@/context/CompareContext'
import { useToast } from '@/context/ToastContext'
import { cn } from '@/lib/utils'

export interface CompareToggleButtonProps {
  product: CompareInput
  showText?: boolean
  className?: string
  size?: 'sm' | 'default'
}

export function CompareToggleButton({
  product,
  showText = true,
  className,
  size = 'sm',
}: CompareToggleButtonProps) {
  const { isComparing, toggleProduct } = useCompare()
  const { error: toastError } = useToast()

  const comparing = isComparing(product.id)

  const accessibleName = comparing
    ? `Bỏ ${product.name} khỏi so sánh`
    : `Thêm ${product.name} vào so sánh`

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const res = toggleProduct(product)
    if (res.action === 'limit_reached') {
      toastError(
        'Đã đạt giới hạn 3 sản phẩm',
        'Chỉ có thể so sánh tối đa 3 sản phẩm cùng lúc. Vui lòng bỏ bớt máy trước khi thêm mới.'
      )
    }
  }

  return (
    <button
      type="button"
      aria-label={accessibleName}
      aria-pressed={comparing}
      title={accessibleName}
      onClick={handleClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors select-none cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-xs sm:text-sm',
        comparing
          ? 'border-emerald-700 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80'
          : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-900 hover:text-zinc-950',
        className
      )}
    >
      {comparing ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
      ) : (
        <GitCompareArrows className="h-3.5 w-3.5 shrink-0" />
      )}
      {showText && <span>{comparing ? 'Đã chọn' : 'So sánh'}</span>}
    </button>
  )
}
