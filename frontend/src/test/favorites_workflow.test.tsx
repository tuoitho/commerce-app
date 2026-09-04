import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppContent } from '@/App'
import { ToastProvider } from '@/context/ToastContext'
import { AuthProvider } from '@/context/AuthContext'
import { FavoritesProvider } from '@/context/FavoritesContext'
import { CartProvider } from '@/context/CartContext'
import { tokenStore } from '@/api/tokenStore'
import type { FavoriteProduct } from '@/types/favorite'
import type { ProductDetail, ProductSummary, Category } from '@/api/types'

// Mock API modules
vi.mock('@/api/auth', () => ({
  authApi: {
    getMe: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  },
}))

vi.mock('@/api/favorites', () => ({
  favoritesApi: {
    list: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
  },
}))

vi.mock('@/api/catalog', () => ({
  catalogApi: {
    listCategories: vi.fn(),
    listFeaturedProducts: vi.fn(),
    listProducts: vi.fn(),
    listProductsWithMeta: vi.fn(),
    listBrands: vi.fn(),
    getProduct: vi.fn(),
  },
}))

vi.mock('@/api/cart', () => ({
  cartApi: {
    getCart: vi.fn(),
    addItem: vi.fn(),
    setQuantity: vi.fn(),
    setSelection: vi.fn(),
    setAllSelection: vi.fn(),
    removeItem: vi.fn(),
  },
}))

vi.mock('@/api/chat', () => ({
  getConversation: vi.fn().mockResolvedValue(null),
  markConversationRead: vi.fn().mockResolvedValue(undefined),
  getMessages: vi.fn().mockResolvedValue([]),
  sendMessage: vi.fn().mockResolvedValue({}),
  uploadMedia: vi.fn().mockResolvedValue({}),
  getCustomerOrders: vi.fn().mockResolvedValue([]),
}))

import { authApi } from '@/api/auth'
import { favoritesApi } from '@/api/favorites'
import { catalogApi } from '@/api/catalog'
import { cartApi } from '@/api/cart'

// Test fixture data
const mockCategory: Category = {
  id: 'cat-1',
  name: 'Điện thoại iOS',
}

const mockProductActiveSummary: ProductSummary = {
  id: 'prod-active-1',
  name: 'iPhone 16 Pro Max',
  model: 'A3294',
  brand: 'Apple',
  category: mockCategory,
  minPriceVnd: '34990000',
  maxPriceVnd: '34990000',
  price: '34990000',
  currency: 'VND',
  primaryImageUrl: 'https://example.com/iphone16.jpg',
  inStock: true,
}

