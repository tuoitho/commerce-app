import { describe, expect, it, vi } from 'vitest'

import { createCartApi } from './cart'

describe('cart api', () => {
  it('sends each selected variant ID as its own add request', async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ cart: { items: [{ id: 'line-1', variantId: 'variant-black-128' }] } })
      .mockResolvedValueOnce({ cart: { items: [{ id: 'line-1', variantId: 'variant-black-128' }, { id: 'line-2', variantId: 'variant-silver-256' }] } })
    const client = { post } as unknown as Parameters<typeof createCartApi>[0]
    const cartApi = createCartApi(client)

    const firstCart = await cartApi.addVariant('variant-black-128')
    const secondCart = await cartApi.addVariant('variant-silver-256')

    expect(post).toHaveBeenNthCalledWith(1, '/cart/items', { variantId: 'variant-black-128' })
    expect(post).toHaveBeenNthCalledWith(2, '/cart/items', { variantId: 'variant-silver-256' })
    expect(firstCart.items).toEqual([{ id: 'line-1', variantId: 'variant-black-128' }])
    expect(secondCart.items).toEqual([
      { id: 'line-1', variantId: 'variant-black-128' },
      { id: 'line-2', variantId: 'variant-silver-256' },
    ])
    expect(new Set(secondCart.items.map((item) => item.id)).size).toBe(2)
    expect(new Set(secondCart.items.map((item) => item.variantId)).size).toBe(2)
  })
})
