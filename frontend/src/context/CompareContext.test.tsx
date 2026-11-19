import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CompareProvider, useCompare, COMPARE_STORAGE_KEY } from './CompareContext'
import type { ProductSummary } from '@/api/types'

function makeProduct(index: number): ProductSummary {
  return {
    id: `prod-${index}`,
    name: `Phone Model ${index}`,
    model: `M${index}`,
    brand: 'AuraBrand',
    category: { id: 'cat-phone', name: 'Điện thoại' },
    minPriceVnd: `${10000000 + index * 1000000}`,
    maxPriceVnd: `${12000000 + index * 1000000}`,
    price: `${10000000 + index * 1000000}`,
    currency: 'VND',
    primaryImageUrl: `https://example.com/phone-${index}.jpg`,
    inStock: true,
  }
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <CompareProvider>{children}</CompareProvider>
)

describe('CompareContext (Req 5.4)', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('provides a safe fallback when useCompare is called outside CompareProvider', () => {
    const { result } = renderHook(() => useCompare())
    expect(result.current.items).toEqual([])
    expect(result.current.isComparing('prod-1')).toBe(false)
    expect(result.current.maxItems).toBe(3)
  })

  it('adds up to 3 distinct products and persists them in sessionStorage across remounts', () => {
    const { result, unmount } = renderHook(() => useCompare(), { wrapper })

    act(() => {
      expect(result.current.addProduct(makeProduct(1))).toEqual({ ok: true, action: 'added' })
      expect(result.current.addProduct(makeProduct(2))).toEqual({ ok: true, action: 'added' })
      expect(result.current.addProduct(makeProduct(3))).toEqual({ ok: true, action: 'added' })
    })

    expect(result.current.items).toHaveLength(3)
    expect(result.current.isComparing('prod-1')).toBe(true)
    expect(result.current.isComparing('prod-3')).toBe(true)

    const stored = JSON.parse(window.sessionStorage.getItem(COMPARE_STORAGE_KEY) || '[]')
    expect(stored).toHaveLength(3)

    unmount()

    const { result: remounted } = renderHook(() => useCompare(), { wrapper })
    expect(remounted.current.items.map((i) => i.id)).toEqual(['prod-1', 'prod-2', 'prod-3'])
  })

  it('blocks adding a 4th distinct product, preserves existing 3 items, and sets limitWarning', () => {
    const { result } = renderHook(() => useCompare(), { wrapper })

    act(() => {
      result.current.addProduct(makeProduct(1))
      result.current.addProduct(makeProduct(2))
      result.current.addProduct(makeProduct(3))
    })

    let fourthResult: ReturnType<typeof result.current.addProduct> | undefined
    act(() => {
      fourthResult = result.current.addProduct(makeProduct(4))
    })

    expect(fourthResult).toEqual({
      ok: false,
      action: 'limit_reached',
      reason: 'limit_reached',
    })
    expect(result.current.items.map((i) => i.id)).toEqual(['prod-1', 'prod-2', 'prod-3'])
    expect(result.current.limitWarning).toMatch(/tối đa 3/i)
  })

  it('toggles existing products off and supports removeProduct and clearAll', () => {
    const { result } = renderHook(() => useCompare(), { wrapper })
    const p1 = makeProduct(1)
    const p2 = makeProduct(2)

    act(() => {
      result.current.toggleProduct(p1)
      result.current.toggleProduct(p2)
    })
    expect(result.current.items).toHaveLength(2)

    act(() => {
      const res = result.current.toggleProduct(p1)
      expect(res).toEqual({ ok: true, action: 'removed' })
    })
    expect(result.current.items.map((i) => i.id)).toEqual(['prod-2'])

    act(() => {
      result.current.clearAll()
    })
    expect(result.current.items).toHaveLength(0)
    expect(JSON.parse(window.sessionStorage.getItem(COMPARE_STORAGE_KEY) || '[]')).toEqual([])
  })
})
