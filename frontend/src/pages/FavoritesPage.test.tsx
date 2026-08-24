import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FavoritesPage } from './FavoritesPage'
import { useAuth } from '@/context/AuthContext'
import { useFavorites } from '@/context/FavoritesContext'
import { ToastProvider } from '@/context/ToastContext'
import type { FavoriteProduct } from '@/types/favorite'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/FavoritesContext', () => ({
  useFavorites: vi.fn(),
}))

const mockActiveProduct: FavoriteProduct = {
  id: 'prod-active-1',
  name: 'iPhone 16 Pro Max',
  model: 'A3294',
  brand: 'Apple',
  category: { id: 'cat-1', name: 'Điện thoại iOS' },
  primaryImageUrl: 'https://example.com/iphone16.jpg',
  availability: 'active',
  minPriceVnd: '34990000',
  maxPriceVnd: '34990000',
  inStock: true,
}

const mockOutOfStockActiveProduct: FavoriteProduct = {
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

const mockDeletedProduct: FavoriteProduct = {
  id: 'prod-deleted-1',
  name: 'iPhone 11',
  model: 'A2111',
  brand: 'Apple',
  category: { id: 'cat-1', name: 'Điện thoại iOS' },
  primaryImageUrl: 'https://example.com/iphone11.jpg',
  availability: 'deleted',
  minPriceVnd: null,
  maxPriceVnd: null,
  inStock: null,
}

const mockUnavailableProduct: FavoriteProduct = {
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

describe('FavoritesPage Component', () => {
  const mockRefresh = vi.fn()
  const mockRemove = vi.fn()
  const mockToggle = vi.fn()
  const mockIsPending = vi.fn().mockReturnValue(false)

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

    vi.mocked(useFavorites).mockReturnValue({
      items: [mockActiveProduct],
      favoriteIds: new Set(['prod-active-1']),
      isLoading: false,
      loadError: null,
      isPending: mockIsPending,
      refresh: mockRefresh,
      add: vi.fn(),
      remove: mockRemove,
      toggle: mockToggle,
    })
  })

  // 1. Auth Protection & Loading
  it('renders loading skeleton while auth session is restoring and does not redirect', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <Routes>
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/login" element={<div>Trang đăng nhập</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.queryByText('Trang đăng nhập')).not.toBeInTheDocument()
    expect(screen.queryByText('Chưa có sản phẩm yêu thích')).not.toBeInTheDocument()
  })

  it('redirects unauthenticated guest to /login?redirect=/favorites', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <Routes>
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/login" element={<div>Trang đăng nhập</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Trang đăng nhập')).toBeInTheDocument()
    })
  })

  // 2. Favorites Loading & Error States
  it('renders loading state when favorites are loading and NEVER shows empty state (Req 3.8)', () => {
    vi.mocked(useFavorites).mockReturnValue({
      items: [],
      favoriteIds: new Set(),
      isLoading: true,
      loadError: null,
      isPending: mockIsPending,
      refresh: mockRefresh,
      add: vi.fn(),
      remove: mockRemove,
      toggle: mockToggle,
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.queryByText('Chưa có sản phẩm yêu thích')).not.toBeInTheDocument()
  })

  it('renders Vietnamese error message and retry button when loadError occurs, and NEVER shows empty state (Req 3.9)', () => {
    vi.mocked(useFavorites).mockReturnValue({
      items: [],
      favoriteIds: new Set(),
      isLoading: false,
      loadError: 'Không thể kết nối đến máy chủ',
      isPending: mockIsPending,
      refresh: mockRefresh,
      add: vi.fn(),
      remove: mockRemove,
      toggle: mockToggle,
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByText(/Không thể kết nối đến máy chủ/i)).toBeInTheDocument()
    expect(screen.queryByText('Chưa có sản phẩm yêu thích')).not.toBeInTheDocument()

    const retryButton = screen.getByRole('button', { name: /thử lại/i })
    expect(retryButton).toBeInTheDocument()

    fireEvent.click(retryButton)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  // 3. Empty State
  it('renders Vietnamese empty state with catalog link when items array is empty (Req 3.7)', () => {
    vi.mocked(useFavorites).mockReturnValue({
      items: [],
      favoriteIds: new Set(),
      isLoading: false,
      loadError: null,
      isPending: mockIsPending,
      refresh: mockRefresh,
      add: vi.fn(),
      remove: mockRemove,
      toggle: mockToggle,
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByText('Chưa có sản phẩm yêu thích')).toBeInTheDocument()
    const catalogLink = screen.getByRole('link', { name: /khám phá sản phẩm/i })
    expect(catalogLink).toHaveAttribute('href', '/products')
  })

  // 4. Server-Supplied Order
  it('renders items strictly in server-supplied order (Req 3.1)', () => {
    vi.mocked(useFavorites).mockReturnValue({
      items: [mockUnavailableProduct, mockActiveProduct, mockDeletedProduct],
      favoriteIds: new Set(['prod-unavail-1', 'prod-active-1', 'prod-deleted-1']),
      isLoading: false,
      loadError: null,
      isPending: mockIsPending,
      refresh: mockRefresh,
      add: vi.fn(),
      remove: mockRemove,
      toggle: mockToggle,
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    const productTitles = screen.getAllByRole('heading', { level: 3 })
    expect(productTitles.map((el) => el.textContent)).toEqual([
      'Samsung Galaxy Fold 4',
      'iPhone 16 Pro Max',
      'iPhone 11',
    ])
  })

  // 5. Active Product Presentation
  it('renders active product with details, price, stock status, and detail link (Req 3.2, 3.3)', () => {
    vi.mocked(useFavorites).mockReturnValue({
      items: [mockActiveProduct],
      favoriteIds: new Set(['prod-active-1']),
      isLoading: false,
      loadError: null,
      isPending: mockIsPending,
      refresh: mockRefresh,
      add: vi.fn(),
      remove: mockRemove,
      toggle: mockToggle,
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByText('iPhone 16 Pro Max')).toBeInTheDocument()
    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('A3294')).toBeInTheDocument()
    expect(screen.getByText('Còn hàng')).toBeInTheDocument()
    expect(screen.getByText('34.990.000 ₫')).toBeInTheDocument()

    // Links to product detail
    const detailLinks = screen.getAllByRole('link', { name: /iPhone 16 Pro Max/i })
    expect(detailLinks[0]).toHaveAttribute('href', '/products/prod-active-1')
  })

  it('renders out-of-stock active product with "Hết hàng" status and detail link (Req 4.4)', () => {
    vi.mocked(useFavorites).mockReturnValue({
      items: [mockOutOfStockActiveProduct],
      favoriteIds: new Set(['prod-active-oos']),
      isLoading: false,
      loadError: null,
      isPending: mockIsPending,
      refresh: mockRefresh,
      add: vi.fn(),
      remove: mockRemove,
      toggle: mockToggle,
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByText('Xiaomi 15 Ultra')).toBeInTheDocument()
    expect(screen.getByText('Hết hàng')).toBeInTheDocument()
    expect(screen.getByText('29.990.000 ₫ - 31.990.000 ₫')).toBeInTheDocument()

    const detailLinks = screen.getAllByRole('link', { name: /Xiaomi 15 Ultra/i })
    expect(detailLinks[0]).toHaveAttribute('href', '/products/prod-active-oos')
  })

  // 6. Deleted Product Presentation
  it('renders deleted product with EXACT note "Sản phẩm đã bị xóa", without detail links or purchasable price/stock, but with remove action (Req 3.4, 3.6)', () => {
    vi.mocked(useFavorites).mockReturnValue({
      items: [mockDeletedProduct],
      favoriteIds: new Set(['prod-deleted-1']),
      isLoading: false,
      loadError: null,
      isPending: mockIsPending,
      refresh: mockRefresh,
      add: vi.fn(),
      remove: mockRemove,
      toggle: mockToggle,
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    // Name, model, brand are shown
    expect(screen.getByText('iPhone 11')).toBeInTheDocument()
    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('A2111')).toBeInTheDocument()

    // EXACT note
    expect(screen.getByText('Sản phẩm đã bị xóa')).toBeInTheDocument()

    // NO link to detail
    expect(screen.queryByRole('link', { name: /iPhone 11/i })).not.toBeInTheDocument()

    // NO price or stock text
    expect(screen.queryByText(/₫/)).not.toBeInTheDocument()
    expect(screen.queryByText('Còn hàng')).not.toBeInTheDocument()
    expect(screen.queryByText('Hết hàng')).not.toBeInTheDocument()

    // Has remove action
    const removeBtn = screen.getByRole('button', { name: /bỏ.*khỏi yêu thích/i })
    expect(removeBtn).toBeInTheDocument()
  })

  // 7. Unavailable Product Presentation
  it('renders unavailable product with EXACT note "Sản phẩm hiện không khả dụng", without detail links or purchasable price/stock, but with remove action (Req 3.5, 3.6)', () => {
    vi.mocked(useFavorites).mockReturnValue({
      items: [mockUnavailableProduct],
      favoriteIds: new Set(['prod-unavail-1']),
      isLoading: false,
      loadError: null,
      isPending: mockIsPending,
      refresh: mockRefresh,
      add: vi.fn(),
      remove: mockRemove,
      toggle: mockToggle,
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    // Name, model, brand are shown
    expect(screen.getByText('Samsung Galaxy Fold 4')).toBeInTheDocument()
    expect(screen.getByText('Samsung')).toBeInTheDocument()
    expect(screen.getByText('SM-F936B')).toBeInTheDocument()

    // EXACT note
    expect(screen.getByText('Sản phẩm hiện không khả dụng')).toBeInTheDocument()

    // NO link to detail
    expect(screen.queryByRole('link', { name: /Samsung Galaxy Fold 4/i })).not.toBeInTheDocument()

    // NO price or stock text
    expect(screen.queryByText(/₫/)).not.toBeInTheDocument()
    expect(screen.queryByText('Còn hàng')).not.toBeInTheDocument()
    expect(screen.queryByText('Hết hàng')).not.toBeInTheDocument()

    // Has remove action
    const removeBtn = screen.getByRole('button', { name: /bỏ.*khỏi yêu thích/i })
    expect(removeBtn).toBeInTheDocument()
  })

  // 8. Removing product from favorites
  it('allows removing an active or inactive product from favorites', async () => {
    vi.mocked(useFavorites).mockReturnValue({
      items: [mockActiveProduct, mockDeletedProduct],
      favoriteIds: new Set(['prod-active-1', 'prod-deleted-1']),
      isLoading: false,
      loadError: null,
      isPending: mockIsPending,
      refresh: mockRefresh,
      add: vi.fn(),
      remove: mockRemove,
      toggle: mockToggle,
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    const removeButtons = screen.getAllByRole('button', { name: /bỏ.*khỏi yêu thích/i })
    expect(removeButtons.length).toBe(2)

    fireEvent.click(removeButtons[0])
    expect(mockToggle).toHaveBeenCalledWith('prod-active-1')
  })
})
