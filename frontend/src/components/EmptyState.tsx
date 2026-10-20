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
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center rounded-2xl border border-zinc-200 bg-white max-w-lg mx-auto">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600 mb-5">
        {icon}
      </div>
      <h3 className="text-lg font-bold tracking-tight text-zinc-950">{title}</h3>
      {description && (
        <p className="text-sm text-zinc-500 mt-2 max-w-xs leading-relaxed">{description}</p>
      )}
      {(actionLabel && (actionLink || onAction)) && (
        <div className="mt-6">
          {actionLink ? (
            <Link to={actionLink}>
              <Button variant="default" size="default" className="rounded-xl">
                {actionLabel}
              </Button>
            </Link>
          ) : (
            <Button
              variant="default"
              size="default"
              className="rounded-xl"
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
