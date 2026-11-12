import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDashboard } from './dashboard'
import * as client from './client'
import type { DashboardData } from './dashboard'

vi.mock('./client', () => ({
  apiClient: vi.fn(),
}))

describe('admin dashboard API service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockDashboardData: DashboardData = {
    range: '7d',
    rangeStart: '2026-11-05T17:00:00Z',
    generatedAt: '2026-11-12T03:15:42Z',
    revenue: {
      deliveredVnd: '125990000',
      refundedVnd: '25990000',
      netVnd: '100000000',
      deliveredOrders: 5,
      averageOrderVnd: '25198000',
    },
    dailyRevenue: [
      {
        date: '2026-11-06',
        deliveredVnd: '0',
        refundedVnd: '0',
        netVnd: '0',
      },
    ],
    orders: {
      newInRange: 12,
      cancelledInRange: 1,
      byStatus: {
        pending_confirmation: 3,
        confirmed: 1,
        preparing: 2,
        shipped: 4,
        delivered: 40,
        cancel_requested: 1,
        cancelled: 6,
        partially_returned: 1,
        returned: 2,
      },
    },
    pendingWork: {
      pendingConfirmationOrders: 3,
      cancelRequestedOrders: 1,
      pendingApprovalReturns: 2,
      receivedReturns: 1,
      unrepliedReviews: 7,
      unreadConversations: 4,
    },
    topProducts: [
      {
        productId: '11111111-1111-1111-1111-111111111111',
        name: 'iPhone 16 Pro',
        brand: 'Apple',
        imageUrl: 'https://example.com/image.jpg',
        active: true,
        quantitySold: 9,
        revenueVnd: '233910000',
      },
    ],
    lowStock: {
      threshold: 5,
      total: 14,
      items: [
        {
          variantId: '22222222-2222-2222-2222-222222222222',
          productId: '11111111-1111-1111-1111-111111111111',
          productName: 'iPhone 16 Pro',
          options: [{ groupLabel: 'Dung lượng', valueLabel: '256GB' }],
          stockQuantity: 0,
        },
      ],
    },
  }

  it('calls /admin/dashboard without query params when range is omitted', async () => {
    vi.mocked(client.apiClient).mockResolvedValueOnce(mockDashboardData)

    const res = await getDashboard()
    expect(client.apiClient).toHaveBeenCalledWith('/admin/dashboard')
    expect(res).toEqual(mockDashboardData)
  })

  it('calls /admin/dashboard?range=7d when range is 7d', async () => {
    vi.mocked(client.apiClient).mockResolvedValueOnce(mockDashboardData)

    const res = await getDashboard('7d')
    expect(client.apiClient).toHaveBeenCalledWith('/admin/dashboard?range=7d')
    expect(res).toEqual(mockDashboardData)
  })

  it('calls /admin/dashboard?range=today when range is today', async () => {
    const todayData: DashboardData = { ...mockDashboardData, range: 'today' }
    vi.mocked(client.apiClient).mockResolvedValueOnce(todayData)

    const res = await getDashboard('today')
    expect(client.apiClient).toHaveBeenCalledWith('/admin/dashboard?range=today')
    expect(res).toEqual(todayData)
  })

  it('calls /admin/dashboard?range=30d when range is 30d', async () => {
    const thirtyData: DashboardData = { ...mockDashboardData, range: '30d' }
    vi.mocked(client.apiClient).mockResolvedValueOnce(thirtyData)

    const res = await getDashboard('30d')
    expect(client.apiClient).toHaveBeenCalledWith('/admin/dashboard?range=30d')
    expect(res).toEqual(thirtyData)
  })

  it('propagates error when apiClient throws', async () => {
    vi.mocked(client.apiClient).mockRejectedValueOnce(new Error('Network error'))

    await expect(getDashboard('7d')).rejects.toThrow('Network error')
  })
})
