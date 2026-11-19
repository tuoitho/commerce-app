import { apiClient } from './client'
import type {
  Order,
  CreateOrderInput,
  OrderStatusBucket,
  OrderStats,
  MomoReturnPayload,
  BuyAgainResult,
} from './types'

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const trimmedVoucher = input.voucherCode?.trim()
  const body: CreateOrderInput = {
    addressId: input.addressId,
    ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
    ...(input.deliveryMethod ? { deliveryMethod: input.deliveryMethod } : {}),
    ...(trimmedVoucher ? { voucherCode: trimmedVoucher } : {}),
    lines: input.lines,
  }
  return apiClient<Order>('/orders', {
    method: 'POST',
    body,
  })
}

export async function listOrders(status?: OrderStatusBucket): Promise<Order[]> {
  const endpoint = status && status !== 'all' ? `/orders?status=${status}` : '/orders'
  return apiClient<Order[]>(endpoint)
}

export async function getOrderStats(): Promise<OrderStats> {
  return apiClient<OrderStats>('/orders/stats')
}

export async function getOrder(id: string): Promise<Order> {
  return apiClient<Order>(`/orders/${id}`)
}

export async function cancelOrder(id: string): Promise<Order> {
  return apiClient<Order>(`/orders/${id}/cancel`, {
    method: 'POST',
  })
}

export async function undoCancelOrder(id: string): Promise<Order> {
  return apiClient<Order>(`/orders/${id}/cancel/undo`, {
    method: 'POST',
  })
}

export async function retryMomoPayment(id: string): Promise<Order> {
  return apiClient<Order>(`/orders/${id}/momo/retry`, {
    method: 'POST',
  })
}

export async function confirmMomoReturn(payload: MomoReturnPayload): Promise<Order> {
  return apiClient<Order>('/payments/momo/return', {
    method: 'POST',
    body: payload,
  })
}

export async function buyAgain(orderId: string): Promise<BuyAgainResult> {
  return apiClient<BuyAgainResult>(`/orders/${orderId}/buy-again`, {
    method: 'POST',
  })
}

export const ordersApi = {
  createOrder,
  listOrders,
  getOrderStats,
  getOrder,
  cancelOrder,
  undoCancelOrder,
  retryMomoPayment,
  confirmMomoReturn,
  buyAgain,
}
