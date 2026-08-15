import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from './ui/button'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  actionLabel?: string
  actionLink?: string
  onAction?: () => void
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionLink,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-3xl border border-dashed border-slate-300 bg-white/50 max-w-lg mx-auto">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 mb-4 shadow-inner">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 mt-1.5 max-w-xs leading-relaxed">{description}</p>
      )}
      {(actionLabel && (actionLink || onAction)) && (
        <div className="mt-6">
          {actionLink ? (
            <Link to={actionLink}>
              <Button variant="default" size="default" className="rounded-xl shadow-sm">
                {actionLabel}
              </Button>
            </Link>
          ) : (
            <Button
              variant="default"
              size="default"
              className="rounded-xl shadow-sm"
              onClick={onAction}
            >
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
