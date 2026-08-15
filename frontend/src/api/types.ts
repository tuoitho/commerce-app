export interface ApiErrorDetail {
  code: string
  message: string
  fields?: Record<string, string>
}

export interface ApiErrorResponse {
  error: ApiErrorDetail
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: Record<string, string>

  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message || `API Error ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = detail.code || 'unknown_error'
    this.fields = detail.fields
  }
}

// User & Auth
export interface User {
  id: string
  email: string
}

export interface SessionResponse {
  user: User
  accessToken: string
}

export interface AuthMeResponse {
  user: User
}

// Catalog
export interface Category {
  id: string
  name: string
}

export interface CategoriesResponse {
  categories: Category[]
}

export interface ProductSummary {
  id: string
  name: string
  model: string
  brand: Category
  category: Category
  minPriceVnd: string
  maxPriceVnd: string
  price: string
  currency: string
  primaryImageUrl: string
  inStock: boolean
}

export interface ProductsResponse {
  products: ProductSummary[]
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
  stockQuantity: number
}

export interface ProductDetail {
  id: string
  name: string
  model: string
  description: string
  brand: Category
  category: Category
  minPriceVnd: string
  maxPriceVnd: string
  price: string
  currency: string
  imageUrls: string[]
  stockQuantity: number
  inStock: boolean
  featured: boolean
  optionGroups: OptionGroup[]
  variants: ProductVariant[]
  createdAt: string
  updatedAt: string
}

export interface ProductFilterParams {
  q?: string
  category_id?: string | string[]
  min_price?: string
  max_price?: string
  in_stock?: 'true' | 'false' | boolean
}

// Cart
export type CartAvailability = 'available' | 'unavailable' | 'out_of_stock' | 'insufficient_stock'

export interface CartOption {
  groupLabel: string
  valueLabel: string
}

export interface CartItem {
  id: string
  variantId: string
  productId: string
  brandName: string
  productName: string
  model: string
  imageUrl: string
  options: CartOption[]
  unitPriceVnd: string | null
  lineTotalVnd: string | null
  stockQuantity: number
  quantity: number
  selected: boolean
  availability: CartAvailability
}

export interface Cart {
  items: CartItem[]
  totalUnits: number
  selectedLineCount: number
  selectedTotalVnd: string
}

export interface CartResponse {
  cart: Cart
}
