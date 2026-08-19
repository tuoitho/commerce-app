import { describe, it, expect } from 'vitest'
import { formatVND, formatDateTime, cn } from '@/lib/utils'

describe('utils', () => {
  it('formatVND formats VND numbers correctly with currency symbol', () => {
    const formatted = formatVND('25990000')
    expect(formatted).toContain('25.990.000')
    expect(formatted).toContain('₫')
  })

  it('formatVND handles 0 and empty inputs safely', () => {
    expect(formatVND(0)).toContain('0')
    expect(formatVND('')).toBe('0 ₫')
    expect(formatVND(null)).toBe('0 ₫')
  })

  it('formatDateTime formats ISO date strings safely', () => {
    const formatted = formatDateTime('2026-08-19T10:30:00Z')
    expect(formatted).toBeTruthy()
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime('')).toBe('')
    expect(formatDateTime('invalid-date')).toBe('')
  })

  it('cn merges class names properly', () => {
    expect(cn('px-2 py-1', 'bg-blue-600', { 'text-white': true, 'opacity-50': false })).toBe(
      'px-2 py-1 bg-blue-600 text-white'
    )
  })
})

