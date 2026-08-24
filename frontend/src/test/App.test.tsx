import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppContent } from '@/App'
import { ToastProvider } from '@/context/ToastContext'
import { AuthProvider } from '@/context/AuthContext'
import { CartProvider } from '@/context/CartContext'

// Mock API modules
vi.mock('@/api/auth', () => ({
  authApi: {
    refresh: vi.fn().mockRejectedValue(new Error('no session')),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
}))

vi.mock('@/api/catalog', () => ({
  catalogApi: {
    listCategories: vi.fn().mockResolvedValue([{ id: 'cat-1', name: 'Apple' }]),
    listFeaturedProducts: vi.fn().mockResolvedValue([
      {
        id: 'prod-1',
        name: 'iPhone 15 Pro',
        model: 'A3102',
        brand: 'Apple',
        category: { id: 'cat-1', name: 'Điện thoại' },
        minPriceVnd: '25990000',
        maxPriceVnd: '25990000',
        price: '25990000',
        currency: 'VND',
        primaryImageUrl: '',
        inStock: true,
      },
    ]),
    listProducts: vi.fn().mockResolvedValue([]),
    getProduct: vi.fn().mockResolvedValue(null),
  },
}))

vi.mock('@/api/cart', () => ({
  cartApi: {
    getCart: vi.fn().mockResolvedValue({ items: [], totalUnits: 0, selectedLineCount: 0, selectedTotalVnd: '0', shippingFeeVnd: '0' }),
    addItem: vi.fn(),
    setQuantity: vi.fn(),
    setSelection: vi.fn(),
    setAllSelection: vi.fn(),
    removeItem: vi.fn(),
  },
}))

vi.mock('@/api/favorites', () => ({
  favoritesApi: {
    listFavorites: vi.fn().mockResolvedValue({
      success: true,
      message: '',
      data: [],
      error: null,
      meta: {
        timestamp: '2026-08-24T00:00:00Z',
        pagination: { page: 1, limit: 12, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      },
    }),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
  },
}))

describe('App navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Header with brand name and links', async () => {
    render(
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <MemoryRouter initialEntries={['/']}>
              <AppContent />
            </MemoryRouter>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    )

    expect(screen.getAllByText('AuraPhone').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Trang chủ').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Sản phẩm').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Giỏ hàng').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Danh mục')).toBeInTheDocument()
  })

  it('opens category dropdown and displays dynamic categories', async () => {
    const { fireEvent, waitFor } = await import('@testing-library/react')
    render(
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <MemoryRouter initialEntries={['/']}>
              <AppContent />
            </MemoryRouter>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    )

    const categoryButton = screen.getByRole('button', { name: /danh mục/i })
    fireEvent.click(categoryButton)

    await waitFor(() => {
      expect(screen.getByText('Chọn theo danh mục')).toBeInTheDocument()
      expect(screen.getAllByText('Apple').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders 404 page for unknown routes', async () => {
    render(
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <MemoryRouter initialEntries={['/unknown-route']}>
              <AppContent />
            </MemoryRouter>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    )

    expect(screen.getByText('Trang không tồn tại')).toBeInTheDocument()
  })

  it('renders FavoritesPage when navigating to /favorites', async () => {
    const { waitFor } = await import('@testing-library/react')
    render(
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <MemoryRouter initialEntries={['/favorites']}>
              <AppContent />
            </MemoryRouter>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    )

    await waitFor(() => {
      // Unauthenticated redirects to login page in App
      expect(screen.getByText('Đăng Nhập')).toBeInTheDocument()
    })
  })
})
