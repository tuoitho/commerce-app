import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CartPage } from './CartPage'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { ToastProvider } from '@/context/ToastContext'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/CartContext', () => ({
  useCart: vi.fn(),
}))

describe('CartPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
  })

  it('labels lines sold at the live price', async () => {
    vi.mocked(useCart).mockReturnValue({
      cart: {
        items: [
          {
            id: 'item-live', variantId: 'v-1', productId: 'p-1', brandName: 'Apple', productName: 'iPhone 15 Pro', model: 'A3102',
            imageUrl: '', options: [], unitPriceVnd: '23990000', lineTotalVnd: '23990000', stockQuantity: 5, quantity: 1,
            selected: true, availability: 'available', isLivePrice: true,
          },
          {
            id: 'item-regular', variantId: 'v-2', productId: 'p-2', brandName: 'Samsung', productName: 'Galaxy S25', model: 'S931',
            imageUrl: '', options: [], unitPriceVnd: '20990000', lineTotalVnd: '20990000', stockQuantity: 5, quantity: 1,
            selected: true, availability: 'available', isLivePrice: false,
          },
        ],
        totalUnits: 2,
        selectedLineCount: 2,
        selectedTotalVnd: '44980000',
        shippingFeeVnd: '0',
      },
      isLoading: false,
      badgeCount: 2,
      refreshCart: vi.fn(),
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })
    render(
      <ToastProvider>
        <MemoryRouter>
          <CartPage />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(await screen.findAllByText('Giá live')).toHaveLength(1)
  })

  it('renders cart items and summary properly', async () => {
    vi.mocked(useCart).mockReturnValue({
      cart: {
        items: [
          {
            id: 'item-1',
            variantId: 'v-1',
            productId: 'p-1',
            brandName: 'Apple',
            productName: 'iPhone 15 Pro',
            model: 'A3102',
            imageUrl: '',
            options: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' }],
            unitPriceVnd: '25990000',
            lineTotalVnd: '25990000',
            stockQuantity: 5,
            quantity: 1,
            selected: true,
            availability: 'available',
          },
        ],
        totalUnits: 1,
        selectedLineCount: 1,
        selectedTotalVnd: '25990000',
        shippingFeeVnd: '0',
      },
      isLoading: false,
      badgeCount: 1,
      refreshCart: vi.fn(),
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/cart']}>
          <CartPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument()
      expect(screen.getByText('Titan Tự Nhiên')).toBeInTheDocument()
      expect(screen.getByText('Tóm tắt đơn hàng')).toBeInTheDocument()
      expect(screen.getByText('Tiến hành mua hàng')).toBeInTheDocument()
      expect(screen.getByText('Miễn phí')).toBeInTheDocument()
    })
  })

  it('renders non-zero shipping fee properly', async () => {
    vi.mocked(useCart).mockReturnValue({
      cart: {
        items: [
          {
            id: 'item-1',
            variantId: 'v-1',
            productId: 'p-1',
            brandName: 'Apple',
            productName: 'iPhone 15 Pro',
            model: 'A3102',
            imageUrl: '',
            options: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' }],
            unitPriceVnd: '25990000',
            lineTotalVnd: '25990000',
            stockQuantity: 5,
            quantity: 1,
            selected: true,
            availability: 'available',
          },
        ],
        totalUnits: 1,
        selectedLineCount: 1,
        selectedTotalVnd: '25990000',
        shippingFeeVnd: '30000',
      },
      isLoading: false,
      badgeCount: 1,
      refreshCart: vi.fn(),
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/cart']}>
          <CartPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('30.000 ₫')).toBeInTheDocument()
    })
  })

  it('renders empty cart message when items is empty', async () => {
    vi.mocked(useCart).mockReturnValue({
      cart: {
        items: [],
        totalUnits: 0,
        selectedLineCount: 0,
        selectedTotalVnd: '0',
        shippingFeeVnd: '0',
      },
      isLoading: false,
      badgeCount: 0,
      refreshCart: vi.fn(),
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/cart']}>
          <CartPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Giỏ hàng đang trống')).toBeInTheDocument()
    })
  })
})
