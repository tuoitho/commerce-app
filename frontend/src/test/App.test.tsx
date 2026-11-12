import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppContent } from '@/App'
import { ToastProvider } from '@/context/ToastContext'
import { AuthProvider } from '@/context/AuthContext'
import { FavoritesProvider } from '@/context/FavoritesContext'
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

vi.mock('@/api/favorites', () => ({
  favoritesApi: {
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue([]),
    remove: vi.fn().mockResolvedValue([]),
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

vi.mock('@/api/posts', () => ({
  postsApi: {
    listPosts: vi.fn().mockResolvedValue({
      data: [],
      meta: {
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        timestamp: '2026-10-21T00:00:00Z',
      },
      message: 'OK',
    }),
    getPostById: vi.fn().mockResolvedValue({
      id: 'post-test-1',
      authorId: 'admin-1',
      authorName: 'Quản trị viên',
      authorRole: 'admin',
      content: 'Bài viết chi tiết cho route test',
      media: [],
      referredProducts: [],
      reactions: {
        totalCount: 0,
        counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
        viewerReaction: null,
      },
      commentCount: 0,
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
      comments: [],
    }),
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
          <FavoritesProvider>
            <CartProvider>
              <MemoryRouter initialEntries={['/']}>
                <AppContent />
              </MemoryRouter>
            </CartProvider>
          </FavoritesProvider>
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
          <FavoritesProvider>
            <CartProvider>
              <MemoryRouter initialEntries={['/']}>
                <AppContent />
              </MemoryRouter>
            </CartProvider>
          </FavoritesProvider>
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
          <FavoritesProvider>
            <CartProvider>
              <MemoryRouter initialEntries={['/unknown-route']}>
                <AppContent />
              </MemoryRouter>
            </CartProvider>
          </FavoritesProvider>
        </AuthProvider>
      </ToastProvider>
    )

    expect(screen.getByText('Trang không tồn tại')).toBeInTheDocument()
  })

  it('renders favorites page at /favorites for authenticated user', async () => {
    const { authApi } = await import('@/api/auth')
    const { tokenStore } = await import('@/api/tokenStore')
    tokenStore.setToken('token-123')
    vi.mocked(authApi.getMe).mockResolvedValueOnce({
      id: 'user-1',
      email: 'test@example.com',
    })

    render(
      <ToastProvider>
        <AuthProvider>
          <FavoritesProvider>
            <CartProvider>
              <MemoryRouter initialEntries={['/favorites']}>
                <AppContent />
              </MemoryRouter>
            </CartProvider>
          </FavoritesProvider>
        </AuthProvider>
      </ToastProvider>
    )

    const { waitFor } = await import('@testing-library/react')
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /sản phẩm yêu thích/i, level: 1 })
      ).toBeInTheDocument()
    })

    tokenStore.clearToken()
  })

  it('renders posts feed page at /posts', async () => {
    render(
      <ToastProvider>
        <AuthProvider>
          <FavoritesProvider>
            <CartProvider>
              <MemoryRouter initialEntries={['/posts']}>
                <AppContent />
              </MemoryRouter>
            </CartProvider>
          </FavoritesProvider>
        </AuthProvider>
      </ToastProvider>
    )

    const { waitFor } = await import('@testing-library/react')
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /bảng tin & đánh giá flagship/i, level: 1 })
      ).toBeInTheDocument()
    })
  })

  it('renders post detail page at /posts/:id', async () => {
    render(
      <ToastProvider>
        <AuthProvider>
          <FavoritesProvider>
            <CartProvider>
              <MemoryRouter initialEntries={['/posts/post-test-1']}>
                <AppContent />
              </MemoryRouter>
            </CartProvider>
          </FavoritesProvider>
        </AuthProvider>
      </ToastProvider>
    )

    const { waitFor } = await import('@testing-library/react')
    await waitFor(() => {
      expect(screen.getByText('Bài viết chi tiết cho route test')).toBeInTheDocument()
    })
  })
})


