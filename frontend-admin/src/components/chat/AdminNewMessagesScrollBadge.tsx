import { ArrowDown } from 'lucide-react'

export interface AdminNewMessagesScrollBadgeProps {
  count: number
  onClick: () => void
}

export function AdminNewMessagesScrollBadge({ count, onClick }: AdminNewMessagesScrollBadgeProps) {
  if (count <= 0) return null

  return (
    <div className="sticky bottom-3 z-20 flex justify-center pointer-events-none w-full">
      <button
        type="button"
        data-testid="new-messages-scroll-badge"
        onClick={onClick}
        aria-label={`${count} tin nhắn mới, cuộn xuống dưới cùng`}
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all animate-bounce"
      >
        <span>{count} tin nhắn mới</span>
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
