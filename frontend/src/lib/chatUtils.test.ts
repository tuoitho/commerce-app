import { describe, it, expect } from 'vitest'
import {
  getOrderStatusInfo,
  orderToAttachedOrderCard,
  formatChatTime,
} from './chatUtils'
import type { Order } from '@/api/types'

describe('chatUtils order helpers', () => {
  it('returns appropriate status info for known order statuses', () => {
    const pending = getOrderStatusInfo('pending_confirmation')
    expect(pending.label).toBe('Chờ xác nhận')
    expect(pending.badgeClass).toContain('amber')

    const delivered = getOrderStatusInfo('delivered')
    expect(delivered.label).toBe('Đã giao hàng')
    expect(delivered.badgeClass).toContain('emerald')

    const cancelled = getOrderStatusInfo('cancelled')
    expect(cancelled.label).toBe('Đã hủy')
    expect(cancelled.badgeClass).toContain('rose')
  })

  it('falls back gracefully for unknown status', () => {
    const unknown = getOrderStatusInfo('unknown_status')
    expect(unknown.label).toBe('unknown_status')
    expect(unknown.badgeClass).toBeDefined()
  })

  it('converts Order entity to AttachedOrderCard', () => {
    const mockOrder: Order = {
      id: 'ord-123',
      userId: 'user-456',
      status: 'confirmed',
      paymentMethod: 'cod',
      recipientName: 'Nguyễn Văn A',
      phone: '0901234567',
      provinceName: 'Hà Nội',
      wardName: 'Dịch Vọng',
      detailAddress: 'Số 1 Cầu Giấy',
      subtotalVnd: '500000',
      shippingFeeVnd: '30000',
      totalVnd: '530000',
      createdAt: '2026-09-04T10:00:00Z',
      updatedAt: '2026-09-04T10:00:00Z',
      items: [
        {
          id: 'item-1',
          variantId: 'var-1',
          productId: 'prod-1',
          brandName: 'BrandX',
          productName: 'Điện thoại BrandX',
          model: 'Pro',
          imageUrl: 'https://example.com/img.jpg',
          options: [],
          unitPriceVnd: '250000',
          quantity: 2,
          lineTotalVnd: '500000',
        },
      ],
    }

    const card = orderToAttachedOrderCard(mockOrder)
    expect(card.id).toBe('ord-123')
    expect(card.userId).toBe('user-456')
    expect(card.status).toBe('confirmed')
    expect(card.totalVnd).toBe(530000)
    expect(card.itemsSummary).toHaveLength(1)
    expect(card.itemsSummary[0].productName).toBe('Điện thoại BrandX')
    expect(card.itemsSummary[0].quantity).toBe(2)
    expect(card.itemsSummary[0].unitPriceVnd).toBe(250000)
    expect(card.totalItemsCount).toBe(1)
  })

  it('formats chat time correctly for today and previous days', () => {
    const today = new Date()
    today.setHours(14, 30, 0, 0)
    expect(formatChatTime(today.toISOString())).toBe('14:30')

    const pastDate = new Date(2026, 8, 2, 9, 15, 0) // Sept 2, 2026
    const formattedPast = formatChatTime(pastDate.toISOString())
    expect(formattedPast).toContain('02/09')
  })
})
