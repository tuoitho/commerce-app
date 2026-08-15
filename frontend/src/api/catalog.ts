import { apiClient } from './client'
import type { CategoriesResponse, ProductsResponse, ProductDetail, ProductFilterParams } from './types'

export const catalogApi = {
  async listCategories(): Promise<CategoriesResponse> {
    return apiClient<CategoriesResponse>('/categories')
  },

  async listProducts(filter: ProductFilterParams = {}): Promise<ProductsResponse> {
    const params = new URLSearchParams()

    if (filter.q) {
      params.set('q', filter.q)
    }

    if (filter.category_id) {
      if (Array.isArray(filter.category_id)) {
        for (const catId of filter.category_id) {
          if (catId) params.append('category_id', catId)
        }
      } else {
        params.set('category_id', filter.category_id)
      }
    }

    if (filter.min_price) {
      params.set('min_price', filter.min_price)
    }

    if (filter.max_price) {
      params.set('max_price', filter.max_price)
    }

    if (filter.in_stock !== undefined) {
      params.set('in_stock', String(filter.in_stock))
    }

    const queryString = params.toString()
    const endpoint = queryString ? `/products?${queryString}` : '/products'
    return apiClient<ProductsResponse>(endpoint)
  },

  async listFeaturedProducts(): Promise<ProductsResponse> {
    return apiClient<ProductsResponse>('/products/featured')
  },

  async getProduct(id: string): Promise<ProductDetail> {
    return apiClient<ProductDetail>(`/products/${id}`)
  },
}
