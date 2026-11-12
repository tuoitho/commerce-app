import React from 'react'
import type { DashboardRange } from '@/api/dashboard'
import { cn } from '@/lib/utils'

interface RangeOption {
  value: DashboardRange
  label: string
}

const RANGE_OPTIONS: RangeOption[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
]

interface RangeSelectorProps {
  value: DashboardRange
  onChange: (range: DashboardRange) => void
  disabled?: boolean
}

export const RangeSelector: React.FC<RangeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div
      role="group"
      aria-label="Chọn kỳ báo cáo"
      className="inline-flex items-center rounded-xl bg-slate-100/90 p-1 border border-slate-200/80"
    >
      {RANGE_OPTIONS.map((opt) => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all duration-150 select-none cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              isActive
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
