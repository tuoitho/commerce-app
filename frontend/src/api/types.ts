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
  displayName?: string | null
  phone?: string | null
  avatarUrl?: string | null
}

export interface SessionResponse {
  user: User
  accessToken: string
}

export interface AuthMeResponse {
  user: User
}

export interface ForgotPasswordResponse {
  cooldownSeconds: number
}

export interface ResetPasswordInput {
  email: string
  otp: string
  newPassword: string
}

export interface ResetPasswordResponse {
  reset: boolean
}

// Catalog
export interface Category {
  id: string
  name: string
}

export interface CategoriesResponse {
  categories: Category[]
}

export interface SpecItem {
  label: string
  value: string
}

export interface SpecGroup {
  group: string
  items: SpecItem[]
}

export interface VariantFlashSale {
  flashSaleId: string
  campaignName: string
  flashPriceVnd: string
  quota: number
  soldQuantity: number
  endsAt: string
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
  averageRating?: number
  reviewCount?: number
  soldCount?: number
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
  /** Live-session price in effect; priceVnd stays the regular price. */
  livePriceVnd?: string | null
  /** Live-price quota left; null when unlimited or no live price. */
  liveRemaining?: number | null
  flashSale?: VariantFlashSale | null
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
  optionGroups: OptionGroup[]
  variants: ProductVariant[]
  specs?: SpecGroup[]
  averageRating?: number
  reviewCount?: number
  soldCount?: number
  createdAt: string
  updatedAt: string
  adminReply?: string
  adminRepliedAt?: string
}

export type ProductSort = 'bestselling' | 'newest' | 'price_asc' | 'price_desc' | 'rating_desc'

export interface ProductFilterParams {
  q?: string
  category_id?: string | string[]
  brand?: string | string[]
  min_price?: string
  max_price?: string
  in_stock?: 'true' | 'false' | boolean
  sort?: ProductSort | '' | string
  min_rating?: number | string
  page?: number
  limit?: number
}

// Flash Sales
export type FlashSaleStatus = 'scheduled' | 'running' | 'ended' | 'inactive'

export interface FlashSaleItem {
  productId: string
  variantId: string
  productName: string
  brand: string
  model: string
  imageUrl: string
  optionLabel: string
  regularPriceVnd: string
  flashPriceVnd: string
  discountPercent: number
  quota: number
  soldQuantity: number
  inStock: boolean
}

