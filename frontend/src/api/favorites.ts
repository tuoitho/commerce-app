import { apiClient } from './client'
import type { FavoriteProduct } from '@/types/favorite'

export const favoritesApi = {
  async list(): Promise<FavoriteProduct[]> {
    return apiClient<FavoriteProduct[]>('/favorites')
  },

  async add(productId: string): Promise<FavoriteProduct[]> {
    return apiClient<FavoriteProduct[]>(`/favorites/${productId}`, {
      method: 'PUT',
    })
  },

  async remove(productId: string): Promise<FavoriteProduct[]> {
    return apiClient<FavoriteProduct[]>(`/favorites/${productId}`, {
      method: 'DELETE',
    })
  },
}
