import { api } from './client'

export interface Brand {
  id: string
  name: string
}

export interface ProductSummary {
  id: string
  name: string
  model: string
  brand: Brand
  minPriceVnd: string
  maxPriceVnd: string
  primaryImageUrl: string
  inStock: boolean
}

export interface OptionValue {
  id: string
  label: string
}

export interface OptionGroup {
  id: string
  label: string
  position: number
  values: OptionValue[]
}

export interface ProductVariant {
  id: string
  optionValueIds: Record<string, string>
  priceVnd: string
  stockQuantity: bigint
}

export interface ProductDetail {
  id: string
  name: string
  model: string
  description: string
  brand: Brand
  imageUrls: string[]
  minPriceVnd: string
  maxPriceVnd: string
  featured: boolean
  optionGroups: OptionGroup[]
  variants: ProductVariant[]
  createdAt: string
  updatedAt: string
}

export interface CatalogFilters {
  q?: string
  categoryIds?: string[]
  minPrice?: string
  maxPrice?: string
  inStock?: boolean
}

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isCanonicalCategoryId(value: string): boolean {
  return canonicalUuidPattern.test(value)
}

export async function fetchCategories(): Promise<Brand[]> {
  const body = await api.get<{ categories: Brand[] }>('/categories')
  return body.categories
}

export async function fetchProducts(filters: CatalogFilters = {}): Promise<ProductSummary[]> {
  const params = new URLSearchParams()
  const q = filters.q?.trim()
  if (q) params.set('q', q)
  for (const categoryId of filters.categoryIds?.filter(isCanonicalCategoryId) ?? []) {
    if (categoryId) params.append('category_id', categoryId)
  }
  if (filters.minPrice) params.set('min_price', filters.minPrice)
  if (filters.maxPrice) params.set('max_price', filters.maxPrice)
  if (filters.inStock !== undefined) params.set('in_stock', String(filters.inStock))
  const query = params.toString()
  const body = await api.get<{ products: ProductSummary[] }>(`/products${query ? `?${query}` : ''}`)
  return body.products
}

export async function fetchFeaturedProducts(): Promise<ProductSummary[]> {
  const body = await api.get<{ products: ProductSummary[] }>('/products/featured')
  return body.products
}

export function fetchProduct(id: string): Promise<ProductDetail> {
  return api.get<ProductDetail>(`/products/${encodeURIComponent(id)}`)
}
