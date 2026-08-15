import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, disabled, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e)
      onCheckedChange?.(e.target.checked)
    }

    return (
      <label
        className={cn(
          'relative inline-flex items-center justify-center h-5 w-5 rounded-md border transition-all cursor-pointer select-none',
          checked
            ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
            : 'bg-white border-slate-300 hover:border-slate-400',
          disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
          className
        )}
      >
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          disabled={disabled}
          onChange={handleChange}
          className="sr-only"
          {...props}
        />
        {checked && <Check className="h-3.5 w-3.5 stroke-[3]" />}
      </label>
    )
  }
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
