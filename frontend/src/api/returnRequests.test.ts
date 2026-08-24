import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  returnRequestsApi,
  listReturnRequests,
  createReturnRequest,
  cancelReturnRequest,
  RETURN_REASON_LABELS,
} from './returnRequests'
import type { ReturnRequestView } from './returnRequests'

describe('returnRequestsApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const mockRequest: ReturnRequestView = {
    id: 'rr-1',
    orderId: 'ord-1',
    status: 'pending_approval',
    reasonCode: 'defective',
    description: '',
    items: [
      {
        id: 'ri-1',
        orderItemId: 'oi-1',
        productName: 'Product A',
        imageUrl: 'https://example.com/img.jpg',
        unitPriceVnd: '500000',
        quantity: 1,
      },
    ],
    createdAt: '2026-08-21T08:00:00.000Z',
    updatedAt: '2026-08-21T08:00:00.000Z',
    approvedAt: null,
    rejectedAt: null,
    receivedAt: null,
    refundedAt: null,
    cancelledAt: null,
  }

  it('createReturnRequest calls POST /orders/:id/return-requests with payload', async () => {
    const input = {
      items: [{ orderItemId: 'oi-1', quantity: 1 }],
      reasonCode: 'defective' as const,
      description: '',
    }
    const mockResponse = {
      success: true,
      message: 'Tạo yêu cầu trả hàng thành công',
      data: mockRequest,
      error: null,
      meta: { timestamp: '2026-08-21T08:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await createReturnRequest('ord-1', input)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders/ord-1/return-requests'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
      })
    )
    expect(result).toEqual(mockRequest)

    const objResult = await returnRequestsApi.createReturnRequest('ord-1', input)
    expect(objResult).toEqual(mockRequest)
  })

  it('listReturnRequests calls GET /orders/:id/return-requests', async () => {
    const mockResponse = {
      success: true,
      message: 'Lấy danh sách yêu cầu trả hàng thành công',
      data: [mockRequest],
      error: null,
      meta: { timestamp: '2026-08-21T08:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await listReturnRequests('ord-1')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders/ord-1/return-requests'),
      expect.anything()
    )
    expect(result).toEqual([mockRequest])

    const objResult = await returnRequestsApi.listReturnRequests('ord-1')
    expect(objResult).toEqual([mockRequest])
  })

  it('cancelReturnRequest calls POST /orders/:id/return-requests/:requestId/cancel', async () => {
    const cancelled = { ...mockRequest, status: 'cancelled' as const, cancelledAt: '2026-08-21T11:00:00.000Z' }
    const mockResponse = {
      success: true,
      message: 'Rút yêu cầu trả hàng thành công',
      data: cancelled,
      error: null,
      meta: { timestamp: '2026-08-21T11:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await cancelReturnRequest('ord-1', 'rr-1')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders/ord-1/return-requests/rr-1/cancel'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(result).toEqual(cancelled)

    const objResult = await returnRequestsApi.cancelReturnRequest('ord-1', 'rr-1')
    expect(objResult).toEqual(cancelled)
  })

  it('exposes Vietnamese labels for all four reason codes', () => {
    expect(RETURN_REASON_LABELS.defective).toBe('Hàng bị lỗi hoặc hư hỏng')
    expect(RETURN_REASON_LABELS.not_as_described).toBe('Hàng không giống mô tả')
    expect(RETURN_REASON_LABELS.wrong_or_missing).toBe('Giao sai hoặc thiếu hàng')
    expect(RETURN_REASON_LABELS.changed_mind).toBe('Khách thay đổi ý định mua')
  })
})
