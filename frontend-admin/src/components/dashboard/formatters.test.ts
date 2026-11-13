import { describe, it, expect } from 'vitest'
import { formatMoneyVndExact, formatVietnamDate, formatVietnamDateTime } from './formatters'

describe('dashboard formatters', () => {
  describe('formatMoneyVndExact', () => {
    it('formats 0 properly', () => {
      const result = formatMoneyVndExact('0')
      expect(result.replace(/\u00a0/g, ' ')).toBe('0 ₫')
    })

    it('formats standard positive VND amount without loss of precision', () => {
      const result = formatMoneyVndExact('125990000')
      expect(result.replace(/\u00a0/g, ' ')).toBe('125.990.000 ₫')
    })

    it('formats negative amount with leading minus sign', () => {
      const result = formatMoneyVndExact('-25990000')
      expect(result.replace(/\u00a0/g, ' ')).toBe('-25.990.000 ₫')
    })

    it('formats amounts exceeding Number.MAX_SAFE_INTEGER without rounding or precision loss', () => {
      // 9007199254740993 > Number.MAX_SAFE_INTEGER (9007199254740991)
      const bigAmount = '9007199254740993'
      const result = formatMoneyVndExact(bigAmount)
      expect(result.replace(/\u00a0/g, ' ')).toBe('9.007.199.254.740.993 ₫')
    })

    it('handles empty, null, or undefined as 0 ₫', () => {
      expect(formatMoneyVndExact('').replace(/\u00a0/g, ' ')).toBe('0 ₫')
      expect(formatMoneyVndExact(null).replace(/\u00a0/g, ' ')).toBe('0 ₫')
      expect(formatMoneyVndExact(undefined).replace(/\u00a0/g, ' ')).toBe('0 ₫')
    })
  })

  describe('formatVietnamDateTime', () => {
    it('formats UTC ISO date string into HH:mm dd/MM/yyyy in Asia/Ho_Chi_Minh', () => {
      // 03:15:42Z + 7h = 10:15 on 12/11/2026
      expect(formatVietnamDateTime('2026-11-12T03:15:42Z')).toBe('10:15 12/11/2026')
    })

    it('handles date boundary when crossing midnight in UTC+7', () => {
      // 17:00:00Z on 2026-11-05 + 7h = 00:00 on 06/11/2026
      expect(formatVietnamDateTime('2026-11-05T17:00:00Z')).toBe('00:00 06/11/2026')
    })

    it('returns empty string for null, undefined or invalid dates', () => {
      expect(formatVietnamDateTime('')).toBe('')
      expect(formatVietnamDateTime(null)).toBe('')
      expect(formatVietnamDateTime(undefined)).toBe('')
      expect(formatVietnamDateTime('invalid-date')).toBe('')
    })
  })
})

describe('formatVietnamDate', () => {
  it('formats a date as dd/MM/yyyy in Vietnam time', () => {
    expect(formatVietnamDate('2026-11-01T02:03:04Z')).toBe('01/11/2026')
  })

  it('moves to the next day after 17:00 UTC', () => {
    expect(formatVietnamDate('2026-11-01T17:30:00Z')).toBe('02/11/2026')
  })

  it('returns an empty string for missing or invalid input', () => {
    expect(formatVietnamDate(null)).toBe('')
    expect(formatVietnamDate('not-a-date')).toBe('')
  })
})
