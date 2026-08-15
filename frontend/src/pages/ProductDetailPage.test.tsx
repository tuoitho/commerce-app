import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ProductDetailPage } from './ProductDetailPage'
import { catalogApi } from '@/api/catalog'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { ToastProvider } from '@/context/ToastContext'

vi.mock('@/api/catalog', () => ({
  catalogApi: {
    getProduct: vi.fn(),
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/CartContext', () => ({
  useCart: vi.fn(),
}))

describe('ProductDetailPage', () => {
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
    vi.mocked(useCart).mockReturnValue({
      cart: null,
      isLoading: false,
      badgeCount: 0,
      refreshCart: vi.fn(),
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })
  })

  it('renders product details and option groups properly', async () => {
    vi.mocked(catalogApi.getProduct).mockResolvedValue({
      id: 'p-1',
      name: 'iPhone 15 Pro',
      model: 'A3102',
      description: 'Flagship phone from Apple.',
      brand: { id: 'cat-apple', name: 'Apple' },
      category: { id: 'cat-phone', name: 'Điện thoại' },
      minPriceVnd: '25990000',
      maxPriceVnd: '32990000',
      price: '25990000',
      currency: 'VND',
      imageUrls: [],
      stockQuantity: 10,
      inStock: true,
      featured: true,
      optionGroups: [
        {
          id: 'opt-color',
          label: 'Màu sắc',
          position: 1,
          values: [{ id: 'val-blue', label: 'Titan Xanh' }],
        },
      ],
      variants: [
        {
          id: 'var-1',
          optionValueIds: { 'opt-color': 'val-blue' },
          priceVnd: '25990000',
          stockQuantity: 5,
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/products/p-1']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getAllByText('iPhone 15 Pro').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Màu sắc:')).toBeInTheDocument()
      expect(screen.getByText('Titan Xanh')).toBeInTheDocument()
    })
  })
})
