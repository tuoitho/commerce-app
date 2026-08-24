import { apiClient } from './client'

export type ReturnReasonCode =
  | 'defective'
  | 'not_as_described'
  | 'wrong_or_missing'
  | 'changed_mind'

export type ReturnRequestStatus =
  | 'pending_approval'
  | 'approved'
  | 'received'
  | 'refunded'
  | 'rejected'
  | 'cancelled'

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

export interface CreateReturnRequestInput {
  items: { orderItemId: string; quantity: number }[]
  reasonCode: ReturnReasonCode
  description?: string
}

export const RETURN_REASON_LABELS: Record<ReturnReasonCode, string> = {
  defective: 'Hàng bị lỗi hoặc hư hỏng',
  not_as_described: 'Hàng không giống mô tả',
  wrong_or_missing: 'Giao sai hoặc thiếu hàng',
  changed_mind: 'Khách thay đổi ý định mua',
}

export async function listReturnRequests(orderId: string): Promise<ReturnRequestView[]> {
  return apiClient<ReturnRequestView[]>(`/orders/${orderId}/return-requests`)
}

export async function createReturnRequest(
  orderId: string,
  input: CreateReturnRequestInput
): Promise<ReturnRequestView> {
  return apiClient<ReturnRequestView>(`/orders/${orderId}/return-requests`, {
    method: 'POST',
    body: input,
  })
}

export async function cancelReturnRequest(
  orderId: string,
  requestId: string
): Promise<ReturnRequestView> {
  return apiClient<ReturnRequestView>(
    `/orders/${orderId}/return-requests/${requestId}/cancel`,
    {
      method: 'POST',
    }
  )
}

export const returnRequestsApi = {
  listReturnRequests,
  createReturnRequest,
  cancelReturnRequest,
}
