import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Format raw VND integer string/number to Vietnamese standard currency format (e.g. "25.990.000 ₫")
 */
export function formatVND(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') {
    return '0 ₫'
  }
  const numeric = typeof amount === 'number' ? amount : Number(amount)
  if (isNaN(numeric)) {
    return `${amount} ₫`
  }
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(numeric)
}

export function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return ''
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
    if (isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d)
  } catch {
    return ''
  }
}

export function toDateTimeLocalValue(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function toRFC3339FromLocal(localValue: string): string | null {
  const trimmed = localValue.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}
