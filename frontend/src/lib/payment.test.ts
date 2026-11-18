import { describe, it, expect } from 'vitest'
import type { Order } from '@/api/types'
import {
  MOMO_MAX_AMOUNT_VND,
  MOMO_MIN_AMOUNT_VND,
  canRetryMomoPayment,
  formatCountdown,
  getMomoIneligibleReason,
  getMomoPaymentDeadlineMs,
  getPaymentMethodLabel,
  getPaymentMethodShortLabel,
  getPaymentStatusBadge,
  isMomoAmountEligible,
} from './payment'

describe('payment helpers', () => {
  it('validates MoMo amount limits cleanly using BigInt', () => {
    expect(MOMO_MIN_AMOUNT_VND).toBe(1_000n)
    expect(MOMO_MAX_AMOUNT_VND).toBe(50_000_000n)
    expect(isMomoAmountEligible('999')).toBe(false)
    expect(isMomoAmountEligible('1000')).toBe(true)
    expect(isMomoAmountEligible('50000000')).toBe(true)
    expect(isMomoAmountEligible('50000001')).toBe(false)
    expect(getMomoIneligibleReason('500')).toContain('1.000 ₫ đến 50.000.000 ₫')
    expect(getMomoIneligibleReason('50000001')).toContain('1.000 ₫ đến 50.000.000 ₫')
    expect(getMomoIneligibleReason('100000')).toBeNull()
  })

  it('maps payment methods and Vietnamese payment status badges', () => {
    expect(getPaymentMethodLabel('momo')).toBe('Ví điện tử MoMo')
    expect(getPaymentMethodLabel('cod')).toBe('Thanh toán khi nhận hàng (COD)')
    expect(getPaymentMethodShortLabel('momo')).toBe('Ví MoMo')
    expect(getPaymentMethodShortLabel('cod')).toBe('COD')

    expect(getPaymentStatusBadge('pending').label).toBe('Chờ thanh toán')
    expect(getPaymentStatusBadge('paid').label).toBe('Đã thanh toán')
    expect(getPaymentStatusBadge('failed').label).toBe('Thanh toán thất bại')
    expect(getPaymentStatusBadge('refunded').label).toBe('Đã hoàn tiền')
    expect(getPaymentStatusBadge(undefined).label).toBe('Chờ thanh toán')
  })

  it('evaluates MoMo retry eligibility and formats countdowns', () => {
    const baseTime = Date.UTC(2026, 10, 16, 10, 0, 0)
    const pendingMomo: Order = {
      id: 'ord-1',
      userId: 'user-1',
      status: 'pending_confirmation',
      paymentMethod: 'momo',
      paymentStatus: 'pending',
      recipientName: 'Nguyen Van A',
      phone: '0987654321',
      provinceName: 'Hà Nội',
      wardName: 'Phúc Xá',
      detailAddress: '123 Cầu Giấy',
      subtotalVnd: '100000',
      shippingFeeVnd: '0',
      totalVnd: '100000',
      items: [],
      createdAt: new Date(baseTime).toISOString(),
      updatedAt: new Date(baseTime).toISOString(),
    }

    expect(getMomoPaymentDeadlineMs(pendingMomo)).toBe(baseTime + 15 * 60 * 1000)
    expect(canRetryMomoPayment(pendingMomo, baseTime + 5 * 60 * 1000)).toBe(true)
    expect(canRetryMomoPayment({ ...pendingMomo, paymentStatus: 'failed' }, baseTime + 5 * 60 * 1000)).toBe(true)
    expect(canRetryMomoPayment(pendingMomo, baseTime + 15 * 60 * 1000)).toBe(false)
    expect(canRetryMomoPayment({ ...pendingMomo, paymentStatus: 'paid', status: 'confirmed' }, baseTime)).toBe(false)
    expect(canRetryMomoPayment({ ...pendingMomo, paymentMethod: 'cod' }, baseTime)).toBe(false)

    expect(formatCountdown(905_000)).toBe('15:05')
    expect(formatCountdown(65_000)).toBe('01:05')
    expect(formatCountdown(0)).toBe('00:00')
    expect(formatCountdown(3_665_000)).toBe('01:01:05')
  })
})
