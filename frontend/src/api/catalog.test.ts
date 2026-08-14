import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchCategories, fetchFeaturedProducts, fetchProduct, fetchProducts } from './catalog'
import { tokenStore } from './tokenStore'

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('catalog api', () => {
  beforeEach(() => {
    tokenStore.set(null)
    vi.restoreAllMocks()
  })

  afterEach(() => {
    tokenStore.set(null)
  })

  it('fetchCategories hits /categories and returns brands', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse(200, { categories: [{ id: 'c1', name: 'Apple' }] }))
    const categories = await fetchCategories()
    expect(categories).toEqual([{ id: 'c1', name: 'Apple' }])
    expect(spy).toHaveBeenCalledWith('/api/v1/categories', expect.objectContaining({ method: 'GET' }))
  })

  it('fetchProducts with no filters hits /products', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(200, { products: [] }))
    await fetchProducts()
    expect(spy).toHaveBeenCalledWith('/api/v1/products', expect.anything())
  })

  it('serializes all supported filters exactly once', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(200, { products: [] }))
    await fetchProducts({
      q: '  wireless  ',
      categoryIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'],
      minPrice: '10',
      maxPrice: '50',
      inStock: true,
    })
    expect(spy).toHaveBeenCalledWith(
      '/api/v1/products?q=wireless&category_id=00000000-0000-4000-8000-000000000001&category_id=00000000-0000-4000-8000-000000000002&min_price=10&max_price=50&in_stock=true',
      expect.anything(),
    )
  })

  it('omits blank and empty price criteria and keeps inStock=false', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(200, { products: [] }))
    await fetchProducts({ q: '', categoryIds: [], minPrice: '', maxPrice: '', inStock: false })
    expect(spy).toHaveBeenCalledWith('/api/v1/products?in_stock=false', expect.anything())
  })

  it('fetchFeaturedProducts hits the featured endpoint', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(200, { products: [] }))
    await fetchFeaturedProducts()
    expect(spy).toHaveBeenCalledWith('/api/v1/products/featured', expect.anything())
  })

  it('fetchProduct hits /products/{id} and returns the detail', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse(200, { id: 'p1', name: 'Wireless Mouse' }))
    const detail = await fetchProduct('p1')
    expect(detail.name).toBe('Wireless Mouse')
    expect(spy).toHaveBeenCalledWith('/api/v1/products/p1', expect.anything())
  })
})
