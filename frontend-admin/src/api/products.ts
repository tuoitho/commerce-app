import { apiClient, apiClientWithMeta, type ApiResponseWithMeta } from './client'
import type { ProductDetail, ProductSummary, SaveProductRequest } from './types'

export interface GetAdminProductsParams {
  q?: string
  page?: number
  limit?: number
}

export async function getAdminProducts(
  params: GetAdminProductsParams = {}
): Promise<ApiResponseWithMeta<ProductSummary[]>> {
  const searchParams = new URLSearchParams()
  if (params.q !== undefined && params.q.trim() !== '') {
    searchParams.set('q', params.q.trim())
  }
  if (params.page !== undefined) {
    searchParams.set('page', String(params.page))
  }
  if (params.limit !== undefined) {
    searchParams.set('limit', String(params.limit))
  }

  const queryString = searchParams.toString()
  const path = queryString ? `/admin/products?${queryString}` : '/admin/products'

  return apiClientWithMeta<ProductSummary[]>(path)
}

export async function getAdminProductById(id: string): Promise<ProductDetail> {
  return apiClient<ProductDetail>(`/admin/products/${encodeURIComponent(id)}`)
}

export async function createAdminProduct(payload: SaveProductRequest): Promise<ProductDetail> {
  return apiClient<ProductDetail>('/admin/products', {
    method: 'POST',
    body: payload,
  })
}

export async function updateAdminProduct(id: string, payload: SaveProductRequest): Promise<ProductDetail> {
  return apiClient<ProductDetail>(`/admin/products/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function deleteAdminProduct(id: string): Promise<void> {
  return apiClient<void>(`/admin/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

