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
