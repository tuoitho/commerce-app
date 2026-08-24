import { apiClient, apiClientWithMeta } from './client'

export type ReturnRequestStatus =
  | 'pending_approval'
  | 'approved'
  | 'received'
  | 'refunded'
  | 'rejected'
  | 'cancelled'

export const RETURN_STATUS_LABELS: Record<ReturnRequestStatus, string> = {
  pending_approval: 'Chờ duyệt',
  approved: 'Đã duyệt',
  received: 'Đã nhận hàng',
  refunded: 'Đã hoàn tiền',
  rejected: 'Bị từ chối',
  cancelled: 'Khách đã rút',
}

export type ReturnReasonCode =
  | 'defective'
  | 'not_as_described'
  | 'wrong_or_missing'
  | 'changed_mind'

export const RETURN_REASON_LABELS: Record<ReturnReasonCode, string> = {
  defective: 'Hàng bị lỗi hoặc hư hỏng',
  not_as_described: 'Hàng không giống mô tả',
  wrong_or_missing: 'Giao sai hoặc thiếu hàng',
  changed_mind: 'Khách thay đổi ý định mua',
}

export interface ReturnItemView {
  id: string
  orderItemId: string
  productName: string
  imageUrl: string
  unitPriceVnd: string
  quantity: number
}

export interface ReturnRequestView {
  id: string
  orderId: string
  status: ReturnRequestStatus
  reasonCode: ReturnReasonCode
  description: string
  rejectReason?: string
  items: ReturnItemView[]
  refundAmountVnd?: string
  createdAt: string
  updatedAt: string
  approvedAt?: string | null
  rejectedAt?: string | null
  receivedAt?: string | null
  refundedAt?: string | null
  cancelledAt?: string | null
}

export interface AdminReturnRequestView extends ReturnRequestView {
  buyerEmail: string
  buyerUserId?: string
  orderTotalVnd: string
  shippingFeeVnd: string
  suggestedRefundVnd: string
}

export interface GetAdminReturnRequestsParams {
  status?: string
  page?: number
  limit?: number
}

export interface ReturnRequestPaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface AdminReturnRequestListResponse {
  data: AdminReturnRequestView[]
  meta: {
    timestamp: string
    pagination?: ReturnRequestPaginationMeta
  }
  message: string
}

export interface RejectReturnRequestInput {
  reason: string
}

export interface RecordRefundInput {
  amount: string
}

export async function getAdminReturnRequests(
  params: GetAdminReturnRequestsParams = {}
): Promise<AdminReturnRequestListResponse> {
  const searchParams = new URLSearchParams()
  if (params.status !== undefined && params.status.trim() !== '') {
    searchParams.set('status', params.status.trim())
  }
  if (params.page !== undefined) {
    searchParams.set('page', String(params.page))
  }
  if (params.limit !== undefined) {
    searchParams.set('limit', String(params.limit))
  }

  const queryString = searchParams.toString()
  const path = queryString
    ? `/admin/return-requests?${queryString}`
    : '/admin/return-requests'

  return apiClientWithMeta<AdminReturnRequestView[]>(path)
}

export async function getAdminReturnRequest(requestId: string): Promise<AdminReturnRequestView> {
  return apiClient<AdminReturnRequestView>(
    `/admin/return-requests/${encodeURIComponent(requestId)}`
  )
}

export async function approveReturnRequest(requestId: string): Promise<AdminReturnRequestView> {
  return apiClient<AdminReturnRequestView>(
    `/admin/return-requests/${encodeURIComponent(requestId)}/approve`,
    { method: 'POST' }
  )
}

export async function rejectReturnRequest(
  requestId: string,
  input: RejectReturnRequestInput
): Promise<AdminReturnRequestView> {
  return apiClient<AdminReturnRequestView>(
    `/admin/return-requests/${encodeURIComponent(requestId)}/reject`,
    { method: 'POST', body: input }
  )
}

export async function receiveReturnRequest(requestId: string): Promise<AdminReturnRequestView> {
  return apiClient<AdminReturnRequestView>(
    `/admin/return-requests/${encodeURIComponent(requestId)}/receive`,
    { method: 'POST' }
  )
}

export async function refundReturnRequest(
  requestId: string,
  input: RecordRefundInput
): Promise<AdminReturnRequestView> {
  return apiClient<AdminReturnRequestView>(
    `/admin/return-requests/${encodeURIComponent(requestId)}/refund`,
    { method: 'POST', body: input }
  )
}
