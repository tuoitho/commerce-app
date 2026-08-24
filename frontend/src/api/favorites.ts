import { apiClient, apiClientWithMeta, type ApiResponseWithMeta } from './client'
import type { FavoriteProductSummary, FavoriteStateResponse } from './types'

export interface ListFavoritesParams {
  page?: number
  limit?: number
}

export const favoritesApi = {
  async listFavorites(
    page: number = 1,
    limit: number = 12
  ): Promise<ApiResponseWithMeta<FavoriteProductSummary[]>> {
    const params = new URLSearchParams()
    if (page !== undefined) {
      params.append('page', String(page))
    }
    if (limit !== undefined) {
      params.append('limit', String(limit))
    }
    const query = params.toString() ? `?${params.toString()}` : ''
    return apiClientWithMeta<FavoriteProductSummary[]>(`/favorites${query}`)
  },

  async addFavorite(productId: string): Promise<FavoriteStateResponse> {
    return apiClient<FavoriteStateResponse>(`/favorites/${productId}`, {
      method: 'PUT',
    })
  },

  async removeFavorite(productId: string): Promise<FavoriteStateResponse> {
    return apiClient<FavoriteStateResponse>(`/favorites/${productId}`, {
      method: 'DELETE',
    })
  },
}
