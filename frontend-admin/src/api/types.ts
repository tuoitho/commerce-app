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

export interface CreateCategoryInput {
  name: string
}

export interface UpdateCategoryInput {
  name: string
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

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_confirmation: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  preparing: 'Đang chuẩn bị hàng',
  cancel_requested: 'Chờ duyệt hủy',
  shipped: 'Đã giao cho ĐVVC',
  delivered: 'Đã giao',
  cancelled: 'Đã hủy',
  partially_returned: 'Trả hàng một phần',
  returned: 'Đã trả hàng',
}

export type ReturnStatus =
  | 'pending_approval'
  | 'approved'
  | 'received'
  | 'refunded'
  | 'rejected'
  | 'cancelled'

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  pending_approval: 'Chờ duyệt',
  approved: 'Đã duyệt',
  received: 'Đã nhận hàng',
  refunded: 'Đã hoàn tiền',
  rejected: 'Đã từ chối',
  cancelled: 'Đã hủy',
}

export type ReturnReasonCode =
  | 'defective'
  | 'not_as_described'
  | 'wrong_or_missing'
  | 'changed_mind'

export const RETURN_REASON_LABELS: Record<ReturnReasonCode, string> = {
  defective: 'Sản phẩm lỗi/hư hỏng',
  not_as_described: 'Không giống mô tả',
  wrong_or_missing: 'Sai sản phẩm hoặc thiếu phụ kiện',
  changed_mind: 'Không còn nhu cầu',
}

export interface CartOption {
  groupLabel: string
  valueLabel: string
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
  deliveredAt?: string | null
}

export interface AdminOrder extends Order {
  buyerEmail: string
}

export interface ReturnRequestItem {
  orderItemId: string
  variantId: string
  productId: string
  brandName: string
  productName: string
  model: string
  imageUrl: string
  options: CartOption[]
  quantity: number
  unitPriceVnd: string
  lineTotalVnd: string
  receivedVariantId?: string | null
}

export interface ReturnRequestSummary {
  id: string
  orderId: string
  userId: string
  buyerEmail: string
  status: ReturnStatus
  reasonCode: ReturnReasonCode
  expectedRefundVnd: string
  createdAt: string
}

export interface ReturnRequestDetail {
  id: string
  orderId: string
  userId: string
  buyerEmail: string
  status: ReturnStatus
  reasonCode: ReturnReasonCode
  description: string
  rejectReason: string
  expectedRefundVnd: string
  refundAmountVnd: string | null
  refundedByUserId?: string | null
  items: ReturnRequestItem[]
  createdAt: string
  updatedAt: string
  approvedAt: string | null
  rejectedAt: string | null
  receivedAt: string | null
  refundedAt: string | null
  cancelledAt: string | null
}

export interface VariantOptionItem {
  variantId: string
  productId: string
  brandName: string
  productName: string
  model: string
  options: CartOption[]
  stockQuantity: number
  productActive: boolean
  variantActive: boolean
}

