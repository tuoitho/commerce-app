import { apiClient, apiClientWithMeta, type ApiResponseWithMeta } from './client'
import type { AdminVoucher, SaveVoucherInput } from './types'

export interface ListAdminVouchersParams {
  q?: string
  status?: string
  page?: number
  limit?: number
}

export async function listAdminVouchers(
  params: ListAdminVouchersParams = {}
): Promise<ApiResponseWithMeta<AdminVoucher[]>> {
  const searchParams = new URLSearchParams()
  if (params.q !== undefined && params.q.trim() !== '') {
    searchParams.set('q', params.q.trim())
  }
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
  const path = queryString ? `/admin/vouchers?${queryString}` : '/admin/vouchers'
  return apiClientWithMeta<AdminVoucher[]>(path)
}

export async function getAdminVoucher(id: string): Promise<AdminVoucher> {
  return apiClient<AdminVoucher>(`/admin/vouchers/${encodeURIComponent(id)}`)
}

export async function createAdminVoucher(input: SaveVoucherInput): Promise<AdminVoucher> {
  return apiClient<AdminVoucher>('/admin/vouchers', {
    method: 'POST',
    body: input,
  })
}

export async function updateAdminVoucher(id: string, input: SaveVoucherInput): Promise<AdminVoucher> {
  return apiClient<AdminVoucher>(`/admin/vouchers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: input,
  })
}

export async function deleteAdminVoucher(id: string): Promise<void> {
  return apiClient<void>(`/admin/vouchers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