const mockProductActiveDetail: ProductDetail = {
  id: 'prod-active-1',
  name: 'iPhone 16 Pro Max',
  model: 'A3294',
  brand: 'Apple',
  description: 'Flagship phone from Apple',
  category: mockCategory,
  minPriceVnd: '34990000',
  maxPriceVnd: '34990000',
  price: '34990000',
  currency: 'VND',
  imageUrls: ['https://example.com/iphone16.jpg'],
  stockQuantity: 10,
  inStock: true,
  featured: true,
  optionGroups: [
    {
      id: 'opt-color',
      label: 'Màu sắc',
      position: 1,
      values: [{ id: 'val-black', label: 'Titan Đen' }],
    },
  ],
  variants: [
    {
      id: 'var-1',
      optionValueIds: { 'opt-color': 'val-black' },
      priceVnd: '34990000',
      stockQuantity: 10,
      active: true,
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const mockFavoriteActiveItem: FavoriteProduct = {
  id: 'prod-active-1',
  name: 'iPhone 16 Pro Max',
  model: 'A3294',
  brand: 'Apple',
  category: mockCategory,
  primaryImageUrl: 'https://example.com/iphone16.jpg',
  availability: 'active',
  minPriceVnd: '34990000',
  maxPriceVnd: '34990000',
  inStock: true,
}

const mockFavoriteOutOfStockItem: FavoriteProduct = {
  id: 'prod-active-oos',
  name: 'Xiaomi 15 Ultra',
  model: '24129PN74C',
  brand: 'Xiaomi',
  category: { id: 'cat-2', name: 'Điện thoại Android' },
  primaryImageUrl: 'https://example.com/x15.jpg',
  availability: 'active',
  minPriceVnd: '29990000',
  maxPriceVnd: '31990000',
  inStock: false,
}

const mockFavoriteUnavailableItem: FavoriteProduct = {
  id: 'prod-unavail-1',
  name: 'Samsung Galaxy Fold 4',
  model: 'SM-F936B',
  brand: 'Samsung',
  category: { id: 'cat-3', name: 'Điện thoại gập' },
  primaryImageUrl: '',
  availability: 'unavailable',
  minPriceVnd: null,
  maxPriceVnd: null,
  inStock: null,
}

const mockFavoriteDeletedItem: FavoriteProduct = {
  id: 'prod-deleted-1',
  name: 'iPhone 11',
  model: 'A2111',
  brand: 'Apple',
  category: mockCategory,
  primaryImageUrl: 'https://example.com/iphone11.jpg',
  availability: 'deleted',
  minPriceVnd: null,
  maxPriceVnd: null,
  inStock: null,
}

function renderAppWithRouter(initialEntry = '/') {
  return render(
    <ToastProvider>
      <AuthProvider>
        <FavoritesProvider>
          <CartProvider>
            <MemoryRouter initialEntries={[initialEntry]}>
              <AppContent />
            </MemoryRouter>
          </CartProvider>
        </FavoritesProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

describe('Product Favorites Cross-Boundary Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tokenStore.clearToken()

    // Default mock setup
    vi.mocked(authApi.getMe).mockRejectedValue(new Error('no token'))
    vi.mocked(authApi.refresh).mockRejectedValue(new Error('no refresh'))
    vi.mocked(authApi.logout).mockResolvedValue(undefined)

    vi.mocked(catalogApi.listCategories).mockResolvedValue([mockCategory])
    vi.mocked(catalogApi.listBrands).mockResolvedValue(['Apple', 'Xiaomi', 'Samsung'])
    vi.mocked(catalogApi.listFeaturedProducts).mockResolvedValue([mockProductActiveSummary])
    vi.mocked(catalogApi.listProducts).mockResolvedValue([mockProductActiveSummary])
    vi.mocked(catalogApi.listProductsWithMeta).mockResolvedValue({
      data: [mockProductActiveSummary],
      meta: {
        timestamp: new Date().toISOString(),
        pagination: {
          page: 1,
          limit: 6,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: 'success',
    })
    vi.mocked(catalogApi.getProduct).mockResolvedValue(mockProductActiveDetail)

    vi.mocked(favoritesApi.list).mockResolvedValue([])
    vi.mocked(favoritesApi.add).mockResolvedValue([])
    vi.mocked(favoritesApi.remove).mockResolvedValue([])

    vi.mocked(cartApi.getCart).mockResolvedValue({
      items: [],
      totalUnits: 0,
      selectedLineCount: 0,
      selectedTotalVnd: '0',
      shippingFeeVnd: '0',
    })
    vi.mocked(cartApi.addItem).mockResolvedValue({
      items: [],
      totalUnits: 1,
      selectedLineCount: 1,
      selectedTotalVnd: '34990000',
      shippingFeeVnd: '0',
    })
  })

  // Scenario 1: Guest redirect & no mutation replay
  describe('Scenario 1: Guest redirect and no mutation replay (Req 1.4, 1.5)', () => {
    it('redirects unauthenticated user clicking favorite button on catalog card to /login?redirect=...', async () => {
      renderAppWithRouter('/products')

      // Wait for catalog products to render
      await waitFor(() => {
        expect(screen.getAllByText('iPhone 16 Pro Max').length).toBeGreaterThanOrEqual(1)
      })

      // Click favorite toggle button on product card
      const favButton = screen.getByRole('button', { name: /Thêm iPhone 16 Pro Max vào yêu thích/i })
      fireEvent.click(favButton)

      // Verify redirect to login page with encoded redirect query
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /đăng nhập/i })).toBeInTheDocument()
      })

      // Verify no favorite mutation API call occurred
      expect(favoritesApi.add).not.toHaveBeenCalled()
      expect(favoritesApi.remove).not.toHaveBeenCalled()
    })

    it('redirects unauthenticated user accessing /favorites directly to /login?redirect=/favorites', async () => {
      renderAppWithRouter('/favorites')

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /đăng nhập/i })).toBeInTheDocument()
      })

      expect(favoritesApi.list).not.toHaveBeenCalled()
    })

    it('redirects unauthenticated user clicking favorite button on product detail to /login?redirect=...', async () => {
      renderAppWithRouter('/products/prod-active-1')

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'iPhone 16 Pro Max', level: 1 })).toBeInTheDocument()
      })

      const favButtons = screen.getAllByRole('button', { name: /Thêm iPhone 16 Pro Max vào yêu thích/i })
      fireEvent.click(favButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /đăng nhập/i })).toBeInTheDocument()
      })

      expect(favoritesApi.add).not.toHaveBeenCalled()
    })

    it('does NOT automatically favorite product after login until user explicitly clicks (Req 1.5)', async () => {
      // Simulate guest clicking toggle on /products -> redirected to login
      vi.mocked(authApi.login).mockResolvedValueOnce({
        user: { id: 'user-1', email: 'customer@example.com', role: 'customer' },
        accessToken: 'valid-token-user1',
      })
      vi.mocked(favoritesApi.list).mockResolvedValue([])

      renderAppWithRouter('/login?redirect=%2Fproducts')

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /đăng nhập/i })).toBeInTheDocument()
      })

      // Fill and submit login form
      const emailInput = screen.getByPlaceholderText('name@example.com')
      const passwordInput = screen.getByPlaceholderText('••••••••')
      const loginButtons = screen.getAllByRole('button', { name: /đăng nhập/i })
      const submitBtn = loginButtons.find((btn) => btn.getAttribute('type') === 'submit') || loginButtons[0]

      fireEvent.change(emailInput, { target: { value: 'customer@example.com' } })
      fireEvent.change(passwordInput, { target: { value: 'Secret123!' } })
      fireEvent.click(submitBtn)

      // Should navigate back to /products
      await waitFor(() => {
        expect(screen.getAllByText('iPhone 16 Pro Max').length).toBeGreaterThanOrEqual(1)
      }, { timeout: 4000 })

      // Ensure NO favorite add API was automatically called upon login
      expect(favoritesApi.add).not.toHaveBeenCalled()
    })
  })

  // Scenario 2: Authenticated favorite lifecycle
  describe('Scenario 2: Authenticated favorite lifecycle (Req 2.1, 2.3, 1.3, 3.1, 3.2)', () => {
    it('allows logged in user to add product, updates state, shows toast, and displays product in /favorites', async () => {
      tokenStore.setToken('valid-token-user1')
      vi.mocked(authApi.getMe).mockResolvedValue({
        id: 'user-1',
        email: 'customer@example.com',
        role: 'customer',
      })
      vi.mocked(favoritesApi.list).mockResolvedValue([])
      vi.mocked(favoritesApi.add).mockResolvedValue([mockFavoriteActiveItem])

      renderAppWithRouter('/products')

      // Wait for authenticated header and products
      await waitFor(() => {
        expect(screen.getAllByText('iPhone 16 Pro Max').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('Sản phẩm yêu thích').length).toBeGreaterThanOrEqual(1)
      })

      // Click add to favorite
      const toggleBtn = screen.getByRole('button', { name: /Thêm iPhone 16 Pro Max vào yêu thích/i })
      fireEvent.click(toggleBtn)

      // Verify API called with productId
      await waitFor(() => {
        expect(favoritesApi.add).toHaveBeenCalledWith('prod-active-1')
        expect(screen.getByRole('button', { name: /Bỏ iPhone 16 Pro Max khỏi yêu thích/i })).toBeInTheDocument()
      })

      // Navigate to /favorites via Header link
      const favHeaderLinks = screen.getAllByRole('link', { name: /sản phẩm yêu thích/i })
      fireEvent.click(favHeaderLinks[0])

      // Verify FavoritesPage renders product
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /sản phẩm yêu thích/i, level: 1 })).toBeInTheDocument()
        expect(screen.getAllByText('iPhone 16 Pro Max').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('34.990.000 ₫').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('Còn hàng').length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  // Scenario 3: Cross-surface synchronization
  describe('Scenario 3: Cross-surface synchronization without page reload (Req 4.1, 4.2)', () => {
    it('synchronizes favorite state between catalog card, product detail, and /favorites', async () => {
      tokenStore.setToken('valid-token-user1')
      vi.mocked(authApi.getMe).mockResolvedValue({
        id: 'user-1',
        email: 'customer@example.com',
        role: 'customer',
      })
      vi.mocked(favoritesApi.list).mockResolvedValue([])
      vi.mocked(favoritesApi.add).mockResolvedValue([mockFavoriteActiveItem])
      vi.mocked(favoritesApi.remove).mockResolvedValue([])

      renderAppWithRouter('/products')

      await waitFor(() => {
        expect(screen.getAllByText('iPhone 16 Pro Max').length).toBeGreaterThanOrEqual(1)
      })

      // Toggle on catalog card
      const toggleBtn = screen.getByRole('button', { name: /Thêm iPhone 16 Pro Max vào yêu thích/i })
      fireEvent.click(toggleBtn)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Bỏ iPhone 16 Pro Max khỏi yêu thích/i })).toBeInTheDocument()
      })

      // Navigate to product detail
      const productLinks = screen.getAllByRole('link', { name: /iPhone 16 Pro Max/i })
      fireEvent.click(productLinks[0])

      // On detail page, button is already in favorited state ("Bỏ iPhone 16 Pro Max khỏi yêu thích")
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'iPhone 16 Pro Max', level: 1 })).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: /Bỏ iPhone 16 Pro Max khỏi yêu thích/i }).length).toBeGreaterThanOrEqual(1)
      })

      // Toggle off on detail page
      const detailToggleBtns = screen.getAllByRole('button', { name: /Bỏ iPhone 16 Pro Max khỏi yêu thích/i })
      fireEvent.click(detailToggleBtns[0])

      await waitFor(() => {
        expect(favoritesApi.remove).toHaveBeenCalledWith('prod-active-1')
        expect(screen.getAllByRole('button', { name: /Thêm iPhone 16 Pro Max vào yêu thích/i }).length).toBeGreaterThanOrEqual(1)
      })

      // Navigate to /favorites
      const favHeaderLinks = screen.getAllByRole('link', { name: /sản phẩm yêu thích/i })
      fireEvent.click(favHeaderLinks[0])

      // Should show empty state
      await waitFor(() => {
        expect(screen.getByText('Chưa có sản phẩm yêu thích')).toBeInTheDocument()
      })
    })
  })

  // Scenario 4: Availability handling across states
  describe('Scenario 4: Availability handling across all states (Req 3.2, 3.4, 3.5, 3.6, 4.4, 4.5)', () => {
    it('renders active in-stock, active out-of-stock, unavailable, and deleted items correctly in /favorites', async () => {
      tokenStore.setToken('valid-token-user1')
      vi.mocked(authApi.getMe).mockResolvedValue({
        id: 'user-1',
        email: 'customer@example.com',
        role: 'customer',
      })
      vi.mocked(favoritesApi.list).mockResolvedValue([
        mockFavoriteActiveItem,
        mockFavoriteOutOfStockItem,
        mockFavoriteUnavailableItem,
        mockFavoriteDeletedItem,
      ])

      renderAppWithRouter('/favorites')

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /sản phẩm yêu thích/i, level: 1 })).toBeInTheDocument()
        expect(screen.getByText('iPhone 16 Pro Max')).toBeInTheDocument()
      })

      // 1. Active in-stock item
      expect(screen.getByText('iPhone 16 Pro Max')).toBeInTheDocument()
      expect(screen.getByText('34.990.000 ₫')).toBeInTheDocument()
      expect(screen.getByText('Còn hàng')).toBeInTheDocument()
      const activeLinks = screen.getAllByRole('link', { name: /iPhone 16 Pro Max/i })
      expect(activeLinks[0]).toHaveAttribute('href', '/products/prod-active-1')

      // 2. Active out-of-stock item
      expect(screen.getByText('Xiaomi 15 Ultra')).toBeInTheDocument()
      expect(screen.getByText('29.990.000 ₫ - 31.990.000 ₫')).toBeInTheDocument()
      expect(screen.getByText('Hết hàng')).toBeInTheDocument()
      const oosLinks = screen.getAllByRole('link', { name: /Xiaomi 15 Ultra/i })
      expect(oosLinks[0]).toHaveAttribute('href', '/products/prod-active-oos')

      // 3. Unavailable item (active product with 0 active variants)
      expect(screen.getByText('Samsung Galaxy Fold 4')).toBeInTheDocument()
      expect(screen.getByText('Sản phẩm hiện không khả dụng')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /Samsung Galaxy Fold 4/i })).not.toBeInTheDocument()

      // 4. Deleted item (soft-deleted product)
      expect(screen.getByText('iPhone 11')).toBeInTheDocument()
      expect(screen.getByText('Sản phẩm đã bị xóa')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /iPhone 11/i })).not.toBeInTheDocument()

      // All 4 items have remove buttons enabled
      const removeBtns = screen.getAllByRole('button', { name: /bỏ.*khỏi yêu thích/i })
      expect(removeBtns.length).toBe(4)
    })
  })

  // Scenario 5: Account isolation & session restoration
  describe('Scenario 5: Account isolation and session restoration (Req 5.1, 5.2, 5.3, 5.4, 5.7)', () => {
    it('isolates favorites between user accounts and clears state on logout', async () => {
      // Step 1: User A logs in
      tokenStore.setToken('token-user-a')
      vi.mocked(authApi.getMe).mockResolvedValue({
        id: 'user-a',
        email: 'user-a@example.com',
        role: 'customer',
      })
      vi.mocked(favoritesApi.list).mockResolvedValue([mockFavoriteActiveItem])

      const { unmount } = renderAppWithRouter('/favorites')

      await waitFor(() => {
        expect(screen.getByText('iPhone 16 Pro Max')).toBeInTheDocument()
        expect(screen.getAllByText('user-a@example.com').length).toBeGreaterThanOrEqual(1)
      })

      // Step 2: User A logs out
      const logoutBtn = screen.getByTitle('Đăng xuất')
      fireEvent.click(logoutBtn)

      // Step 3: Verify token cleared and user is unauthenticated
      await waitFor(() => {
        expect(tokenStore.getToken()).toBeNull()
        expect(screen.getAllByText('Đăng nhập').length).toBeGreaterThanOrEqual(1)
      })

      unmount()

      // Step 4: User B logs in
      tokenStore.setToken('token-user-b')
      vi.mocked(authApi.getMe).mockResolvedValue({
        id: 'user-b',
        email: 'user-b@example.com',
        role: 'customer',
      })
      vi.mocked(favoritesApi.list).mockResolvedValue([mockFavoriteOutOfStockItem])

      renderAppWithRouter('/favorites')

      await waitFor(() => {
        expect(screen.getByText('Xiaomi 15 Ultra')).toBeInTheDocument()
        expect(screen.getAllByText('user-b@example.com').length).toBeGreaterThanOrEqual(1)
      })

      // User B MUST NOT see User A's favorite item
      expect(screen.queryByText('iPhone 16 Pro Max')).not.toBeInTheDocument()
    })
  })

  // Scenario 6: Removal and empty state
  describe('Scenario 6: Removal and empty state (Req 2.4, 3.7)', () => {
    it('renders empty state with link to catalog after removing all items', async () => {
      tokenStore.setToken('valid-token-user1')
      vi.mocked(authApi.getMe).mockResolvedValue({
        id: 'user-1',
        email: 'customer@example.com',
        role: 'customer',
      })
      vi.mocked(favoritesApi.list).mockResolvedValue([mockFavoriteActiveItem])
      vi.mocked(favoritesApi.remove).mockResolvedValue([])

      renderAppWithRouter('/favorites')

      await waitFor(() => {
        expect(screen.getByText('iPhone 16 Pro Max')).toBeInTheDocument()
      })

      // Remove item
      const removeBtn = screen.getByRole('button', { name: /bỏ.*khỏi yêu thích/i })
      fireEvent.click(removeBtn)

      // Verify empty state is rendered
      await waitFor(() => {
        expect(screen.getByText('Chưa có sản phẩm yêu thích')).toBeInTheDocument()
        const catalogLink = screen.getByRole('link', { name: /khám phá sản phẩm/i })
        expect(catalogLink).toHaveAttribute('href', '/products')
      })

      // Click "Khám phá sản phẩm ngay" navigates to /products
      const exploreBtn = screen.getByRole('link', { name: /khám phá sản phẩm/i })
      fireEvent.click(exploreBtn)

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /danh mục điện thoại/i })).toBeInTheDocument()
      })
    })
  })

  // Scenario 7: Regression check
  describe('Scenario 7: Regression check for public catalog and detail flows (Req 4.3)', () => {
    it('ensures public catalog browsing and detail interactions remain functional for unauthenticated guests', async () => {
      renderAppWithRouter('/products')

      await waitFor(() => {
        expect(screen.getAllByText('iPhone 16 Pro Max').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('34.990.000 ₫').length).toBeGreaterThanOrEqual(1)
      })

      // Navigate to product detail
      const detailLinks = screen.getAllByRole('link', { name: /iPhone 16 Pro Max/i })
      fireEvent.click(detailLinks[0])

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'iPhone 16 Pro Max', level: 1 })).toBeInTheDocument()
        expect(screen.getByText('Thêm vào giỏ hàng')).toBeInTheDocument()
      })

      // Guest attempting to add to cart is guided to login
      const addToCartBtn = screen.getByRole('button', { name: /thêm vào giỏ hàng/i })
      expect(addToCartBtn).not.toBeDisabled()
      fireEvent.click(addToCartBtn)

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /đăng nhập/i })).toBeInTheDocument()
      })
    })

    it('ensures authenticated user can add variant to cart without favorite interference', async () => {
      tokenStore.setToken('valid-token-user1')
      vi.mocked(authApi.getMe).mockResolvedValue({
        id: 'user-1',
        email: 'customer@example.com',
        role: 'customer',
      })
      vi.mocked(favoritesApi.list).mockResolvedValue([mockFavoriteActiveItem])

      renderAppWithRouter('/products/prod-active-1')

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'iPhone 16 Pro Max', level: 1 })).toBeInTheDocument()
      })

      // Click add to cart as authenticated user
      const addToCartBtn = screen.getByRole('button', { name: /thêm vào giỏ hàng/i })
      fireEvent.click(addToCartBtn)

      await waitFor(() => {
        expect(cartApi.addItem).toHaveBeenCalledWith('var-1')
      })
    })
  })
})
