import { apiClient } from './client'
import type { Cart } from './types'

export const cartApi = {
  async getCart(): Promise<Cart> {
    return apiClient<Cart>('/cart')
  },

  async addItem(variantId: string): Promise<Cart> {
    return apiClient<Cart>('/cart/items', {
      method: 'POST',
      body: { variantId },
    })
  },

  async setQuantity(itemId: string, quantity: number): Promise<Cart> {
    return apiClient<Cart>(`/cart/items/${itemId}`, {
      method: 'PUT',
      body: { quantity },
    })
  },

  async setSelection(itemId: string, selected: boolean): Promise<Cart> {
    return apiClient<Cart>(`/cart/items/${itemId}/selection`, {
      method: 'PATCH',
      body: { selected },
    })
  },

  async setAllSelection(selected: boolean): Promise<Cart> {
    return apiClient<Cart>('/cart/selection', {
      method: 'PUT',
      body: { selected },
    })
  },

  async removeItem(itemId: string): Promise<Cart> {
    return apiClient<Cart>(`/cart/items/${itemId}`, {
      method: 'DELETE',
    })
  },
}
