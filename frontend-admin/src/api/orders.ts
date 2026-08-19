import { apiClient, apiClientWithMeta, type ApiResponseWithMeta } from './client'
import type { AdminOrder } from './types'

export interface GetAdminOrdersParams {
  status?: string
  page?: number
  limit?: number
}

export async function getAdminOrders(
  params: GetAdminOrdersParams = {}
): Promise<ApiResponseWithMeta<AdminOrder[]>> {
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
  const path = queryString ? `/admin/orders?${queryString}` : '/admin/orders'

  return apiClientWithMeta<AdminOrder[]>(path)
}

export async function getAdminOrder(id: string): Promise<AdminOrder> {
  return apiClient<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}`)
}

export async function adminConfirmPreparing(id: string): Promise<AdminOrder> {
  return apiClient<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}/confirm-preparing`, {
    method: 'POST',
  })
}

export async function adminShip(id: string): Promise<AdminOrder> {
  return apiClient<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}/ship`, {
    method: 'POST',
  })
}

export async function adminDeliver(id: string): Promise<AdminOrder> {
  return apiClient<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}/deliver`, {
    method: 'POST',
  })
}

export async function adminApproveCancel(id: string): Promise<AdminOrder> {
  return apiClient<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}/cancel/approve`, {
    method: 'POST',
  })
}

export async function adminDeclineCancel(id: string): Promise<AdminOrder> {
  return apiClient<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}/cancel/decline`, {
    method: 'POST',
  })
}
