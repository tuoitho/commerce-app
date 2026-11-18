import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { formatCountdown } from '@/lib/payment'
import { cn } from '@/lib/utils'

interface MomoCountdownProps {
  deadlineMs: number
  label?: string
  expiredLabel?: string
  onExpire?: () => void
  className?: string
}

export function MomoCountdown({
  deadlineMs,
  label = 'Hạn thanh toán MoMo:',
  expiredLabel = 'Đã hết hạn thanh toán MoMo',
  onExpire,
  className,
}: MomoCountdownProps) {
  const [remainingMs, setRemainingMs] = useState<number>(() => Math.max(0, deadlineMs - Date.now()))
  const expiredNotifiedRef = useRef(false)

  useEffect(() => {
    const initial = Math.max(0, deadlineMs - Date.now())
    setRemainingMs(initial)
    expiredNotifiedRef.current = initial <= 0

    if (initial <= 0) {
      return
    }

    const interval = setInterval(() => {
      const next = Math.max(0, deadlineMs - Date.now())
      setRemainingMs(next)
      if (next <= 0 && !expiredNotifiedRef.current) {
        expiredNotifiedRef.current = true
        onExpire?.()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [deadlineMs, onExpire])

  const isExpired = remainingMs <= 0

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border',
        isExpired
          ? 'bg-rose-50 text-rose-900 border-rose-200'
          : 'bg-pink-50 text-[#891657] border-pink-200',
        className
      )}
    >
      <Clock className={cn('h-3.5 w-3.5 shrink-0', isExpired ? 'text-rose-700' : 'text-[#ae2070]')} />
      {isExpired ? (
        <span>{expiredLabel}</span>
      ) : (
        <>
          <span>{label}</span>
          <span className="font-mono font-bold tabular-nums">{formatCountdown(remainingMs)}</span>
        </>
      )}
    </div>
  )
}
