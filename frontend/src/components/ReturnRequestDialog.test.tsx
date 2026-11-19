import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReturnRequestDialog } from './ReturnRequestDialog'
import { ToastProvider } from '@/context/ToastContext'
import type { Order } from '@/api/types'

vi.mock('@/api/returns', () => ({
  createReturn: vi.fn(),
}))

const baseOrder: Order = {
  id: 'ord-ret-1',
  userId: 'user-1',
  status: 'delivered',
  paymentMethod: 'cod',
  recipientName: 'Nguyễn Văn A',
  phone: '0912345678',
  provinceName: 'Thành phố Hà Nội',
  wardName: 'Phường Phúc Xá',
  detailAddress: '123 Cầu Giấy',
  subtotalVnd: '50000000',
  shippingFeeVnd: '30000',
  discountVnd: '0',
  totalVnd: '50030000',
  items: [
    {
      id: 'item-1',
      variantId: 'v-1',
      productId: 'p-1',
      brandName: 'Apple',
      productName: 'iPhone 16 Pro',
      model: 'A3294',
      imageUrl: '',
      options: [],
      unitPriceVnd: '30000000',
      quantity: 1,
      lineTotalVnd: '30000000',
    },
    {
      id: 'item-2',
      variantId: 'v-2',
      productId: 'p-2',
      brandName: 'Samsung',
      productName: 'Galaxy S25',
      model: 'SM-S931B',
      imageUrl: '',
      options: [],
      unitPriceVnd: '20000000',
      quantity: 1,
      lineTotalVnd: '20000000',
    },
  ],
  createdAt: '2026-11-18T10:00:00Z',
  updatedAt: '2026-11-18T10:00:00Z',
}

function renderDialog(order: Order) {
  return render(
    <ToastProvider>
      <ReturnRequestDialog
        order={order}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    </ToastProvider>
  )
}

describe('ReturnRequestDialog PD-2 refund calculation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns exact totalVnd on full return when order has a merchandise voucher', () => {
    renderDialog({
      ...baseOrder,
      voucherCode: 'AURA10',
      voucherType: 'percent',
      discountVnd: '5000000',
      totalVnd: '45030000',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Chọn tất cả' }))

    expect(screen.getByTestId('expected-refund-amount')).toHaveTextContent('45.030.000 ₫')
  })

  it('prorates partial return refund by (subtotalVnd - discountVnd) / subtotalVnd for percent voucher', () => {
    renderDialog({
      ...baseOrder,
      voucherCode: 'AURA10',
      voucherType: 'percent',
      discountVnd: '5000000',
      totalVnd: '45030000',
    })

    fireEvent.click(screen.getByText('iPhone 16 Pro'))

    // 30_000_000 * (50_000_000 - 5_000_000) / 50_000_000 = 27_000_000
    expect(screen.getByTestId('expected-refund-amount')).toHaveTextContent('27.000.000 ₫')
  })

  it('floors partial return refund and caps at totalVnd for fixed_amount voucher', () => {
    renderDialog({
      ...baseOrder,
      subtotalVnd: '10000001',
      shippingFeeVnd: '0',
      voucherCode: 'FIXED1M',
      voucherType: 'fixed_amount',
      discountVnd: '1000000',
      totalVnd: '9000001',
      items: [
        {
          ...baseOrder.items[0],
          lineTotalVnd: '3000000',
          unitPriceVnd: '3000000',
        },
        {
          ...baseOrder.items[1],
          lineTotalVnd: '7000001',
          unitPriceVnd: '7000001',
        },
      ],
    })

    fireEvent.click(screen.getByText('iPhone 16 Pro'))

    // floor(3_000_000 * 9_000_001 / 10_000_001) = 2_700_000
    expect(screen.getByTestId('expected-refund-amount')).toHaveTextContent('2.700.000 ₫')
  })

  it('uses min(itemsTotal, totalVnd) for partial return with freeship voucher', () => {
    renderDialog({
      ...baseOrder,
      shippingFeeVnd: '60000',
      voucherCode: 'FREESHIP60',
      voucherType: 'freeship',
      discountVnd: '60000',
      totalVnd: '50000000',
    })

    fireEvent.click(screen.getByText('iPhone 16 Pro'))

    // freeship discount does not reduce item refund
    expect(screen.getByTestId('expected-refund-amount')).toHaveTextContent('30.000.000 ₫')
  })

  it('guards zero subtotalVnd and full 100% discount returning 0 ₫ without NaN', () => {
    const { unmount } = renderDialog({
      ...baseOrder,
      subtotalVnd: '0',
      shippingFeeVnd: '0',
      discountVnd: '100000',
      voucherType: 'fixed_amount',
      totalVnd: '0',
    })

    fireEvent.click(screen.getByText('iPhone 16 Pro'))
    expect(screen.getByTestId('expected-refund-amount')).toHaveTextContent('0 ₫')
    unmount()

    renderDialog({
      ...baseOrder,
      shippingFeeVnd: '0',
      discountVnd: '50000000',
      voucherType: 'percent',
      totalVnd: '0',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Chọn tất cả' }))
    expect(screen.getByTestId('expected-refund-amount')).toHaveTextContent('0 ₫')
  })
})
