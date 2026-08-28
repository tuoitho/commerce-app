import { apiClient, apiClientWithMeta } from './client'
import type {
  ReturnRequestSummary,
  ReturnRequestDetail,
  VariantOptionItem,
} from './types'

export interface ListReturnsParams {
  status?: string
  page?: number
  limit?: number
}

export interface ListReturnsResponse {
  items: ReturnRequestSummary[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface VariantOptionsResponse {
  items: VariantOptionItem[]
  total: number
}

export interface ReceiveItemInput {
  orderItemId: string
  receivedVariantId: string
}

export const adminReturnsApi = {
  async listReturns(params: ListReturnsParams = {}): Promise<ListReturnsResponse> {
    const query = new URLSearchParams()
    if (params.status) query.set('status', params.status)
    if (params.page) query.set('page', String(params.page))
    if (params.limit) query.set('limit', String(params.limit))

    const url = `/admin/returns${query.toString() ? `?${query.toString()}` : ''}`
    const res = await apiClientWithMeta<ReturnRequestSummary[]>(url)
    return {
      items: res.data || [],
      total: res.meta?.pagination?.total ?? res.data?.length ?? 0,
      page: res.meta?.pagination?.page ?? params.page ?? 1,
      limit: res.meta?.pagination?.limit ?? params.limit ?? 20,
      totalPages: res.meta?.pagination?.totalPages ?? 1,
    }
  },

  async getReturnDetail(returnId: string): Promise<ReturnRequestDetail> {
    return apiClient<ReturnRequestDetail>(`/admin/returns/${encodeURIComponent(returnId)}`)
  },

  async searchVariantOptions(query?: string, limit: number = 20): Promise<VariantOptionsResponse> {
    const qParams = new URLSearchParams()
    if (query) qParams.set('q', query)
    if (limit) qParams.set('limit', String(limit))

    const url = `/admin/returns/variant-options${qParams.toString() ? `?${qParams.toString()}` : ''}`
    const res = await apiClientWithMeta<VariantOptionItem[]>(url)
    return {
      items: res.data || [],
      total: res.meta?.pagination?.total ?? res.data?.length ?? 0,
    }
  },

  async approveReturn(returnId: string): Promise<ReturnRequestDetail> {
    return apiClient<ReturnRequestDetail>(`/admin/returns/${encodeURIComponent(returnId)}/approve`, {
      method: 'POST',
    })
  },

  async rejectReturn(returnId: string, rejectReason: string): Promise<ReturnRequestDetail> {
    return apiClient<ReturnRequestDetail>(`/admin/returns/${encodeURIComponent(returnId)}/reject`, {
      method: 'POST',
      body: { rejectReason },
    })
  },

  async receiveReturn(returnId: string, items: ReceiveItemInput[]): Promise<ReturnRequestDetail> {
    return apiClient<ReturnRequestDetail>(`/admin/returns/${encodeURIComponent(returnId)}/receive`, {
      method: 'POST',
      body: { items },
    })
  },

  async refundReturn(returnId: string): Promise<ReturnRequestDetail> {
    return apiClient<ReturnRequestDetail>(`/admin/returns/${encodeURIComponent(returnId)}/refund`, {
      method: 'POST',
    })
  },
}
