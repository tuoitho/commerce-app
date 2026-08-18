export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export interface ApiResponseMeta {
  timestamp: string
  pagination?: PaginationMeta
}

export interface ApiErrorDetail {
  code: string
  message: string
  fields?: Record<string, string>
}

export interface ApiResponseEnvelope<T> {
  success: boolean
  message: string
  data: T | null
  error: ApiErrorDetail | null
  meta: ApiResponseMeta
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: Record<string, string>

  constructor(status: number, detail: ApiErrorDetail, message?: string) {
    super(message || detail.message || `API Error ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = detail.code || 'unknown_error'
    this.fields = detail.fields
  }

  isValidationError(): boolean {
    return Boolean(this.fields && Object.keys(this.fields).length > 0)
  }

  isBusinessError(): boolean {
    return !this.isValidationError() && this.status < 500
  }
}

// User & Auth
export interface User {
  id: string
  email: string
  role: string
}

export interface SessionResponse {
  user: User
  accessToken: string
}

export interface AuthMeResponse {
  user: User
}

// Category & Catalog
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
  brand: string
  category: Category
  minPriceVnd: string
  maxPriceVnd: string
  price: string
  currency: string
  primaryImageUrl: string
  inStock: boolean
}

export interface OptionValueInput {
  id: string
  label: string
  position?: number
}

export interface OptionGroupInput {
  id: string
  label: string
  position?: number
  values: OptionValueInput[]
}

export interface VariantInput {
  id?: string
  optionValueIds: Record<string, string>
  priceVND?: string
  priceVnd?: string
  stockQuantity: number
  active: boolean
}

export interface ProductOptionValue {
  id: string
  label: string
}

export interface ProductOptionGroup {
  id: string
  label: string
  position: number
  values: ProductOptionValue[]
}

export interface ProductVariant {
  id: string
  optionValueIds: Record<string, string>
  priceVnd?: string
  priceVND?: string
  stockQuantity: number
  active: boolean
}

export interface ProductDetail extends ProductSummary {
  description: string
  imageUrls: string[]
  stockQuantity: number
  featured: boolean
  active?: boolean
  optionGroups?: ProductOptionGroup[]
  variants?: ProductVariant[]
  createdAt: string
  updatedAt: string
}

export interface SaveProductRequest {
  name: string
  model: string
  brand: string
  description: string
  categoryId: string
  price: string
  currency: string
  stockQuantity: number
  featured: boolean
  imageUrls: string[]
  hasVariants?: boolean
  optionGroups?: OptionGroupInput[]
  variants?: VariantInput[]
}

