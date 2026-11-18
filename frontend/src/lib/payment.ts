import { ordersApi } from '@/api/orders'
import type { Order, PaymentMethod, PaymentStatus } from '@/api/types'

export const MOMO_MIN_AMOUNT_VND = 1_000n
export const MOMO_MAX_AMOUNT_VND = 50_000_000n
export const MOMO_PAYMENT_TIMEOUT_MS = 15 * 60 * 1000

export interface PaymentStatusBadgeInfo {
  status: PaymentStatus
  label: string
  className: string
}

const PAYMENT_STATUS_MAP: Record<PaymentStatus, PaymentStatusBadgeInfo> = {
  pending: {
    status: 'pending',
    label: 'Chờ thanh toán',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  paid: {
    status: 'paid',
    label: 'Đã thanh toán',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  failed: {
    status: 'failed',
    label: 'Thanh toán thất bại',
    className: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  refunded: {
    status: 'refunded',
    label: 'Đã hoàn tiền',
    className: 'bg-sky-50 text-sky-800 border-sky-200',
  },
}

export function normalizePaymentMethod(method?: string | null): PaymentMethod {
  return method?.toLowerCase() === 'momo' ? 'momo' : 'cod'
}

export function getPaymentMethodLabel(method?: string | null): string {
  return normalizePaymentMethod(method) === 'momo'
    ? 'Ví điện tử MoMo'
    : 'Thanh toán khi nhận hàng (COD)'
}

export function getPaymentMethodShortLabel(method?: string | null): string {
  return normalizePaymentMethod(method) === 'momo' ? 'Ví MoMo' : 'COD'
}

export function normalizePaymentStatus(status?: string | null): PaymentStatus {
  switch (status) {
    case 'paid':
    case 'failed':
    case 'refunded':
      return status
    default:
      return 'pending'
  }
}

export function getPaymentStatusBadge(status?: string | null): PaymentStatusBadgeInfo {
  return PAYMENT_STATUS_MAP[normalizePaymentStatus(status)]
}

export function parseVndBigInt(amount: string | number | bigint | null | undefined): bigint {
  if (typeof amount === 'bigint') return amount
  if (typeof amount === 'number') {
    return Number.isFinite(amount) ? BigInt(Math.trunc(amount)) : 0n
  }
  const trimmed = String(amount ?? '').trim()
  if (!/^-?\d+$/.test(trimmed)) return 0n
  return BigInt(trimmed)
}

export function isMomoAmountEligible(totalVnd: string | number | bigint | null | undefined): boolean {
  const value = parseVndBigInt(totalVnd)
  return value >= MOMO_MIN_AMOUNT_VND && value <= MOMO_MAX_AMOUNT_VND
}

export function getMomoIneligibleReason(totalVnd: string | number | bigint | null | undefined): string | null {
  const value = parseVndBigInt(totalVnd)
  if (value < MOMO_MIN_AMOUNT_VND || value > MOMO_MAX_AMOUNT_VND) {
    return 'Ví MoMo chỉ hỗ trợ đơn hàng từ 1.000 ₫ đến 50.000.000 ₫.'
  }
  return null
}

export function getMomoPaymentDeadlineMs(order: Pick<Order, 'createdAt' | 'cancellableUntil'>): number {
  if (order.cancellableUntil) {
    const parsedUntil = Date.parse(order.cancellableUntil)
    if (Number.isFinite(parsedUntil)) return parsedUntil
  }
  const createdMs = Date.parse(order.createdAt)
  if (!Number.isFinite(createdMs)) return 0
  return createdMs + MOMO_PAYMENT_TIMEOUT_MS
}

export function canRetryMomoPayment(order: Order, nowMs: number = Date.now()): boolean {
  if (normalizePaymentMethod(order.paymentMethod) !== 'momo') return false
  if (order.status !== 'pending_confirmation') return false
  const payStatus = normalizePaymentStatus(order.paymentStatus)
  if (payStatus !== 'pending' && payStatus !== 'failed') return false
  return getMomoPaymentDeadlineMs(order) > nowMs
}

export function formatCountdown(remainingMs: number): string {
  const safeSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export async function retryMomoAndRedirect(
  orderId: string
): Promise<{ redirected: boolean; order: Order }> {
  const retried = await ordersApi.retryMomoPayment(orderId)
  if (retried.payUrl) {
    window.location.assign(retried.payUrl)
    return { redirected: true, order: retried }
  }
  return { redirected: false, order: retried }
}
