const vndCurrencyFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

/**
 * Formats a money string in VND without converting to standard JS Number,
 * preserving full precision for numbers larger than Number.MAX_SAFE_INTEGER
 * and properly handling negative amounts.
 */
export function formatMoneyVndExact(amount: string | bigint | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') {
    return '0 ₫'
  }
  try {
    const big = typeof amount === 'bigint' ? amount : BigInt(amount)
    return vndCurrencyFormatter.format(big)
  } catch {
    // If not a parseable integer string, pass string directly to Intl or fallback
    try {
      return vndCurrencyFormatter.format(amount as unknown as number)
    } catch {
      return `${amount} ₫`
    }
  }
}

const vietnamDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour12: false,
})

/**
 * Formats an ISO date string or Date object into HH:mm dd/MM/yyyy in Asia/Ho_Chi_Minh timezone.
 */
export function formatVietnamDateTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return ''
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
    if (isNaN(d.getTime())) return ''
    const parts: Record<string, string> = {}
    for (const part of vietnamDateTimeFormatter.formatToParts(d)) {
      parts[part.type] = part.value
    }
    if (!parts.hour || !parts.minute || !parts.day || !parts.month || !parts.year) {
      return ''
    }
    return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`
  } catch {
    return ''
  }
}

const vietnamDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/**
 * Formats an ISO date string or Date object into dd/MM/yyyy in Asia/Ho_Chi_Minh timezone.
 */
export function formatVietnamDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return ''
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (isNaN(d.getTime())) return ''
  const parts: Record<string, string> = {}
  for (const part of vietnamDateFormatter.formatToParts(d)) {
    parts[part.type] = part.value
  }
  return `${parts.day}/${parts.month}/${parts.year}`
}
