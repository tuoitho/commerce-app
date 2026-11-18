import type { PaymentStatus } from '@/api/types'

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

export function getPaymentMethodShortLabel(method?: string | null): string {
  const normalized = (method || '').toLowerCase()
  if (normalized === 'momo') return 'MoMo'
  if (normalized === 'cod') return 'COD'
  if (normalized === 'bank_transfer') return 'Chuyển khoản'
  return method || 'COD'
}

export function getPaymentMethodFullLabel(method?: string | null): string {
  const normalized = (method || '').toLowerCase()
  if (normalized === 'momo') return 'Ví điện tử MoMo'
  if (normalized === 'cod') return 'Thanh toán khi nhận hàng (COD)'
  if (normalized === 'bank_transfer') return 'Chuyển khoản ngân hàng'
  return method || 'Thanh toán khi nhận hàng (COD)'
}
