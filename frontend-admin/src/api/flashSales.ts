import { apiClient, apiClientWithMeta, type ApiResponseWithMeta } from './client'
import type { AdminFlashSaleDetail, AdminFlashSaleSummary, SaveFlashSaleInput } from './types'

export interface ListAdminFlashSalesParams {
  status?: string
  page?: number
  limit?: number
}

export async function listAdminFlashSales(
  params: ListAdminFlashSalesParams = {}
): Promise<ApiResponseWithMeta<AdminFlashSaleSummary[]>> {
  const searchParams = new URLSearchParams()
  if (params.status !== undefined && params.status.trim() !== '' && params.status.trim() !== 'all') {
    searchParams.set('status', params.status.trim())
  }
  if (params.page !== undefined) {
    searchParams.set('page', String(params.page))
  }
  if (params.limit !== undefined) {
    searchParams.set('limit', String(params.limit))
  }

  const queryString = searchParams.toString()
  const path = queryString ? `/admin/flash-sales?${queryString}` : '/admin/flash-sales'
  return apiClientWithMeta<AdminFlashSaleSummary[]>(path)
}

export async function getAdminFlashSale(id: string): Promise<AdminFlashSaleDetail> {
  return apiClient<AdminFlashSaleDetail>(`/admin/flash-sales/${encodeURIComponent(id)}`)
}

export async function createAdminFlashSale(input: SaveFlashSaleInput): Promise<AdminFlashSaleDetail> {
  return apiClient<AdminFlashSaleDetail>('/admin/flash-sales', {
    method: 'POST',
    body: input,
  })
}

export async function updateAdminFlashSale(
  id: string,
  input: SaveFlashSaleInput
): Promise<AdminFlashSaleDetail> {
  return apiClient<AdminFlashSaleDetail>(`/admin/flash-sales/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: input,
  })
}

export async function deleteAdminFlashSale(id: string): Promise<void> {
  return apiClient<void>(`/admin/flash-sales/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
