import { apiClient } from './client'
import type { Order, CreateOrderInput, OrderStatusBucket, OrderStats } from './types'

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  return apiClient<Order>('/orders', {
    method: 'POST',
    body: input,
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

export const ordersApi = {
  createOrder,
  listOrders,
  getOrderStats,
  getOrder,
  cancelOrder,
  undoCancelOrder,
}