export interface FlashSaleCampaign {
  id: string
  name: string
  startsAt: string
  endsAt: string
  items: FlashSaleItem[]
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
  categoryId?: string
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
  /** unitPriceVnd is a live-session price. */
  isLivePrice?: boolean
  /** unitPriceVnd is a flash-sale price. */
  isFlashSalePrice?: boolean
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
  adminReply?: string
  adminRepliedAt?: string
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
  | 'partially_returned'
  | 'returned'

export type OrderStatusBucket =
  | 'all'
  | 'pending'
  | 'pickup'
  | 'delivery'
  | 'delivered'
  | 'reviewable'
  | 'returns'
  | 'cancelled'

export type ReturnStatus =
  | 'pending_approval'
  | 'approved'
  | 'received'
  | 'refunded'
  | 'rejected'
  | 'cancelled'

export type ReturnReasonCode =
  | 'defective'
  | 'not_as_described'
  | 'wrong_or_missing'
  | 'changed_mind'

export interface ReturnEligibility {
  eligible: boolean
  deadline: string | null
}

export interface ReturnRequestItem {
  orderItemId: string
  variantId: string
  productId?: string
  brandName?: string
  productName: string
  model?: string
  imageUrl?: string
  options?: CartOption[]
  quantity: number
  unitPriceVnd: string
  lineTotalVnd: string
  receivedVariantId?: string | null
}

export interface ReturnRequest {
  id: string
  orderId: string
  userId?: string
  buyerEmail?: string
  status: ReturnStatus
  reasonCode: ReturnReasonCode
  description?: string
  rejectReason?: string
  expectedRefundVnd: string
  refundAmountVnd?: string | null
  refundedByUserId?: string | null
  items?: ReturnRequestItem[]
  createdAt: string
  updatedAt: string
  approvedAt?: string | null
  rejectedAt?: string | null
  receivedAt?: string | null
  refundedAt?: string | null
  cancelledAt?: string | null
}

export interface CreateReturnInput {
  orderItemIds: string[]
  reasonCode: ReturnReasonCode
  description?: string
}

// Reviews
export type ReviewMediaType = 'image' | 'video'

export interface ReviewMedia {
  id: string
  reviewId?: string
  type: ReviewMediaType
  url: string
  mimeType: string
  sizeBytes?: number
  position: number
  createdAt?: string
}

export interface Review {
  id: string
  orderItemId?: string
  rating: number
  comment: string
  editCount: number
  media: ReviewMedia[]
  createdAt: string
  updatedAt: string
  edited: boolean
  canEdit: boolean
}

export type OrderItemReviewStatus = 'eligible' | 'reviewed' | 'refunded' | 'ineligible'

export interface CreateReviewInput {
  rating: number
  comment?: string
  images?: File[]
  video?: File
}

export interface UpdateReviewInput {
  rating: number
  comment?: string
  retainedMediaIds?: string[]
  images?: File[]
  video?: File
}

export type HelpfulnessVote = 'helpful' | 'unhelpful'

export interface HelpfulnessState {
  helpfulCount: number
  unhelpfulCount: number
  viewerVote: HelpfulnessVote | null
}

export interface PublicReviewer {
  maskedEmail: string | null
}

export interface PublicPurchase {
  model: string
  options: CartOption[]
}

export interface PublicReview {
  id: string
  rating: number
  comment: string
  reviewer: PublicReviewer
  purchase: PublicPurchase
  media: ReviewMedia[]
  createdAt: string
  helpfulness: HelpfulnessState
  adminReply?: string | null
  adminReplyId?: string
  adminReplyHelpfulness?: HelpfulnessState
  adminRepliedAt?: string | null
}


export interface ProductReviewSummary {
  totalReviews: number
  averageRating: string
  ratingCounts: Record<string, number>
}

export interface ProductReviewsResponse {
  reviews: PublicReview[]
  summary: ProductReviewSummary
}

export interface UserReviewProduct {
  id: string
  name: string
  brandName: string
  model: string
  imageUrl: string
  options: CartOption[]
}

export interface UserReviewOrder {
  id: string
  createdAt: string
}

export interface UserReview {
  id: string
  orderItemId: string
  order: UserReviewOrder
  product: UserReviewProduct
  rating: number
  comment: string
  editCount: number
  canEdit: boolean
  edited: boolean
  media: ReviewMedia[]
  createdAt: string
  updatedAt: string
  adminReply?: string | null
  adminRepliedAt?: string | null
}

export interface UserReviewsResponse {
  reviews: UserReview[]
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
  reviewStatus?: OrderItemReviewStatus
  review?: Review | null
}

export type PaymentMethod = 'cod' | 'momo'

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

// Vouchers & Shipping
export type VoucherType = 'percent' | 'fixed_amount' | 'freeship'

export type VoucherScopeType = 'all' | 'categories' | 'products'

export interface VoucherScopeTarget {
  id: string
  name: string
}

export type VoucherEffectiveStatus = 'scheduled' | 'active' | 'exhausted' | 'expired' | 'inactive'

export type VoucherWalletStatus = 'available' | 'used_up' | 'expired' | 'exhausted' | 'inactive' | 'scheduled'

export interface Voucher {
  id: string
  code: string
  title: string
  description: string
  voucherType: VoucherType
  scopeType?: VoucherScopeType
  scopeCategories?: VoucherScopeTarget[]
  scopeProducts?: VoucherScopeTarget[]
  discountValue: string
  maxDiscountVnd: string | null
  minOrderVnd: string
  usageLimit: number | null
  usedCount: number
  perUserLimit: number
  userRemainingUses?: number
  startsAt: string
  endsAt: string
  active?: boolean
  effectiveStatus?: VoucherEffectiveStatus
  createdAt?: string
  updatedAt?: string
}

export type AvailableVoucher = Voucher & {
  userRemainingUses: number
  claimedAt?: string
}

export type DiscoverVoucher = Voucher & {
  userRemainingUses: number
  claimed: boolean
  claimedAt: string | null
}

export type UserVoucher = Voucher & {
  userRemainingUses: number
  claimedAt: string
  walletStatus: VoucherWalletStatus
}

export type DeliveryMethod = 'standard' | 'express_2h'

export interface CheckoutQuoteInput {
  addressId: string
  deliveryMethod?: DeliveryMethod
  voucherCode?: string
}

export interface CheckoutQuote {
  subtotalVnd: string
  eligibleSubtotalVnd?: string
  deliveryMethod: DeliveryMethod
  expressAvailable: boolean
  standardShippingFeeVnd: string
  expressShippingFeeVnd: string
  freeShippingThresholdVnd: string
  shippingFeeVnd: string
  voucherCode: string | null
  voucherType: VoucherType | null
  discountVnd: string
  totalVnd: string
}

export type OrderTimelineActorType = 'customer' | 'admin' | 'system'

export interface OrderTimelineEvent {
  id: string
  status: OrderStatus
  actorType: OrderTimelineActorType
  note: string
  createdAt: string
}

export interface Order {
  id: string
  userId: string
  status: OrderStatus
  paymentMethod: PaymentMethod | string
  paymentStatus?: PaymentStatus
  paymentTransactionId?: string | null
  paidAt?: string | null
  payUrl?: string
  recipientName: string
  phone: string
  provinceName: string
  wardName: string
  detailAddress: string
  subtotalVnd: string
  shippingFeeVnd: string
  discountVnd?: string
  voucherCode?: string | null
  voucherType?: VoucherType | null
  deliveryMethod?: DeliveryMethod
  carrier?: string | null
  trackingCode?: string | null
  totalVnd: string
  items: OrderItem[]
  timeline?: OrderTimelineEvent[]
  createdAt: string
  updatedAt: string
  confirmedAt?: string | null
  preparingAt?: string | null
  shippedAt?: string | null
  cancelledAt?: string | null
  deliveredAt?: string | null
  cancellableUntil?: string | null
  returnEligibility?: ReturnEligibility | null
  latestReturnRequest?: ReturnRequest | null
}

export interface AdminOrder extends Order {
  buyerEmail: string
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
  paymentMethod?: PaymentMethod
  deliveryMethod?: DeliveryMethod
  voucherCode?: string
  lines: OrderLineInput[]
}

export interface ShipOrderInput {
  carrier: string
  trackingCode: string
}

export interface BuyAgainAdjustedItem {
  variantId: string
  productName: string
  requestedQuantity: number
  addedQuantity: number
}

export type BuyAgainSkipReason = 'out_of_stock' | 'unavailable'

export interface BuyAgainSkippedItem {
  variantId: string
  productName: string
  reason: BuyAgainSkipReason
}

export interface BuyAgainResult {
  cart: Cart
  addedCount: number
  adjustedItems: BuyAgainAdjustedItem[]
  skippedItems: BuyAgainSkippedItem[]
}

export interface MomoReturnPayload {
  partnerCode: string
  orderId: string
  requestId: string
  amount: string | number
  orderInfo: string
  orderType: string
  transId: string | number
  resultCode: number
  message: string
  payType: string
  responseTime: string | number
  extraData: string
  signature: string
}

// Favorites
export type { FavoriteAvailability, FavoriteProduct } from '@/types/favorite'



