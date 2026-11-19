import { Link, useLocation } from 'react-router-dom'
import { AlertCircle, ArrowRight, GitCompareArrows, Trash2, X } from 'lucide-react'
import { useCompare } from '@/context/CompareContext'
import { isCompareTrayVisible } from '@/lib/compare'
import { Button } from './ui/button'
import { formatVND } from '@/lib/utils'

export function CompareTray() {
  const { items, maxItems, limitWarning, removeProduct, clearAll, dismissWarning } = useCompare()
  const location = useLocation()

  if (!isCompareTrayVisible(location.pathname, items.length)) {
    return null
  }

  const canCompare = items.length >= 2 && items.length <= maxItems
  const compareHref = `/compare?ids=${items.map((item) => encodeURIComponent(item.id)).join(',')}`

  return (
    <section
      aria-label="Thanh so sánh sản phẩm"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-zinc-200 bg-white shadow-[0_-10px_32px_rgba(9,9,11,0.08)]"
    >
      <div className="mx-auto max-w-7xl px-3 py-2.5 sm:px-6 sm:py-3 space-y-2">
        {limitWarning && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
              <span className="truncate sm:whitespace-normal">{limitWarning}</span>
            </div>
            <button
              type="button"
              onClick={dismissWarning}
              aria-label="Đóng cảnh báo giới hạn so sánh"
              className="rounded-lg p-1 text-amber-700 hover:bg-amber-100 shrink-0 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-3 flex-1 min-w-0">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1.5 sm:gap-2.5 rounded-xl border border-zinc-200 bg-[#f7f7f5] p-1.5 sm:p-2 min-w-0"
              >
                <div className="flex h-8 w-8 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg bg-white p-1 border border-zinc-200/70">
                  <img
                    src={item.primaryImageUrl || '/iphone-16-pro.jpg'}
                    alt={item.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] sm:text-xs font-semibold text-zinc-950">
                    {item.name}
                  </p>
                  <p className="hidden sm:block truncate font-mono text-[11px] text-zinc-500 tabular-nums">
                    {formatVND(item.minPriceVnd)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeProduct(item.id)}
                  aria-label={`Xóa ${item.name} khỏi so sánh`}
                  title={`Xóa ${item.name}`}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-900 shrink-0 transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 sm:gap-3 shrink-0">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-zinc-600">
              <GitCompareArrows className="h-3.5 w-3.5 text-emerald-700" />
              <span>
                Đã chọn {items.length}/{maxItems}
              </span>
            </span>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="h-9 px-2.5 text-xs font-semibold text-zinc-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Xóa tất cả</span>
              </Button>

              {canCompare ? (
                <Link
                  to={compareHref}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-3.5 sm:px-4 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors whitespace-nowrap"
                >
                  <span>So sánh ngay</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled
                  title="Chọn ít nhất 2 sản phẩm để so sánh"
                  className="h-9 rounded-xl px-3.5 sm:px-4 text-xs font-semibold whitespace-nowrap"
                >
                  <span>So sánh ngay</span>
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
