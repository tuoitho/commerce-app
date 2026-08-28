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
  role?: string
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

export interface ViewerState {
  isFavorite: boolean
}

export interface FavoriteStateResponse {
  productId: string
  isFavorite: boolean
}

export interface FavoriteProductSummary {
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
  viewer: ViewerState
  active: boolean
  favoritedAt: string
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
  viewer?: ViewerState
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
  active?: boolean
}

export interface ProductDetail {
  id: string
  name: string
  model: string
  description: string
  brand: string
  category: Category
  minPriceVnd: string
  maxPriceVnd: string
  price: string
  currency: string
  imageUrls: string[]
  stockQuantity: number
  inStock: boolean
  featured: boolean
  active?: boolean
  optionGroups: OptionGroup[]
  variants: ProductVariant[]
  reviewSummary?: ReviewSummary
  createdAt: string
  updatedAt: string
  viewer?: ViewerState
}

export interface ProductFilterParams {
  q?: string
  category_id?: string | string[]
  brand?: string | string[]
  min_price?: string
  max_price?: string
  in_stock?: 'true' | 'false' | boolean
  page?: number
  limit?: number
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
  shippingFeeVnd: string
}

export interface CartResponse {
  cart: Cart
}

// Areas
export interface Province {
  code: number
  name: string
}

export interface Ward {
  code: number
  provinceCode: number
  name: string
}

// Addresses
export interface Address {
  id: string
  userId: string
  recipientName: string
  phone: string
  provinceCode: number
  provinceName: string
  wardCode: number
  wardName: string
  detailAddress: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface AddressInput {
  recipientName: string
  phone: string
  provinceCode: number
  wardCode: number
  detailAddress: string
  isDefault?: boolean
}

// Orders
export type OrderStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'preparing'
  | 'cancel_requested'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned'

export type OrderStatusBucket =
  | 'all'
  | 'pending'
  | 'pickup'
  | 'delivery'
  | 'delivered'
  | 'returns'
  | 'cancelled'

export type OrderItemReviewStatus = 'ineligible' | 'eligible' | 'reviewed'

export interface OrderItemReviewState {
  status: OrderItemReviewStatus
  reviewId?: string | null
  canEdit: boolean
  remainingEdits: number
}

export interface OrderItem {
  id: string
  variantId: string
  productId: string
  brandName: string
  productName: string
  model: string
  imageUrl: string
  options: CartOption[]
  unitPriceVnd: string
  quantity: number
  lineTotalVnd: string
  reviewState?: OrderItemReviewState
}

export interface Order {
  id: string
  userId: string
  status: OrderStatus
  paymentMethod: string
  recipientName: string
  phone: string
  provinceName: string
  wardName: string
  detailAddress: string
  subtotalVnd: string
  shippingFeeVnd: string
  totalVnd: string
  items: OrderItem[]
  createdAt: string
  updatedAt: string
  confirmedAt?: string | null
  cancelledAt?: string | null
  cancellableUntil?: string | null
  deliveredAt?: string | null
}

export interface OrderStats {
  pendingConfirmation: number
  awaitingPickup: number
  awaitingDelivery: number
  awaitingReview: number
}

export interface OrderLineInput {
  variantId: string
  quantity: number
  productName: string
  unitPriceVnd: string
}

export interface CreateOrderInput {
  addressId: string
  lines: OrderLineInput[]
}

// Product Reviews
export interface ReviewSummary {
  averageRating: number | null
  reviewCount: number
}

export type ReviewMediaType = 'image' | 'video'

export interface ReviewMedia {
  id: string
  type: ReviewMediaType
  mimeType: string
  sizeBytes: number
  position: number
  url: string
  createdAt?: string
}

export interface PurchasedOption {
  groupLabel: string
  valueLabel: string
}

export interface ReviewViewerState {
  isOwner: boolean
  canEdit: boolean
  remainingEdits: number
}

export interface Review {
  id: string
  orderItemId?: string
  productId: string
  variantId: string
  purchasedOptions: PurchasedOption[]
  rating: number
  comment: string
  media: ReviewMedia[]
  verifiedPurchase: boolean
  authorLabel: string
  createdAt: string
  updatedAt: string
  viewer?: ReviewViewerState | null
}

export interface CreateReviewMediaItem {
  source: 'upload'
  uploadIndex: number
  sha256: string
  sizeBytes: number
}

export interface EditReviewMediaExistingItem {
  source: 'existing'
  mediaId: string
}

export interface EditReviewMediaUploadItem {
  source: 'upload'
  uploadIndex: number
  sha256: string
  sizeBytes: number
}

export type EditReviewMediaItem = EditReviewMediaExistingItem | EditReviewMediaUploadItem

export interface CreateReviewPayload {
  rating: number
  comment?: string
  media?: CreateReviewMediaItem[]
}

export interface EditReviewPayload {
  rating: number
  comment?: string
  media?: EditReviewMediaItem[]
}

export interface ReviewHistoryProduct {
  id: string
  name: string
  publicPath: string | null
}

export interface OwnedReviewHistoryItem {
  review: Review
  product: ReviewHistoryProduct
}


