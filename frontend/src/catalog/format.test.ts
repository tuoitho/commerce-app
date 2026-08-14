import { describe, expect, it } from 'vitest'

import { formatPrice } from './format'

describe('formatPrice', () => {
  it('formats arbitrary-precision VND as vi-VN currency', () => {
    expect(formatPrice('12345678901234567890123456789012345678')).toContain('12.345.678.901.234.567.890.123.456.789.012.345.678')
    expect(formatPrice('123456789')).toContain('123.456')
    expect(formatPrice('123456789')).toContain('₫')
  })
})
