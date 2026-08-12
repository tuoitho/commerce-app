import { api } from './client'

export interface Category {
  id: string
  name: string
}

export interface ProductSummary {
  id: string
  name: string
  category: Category
  price: string
  currency: string
  primaryImageUrl: string
  inStock: boolean
}

export interface ProductDetail {
  id: string
  name: string
  description: string
  category: Category
  price: string
  currency: string
  imageUrls: string[]
  stockQuantity: number
  inStock: boolean
  createdAt: string
  updatedAt: string
}

export interface CatalogFilters {
  q?: string
  categoryId?: string
  minPrice?: string
  maxPrice?: string
  inStock?: boolean
}

export async function fetchCategories(): Promise<Category[]> {
  const body = await api.get<{ categories: Category[] }>('/categories')
  return body.categories
}

export async function fetchProducts(filters: CatalogFilters = {}): Promise<ProductSummary[]> {
  const params = new URLSearchParams()
  const q = filters.q?.trim()
  if (q) params.set('q', q)
  if (filters.categoryId) params.set('category_id', filters.categoryId)
  if (filters.minPrice) params.set('min_price', filters.minPrice)
  if (filters.maxPrice) params.set('max_price', filters.maxPrice)
  if (filters.inStock !== undefined) params.set('in_stock', String(filters.inStock))
  const query = params.toString()
  const body = await api.get<{ products: ProductSummary[] }>(`/products${query ? `?${query}` : ''}`)
  return body.products
}

export function fetchProduct(id: string): Promise<ProductDetail> {
  return api.get<ProductDetail>(`/products/${encodeURIComponent(id)}`)
}
