import { apiClient, apiClientWithMeta, type ApiResponseWithMeta } from './client'
import type { Category, ProductSummary, ProductDetail, ProductFilterParams } from './types'

function buildProductsEndpoint(filter: ProductFilterParams = {}): string {
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

  if (filter.brand) {
    if (Array.isArray(filter.brand)) {
      for (const b of filter.brand) {
        if (b) params.append('brand', b)
      }
    } else {
      params.set('brand', filter.brand)
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

  if (filter.sort) {
    params.set('sort', filter.sort)
  }

  if (filter.min_rating !== undefined && filter.min_rating !== null && String(filter.min_rating).trim() !== '') {
    params.set('min_rating', String(filter.min_rating))
  }

  if (filter.page) {
    params.set('page', String(filter.page))
  }

  if (filter.limit) {
    params.set('limit', String(filter.limit))
  }

  const queryString = params.toString()
  return queryString ? `/products?${queryString}` : '/products'
}

export const catalogApi = {
  async listCategories(): Promise<Category[]> {
    return apiClient<Category[]>('/categories')
  },

  async listBrands(): Promise<string[]> {
    return apiClient<string[]>('/brands')
  },

  async listProducts(filter: ProductFilterParams = {}): Promise<ProductSummary[]> {
    return apiClient<ProductSummary[]>(buildProductsEndpoint(filter))
  },

  async listProductsWithMeta(filter: ProductFilterParams = {}): Promise<ApiResponseWithMeta<ProductSummary[]>> {
    return apiClientWithMeta<ProductSummary[]>(buildProductsEndpoint(filter))
  },

  async listFeaturedProducts(): Promise<ProductSummary[]> {
    return apiClient<ProductSummary[]>('/products/featured')
  },

  async getProduct(id: string): Promise<ProductDetail> {
    return apiClient<ProductDetail>(`/products/${id}`)
  },
}
