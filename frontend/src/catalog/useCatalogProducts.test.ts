import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchProducts } from '../api/catalog'
import { useCatalogProducts } from './useCatalogProducts'
import type { ProductSummary } from '../api/catalog'

vi.mock('../api/catalog', () => ({ fetchProducts: vi.fn() }))

const mockFetchProducts = vi.mocked(fetchProducts)

function makeProduct(id: string): ProductSummary {
  return {
    id,
    name: `Product ${id}`,
    category: { id: 'c1', name: 'Electronics' },
    price: '24.99',
    currency: 'USD',
    primaryImageUrl: 'https://example.com/img.jpg',
    inStock: true,
  }
}

describe('useCatalogProducts', () => {
  beforeEach(() => {
    mockFetchProducts.mockReset()
  })

  afterEach(() => {
  })

  async function flush() {
    await act(async () => {
      await Promise.resolve()
    })
  }

  it('returns loading until products arrive', async () => {
    mockFetchProducts.mockResolvedValue([makeProduct('a')])
    const { result } = renderHook(() => useCatalogProducts({}, 0))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.loading).toBe(false)
    expect(result.current.products).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('ignores stale responses for outdated criteria', async () => {
    let resolveFirst!: (value: ProductSummary[]) => void
    let resolveSecond!: (value: ProductSummary[]) => void
    mockFetchProducts
      .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res }))
      .mockImplementationOnce(() => new Promise((res) => { resolveSecond = res }))

    const { result, rerender } = renderHook(
      ({ filters }: { filters: { q: string } }) => useCatalogProducts(filters, 0),
      { initialProps: { filters: { q: 'a' } } },
    )
    await flush()
    expect(mockFetchProducts).toHaveBeenLastCalledWith({ q: 'a' })

    rerender({ filters: { q: 'b' } })
    await flush()
    expect(mockFetchProducts).toHaveBeenLastCalledWith({ q: 'b' })

    await act(async () => {
      resolveSecond([makeProduct('b')])
      await Promise.resolve()
    })
    expect(result.current.products.map((p) => p.id)).toEqual(['b'])
    expect(result.current.loading).toBe(false)

    await act(async () => {
      resolveFirst([makeProduct('a')])
      await Promise.resolve()
    })
    expect(result.current.products.map((p) => p.id)).toEqual(['b'])
  })
})
