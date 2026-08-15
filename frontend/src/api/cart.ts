import { apiClient } from './client'
import type { CartResponse } from './types'

export const cartApi = {
  async getCart(): Promise<CartResponse> {
    return apiClient<CartResponse>('/cart')
  },

  async addItem(variantId: string): Promise<CartResponse> {
    return apiClient<CartResponse>('/cart/items', {
      method: 'POST',
      body: { variantId },
    })
  },

  async setQuantity(itemId: string, quantity: number): Promise<CartResponse> {
    return apiClient<CartResponse>(`/cart/items/${itemId}`, {
      method: 'PUT',
      body: { quantity },
    })
  },

  async setSelection(itemId: string, selected: boolean): Promise<CartResponse> {
    return apiClient<CartResponse>(`/cart/items/${itemId}/selection`, {
      method: 'PATCH',
      body: { selected },
    })
  },

  async setAllSelection(selected: boolean): Promise<CartResponse> {
    return apiClient<CartResponse>('/cart/selection', {
      method: 'PUT',
      body: { selected },
    })
  },

  async removeItem(itemId: string): Promise<CartResponse> {
    return apiClient<CartResponse>(`/cart/items/${itemId}`, {
      method: 'DELETE',
    })
  },
}
