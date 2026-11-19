import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { ToastProvider } from '@/context/ToastContext'
import { catalogApi } from '@/api/catalog'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/CartContext', () => ({
  useCart: vi.fn(),
}))

vi.mock('@/api/catalog', () => ({
  catalogApi: {
    listCategories: vi.fn(),
    listProductsWithMeta: vi.fn(),
  },
}))

function LocationDisplay() {
  const loc = useLocation()
  return <div data-testid="test-location">{loc.pathname + loc.search}</div>
}

describe('Header Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useCart).mockReturnValue({
      cart: null,
      badgeCount: 0,
      isLoading: false,
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
      refreshCart: vi.fn(),
    })

    vi.mocked(catalogApi.listCategories).mockResolvedValue([
      { id: 'cat-1', name: 'iPhone' },
      { id: 'cat-2', name: 'Samsung' },
    ])
    vi.mocked(catalogApi.listProductsWithMeta).mockResolvedValue({
      data: [],
      meta: { timestamp: '2026-11-18T00:00:00Z' },
      message: '',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does NOT render "Lịch sử mua hàng" link when user is unauthenticated', () => {
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
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.queryByText('Lịch sử mua hàng')).not.toBeInTheDocument()
    expect(screen.getByText('Đăng nhập')).toBeInTheDocument()
  })

  it('renders "Lịch sử mua hàng" link when user is authenticated and links to /orders', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    const orderLinks = screen.getAllByRole('link', { name: /Lịch sử mua hàng/i })
    expect(orderLinks.length).toBeGreaterThanOrEqual(1)
    expect(orderLinks[0]).toHaveAttribute('href', '/orders')
  })

  it('renders "Lịch sử mua hàng" in mobile drawer when authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    // Open mobile menu
    const menuButton = screen.getByRole('button', { name: /toggle menu/i })
    fireEvent.click(menuButton)

    await waitFor(() => {
      const orderLinks = screen.getAllByRole('link', { name: /Lịch sử mua hàng/i })
      expect(orderLinks.length).toBe(2) // 1 desktop + 1 mobile
    })
  })

  it('does NOT render "Sản phẩm yêu thích" link when user is unauthenticated (Req 1.3)', () => {
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
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.queryByText('Sản phẩm yêu thích')).not.toBeInTheDocument()
  })

  it('renders "Sản phẩm yêu thích" link when authenticated and links to /favorites without badge count (Req 1.3)', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    const favoriteLinks = screen.getAllByRole('link', { name: /Sản phẩm yêu thích/i })
    expect(favoriteLinks.length).toBeGreaterThanOrEqual(1)
    expect(favoriteLinks[0]).toHaveAttribute('href', '/favorites')

    // No badge count element within the favorites link
    expect(favoriteLinks[0].querySelector('.rounded-full')).toBeNull()
  })

  it('renders "Sản phẩm yêu thích" in mobile drawer when authenticated (Req 1.3)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    // Open mobile menu
    const menuButton = screen.getByRole('button', { name: /toggle menu/i })
    fireEvent.click(menuButton)

    await waitFor(() => {
      const favoriteLinks = screen.getAllByRole('link', { name: /Sản phẩm yêu thích/i })
      expect(favoriteLinks.length).toBe(2) // 1 desktop + 1 mobile
      expect(favoriteLinks[1]).toHaveAttribute('href', '/favorites')
    })
  })

  it('does NOT render "Lịch sử đánh giá" link when user is unauthenticated', () => {
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
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.queryByText('Lịch sử đánh giá')).not.toBeInTheDocument()
  })

  it('renders "Lịch sử đánh giá" link when authenticated and links to /reviews', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    const reviewLinks = screen.getAllByRole('link', { name: /Lịch sử đánh giá/i })
    expect(reviewLinks.length).toBeGreaterThanOrEqual(1)
    expect(reviewLinks[0]).toHaveAttribute('href', '/reviews')
  })

  it('renders "Lịch sử đánh giá" in mobile drawer when authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    // Open mobile menu
    const menuButton = screen.getByRole('button', { name: /toggle menu/i })
    fireEvent.click(menuButton)

    await waitFor(() => {
      const reviewLinks = screen.getAllByRole('link', { name: /Lịch sử đánh giá/i })
      expect(reviewLinks.length).toBe(2) // 1 desktop + 1 mobile
      expect(reviewLinks[1]).toHaveAttribute('href', '/reviews')
    })
  })

  it('renders loading skeleton and does NOT render login button while auth state is loading without user', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: 'pending-token',
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    // Desktop skeleton should be rendered, not the login button
    expect(screen.getByTestId('auth-loading-skeleton')).toBeInTheDocument()
    expect(screen.queryByText('Đăng nhập')).not.toBeInTheDocument()

    // Open mobile menu
    const menuButton = screen.getByRole('button', { name: /toggle menu/i })
    fireEvent.click(menuButton)

    await waitFor(() => {
      expect(screen.getByTestId('mobile-auth-loading-skeleton')).toBeInTheDocument()
      expect(screen.queryByText('Đăng nhập / Đăng ký')).not.toBeInTheDocument()
    })
  })

  it('renders "Bài viết" link in desktop navigation and mobile drawer for all users', async () => {
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
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    const desktopPostsLink = screen.getByTestId('header-posts-link')
    expect(desktopPostsLink).toBeInTheDocument()
    expect(desktopPostsLink).toHaveAttribute('href', '/posts')

    // Open mobile menu
    const menuButton = screen.getByRole('button', { name: /toggle menu/i })
    fireEvent.click(menuButton)

    await waitFor(() => {
      const mobilePostsLink = screen.getByTestId('mobile-posts-link')
      expect(mobilePostsLink).toBeInTheDocument()
      expect(mobilePostsLink).toHaveAttribute('href', '/posts')
    })
  })

  it('renders NotificationBell when authenticated and does not when unauthenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    const { rerender } = render(
      <ToastProvider>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.queryByTestId('notification-bell-button')).not.toBeInTheDocument()

    // Now authenticated
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u-1', email: 'test@example.com' } as any,
      accessToken: 'token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    rerender(
      <ToastProvider>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByTestId('notification-bell-button')).toBeInTheDocument()
  })

  it('links desktop and mobile account pills to /account with displayName fallback to email', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'u-1',
        email: 'khach@example.com',
        displayName: 'Nguyễn Minh Anh',
        avatarUrl: null,
      },
      accessToken: 'token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </ToastProvider>
    )

    const desktopAccountLink = screen.getByTestId('header-account-link')
    expect(desktopAccountLink).toHaveAttribute('href', '/account')
    expect(desktopAccountLink).toHaveTextContent('Nguyễn Minh Anh')
    expect(desktopAccountLink).not.toHaveTextContent('khach@example.com')

    fireEvent.click(screen.getByRole('button', { name: /toggle menu/i }))
    await waitFor(() => {
      const mobileAccountLink = screen.getByTestId('mobile-account-link')
      expect(mobileAccountLink).toHaveAttribute('href', '/account')
      expect(mobileAccountLink).toHaveTextContent('Nguyễn Minh Anh')
    })
  })

  describe('Instant search autocomplete (Req 6.6)', () => {
    beforeEach(() => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      })
    })

    it('does not fetch suggestions when trimmed query has fewer than 2 characters', async () => {
      vi.useFakeTimers()
      render(
        <ToastProvider>
          <MemoryRouter>
            <Header />
          </MemoryRouter>
        </ToastProvider>
      )

      const input = screen.getByPlaceholderText('Tìm thiết bị, dòng máy, thương hiệu...')
      fireEvent.change(input, { target: { value: ' a ' } })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })

      expect(catalogApi.listProductsWithMeta).not.toHaveBeenCalled()
    })

    it('debounces 250ms, calls listProductsWithMeta({ q, limit: 5 }), and displays suggestions with footer link', async () => {
      vi.useFakeTimers()
      vi.mocked(catalogApi.listProductsWithMeta).mockResolvedValue({
        data: [
          {
            id: 'prod-1',
            name: 'iPhone 16 Pro',
            model: 'A3293',
            brand: 'Apple',
            category: { id: 'cat-1', name: 'Điện thoại' },
            minPriceVnd: '28990000',
            maxPriceVnd: '28990000',
            price: '28990000',
            currency: 'VND',
            primaryImageUrl: '/media/products/ip16.jpg',
            inStock: true,
            averageRating: 4.9,
            reviewCount: 25,
            soldCount: 100,
          },
        ],
        meta: { timestamp: '2026-11-18T00:00:00Z' },
        message: '',
      })

      render(
        <ToastProvider>
          <MemoryRouter>
            <Header />
          </MemoryRouter>
        </ToastProvider>
      )

      const input = screen.getByPlaceholderText('Tìm thiết bị, dòng máy, thương hiệu...')
      fireEvent.change(input, { target: { value: 'iphone' } })

      // Before 250ms debounce elapses
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })
      expect(catalogApi.listProductsWithMeta).not.toHaveBeenCalled()

      // After 250ms debounce elapses
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60)
      })

      expect(catalogApi.listProductsWithMeta).toHaveBeenCalledWith({
        q: 'iphone',
        limit: 5,
      })

      const listbox = screen.getByRole('listbox')
      expect(listbox).toBeInTheDocument()
      expect(screen.getByText('iPhone 16 Pro')).toBeInTheDocument()
      expect(screen.getByText('Apple')).toBeInTheDocument()
      expect(screen.getByText(/28\.990\.000\s*₫/)).toBeInTheDocument()
      expect(screen.getByText('4.9')).toBeInTheDocument()
      expect(screen.getByAltText('iPhone 16 Pro')).toHaveAttribute('src', '/media/products/ip16.jpg')

      const viewAllLink = screen.getByRole('link', { name: /Xem tất cả kết quả/i })
      expect(viewAllLink).toHaveAttribute('href', '/products?q=iphone')
    })

    it('ignores stale out-of-order search responses', async () => {
      vi.useFakeTimers()

      let resolveFirst!: (val: any) => void
      let resolveSecond!: (val: any) => void
      const firstPromise = new Promise((r) => {
        resolveFirst = r
      })
      const secondPromise = new Promise((r) => {
        resolveSecond = r
      })

      vi.mocked(catalogApi.listProductsWithMeta)
        .mockReturnValueOnce(firstPromise as any)
        .mockReturnValueOnce(secondPromise as any)

      render(
        <ToastProvider>
          <MemoryRouter>
            <Header />
          </MemoryRouter>
        </ToastProvider>
      )

      const input = screen.getByPlaceholderText('Tìm thiết bị, dòng máy, thương hiệu...')

      fireEvent.change(input, { target: { value: 'ip' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(260)
      })

      fireEvent.change(input, { target: { value: 'xiaomi' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(260)
      })

      // Second request resolves first with Xiaomi
      await act(async () => {
        resolveSecond({
          data: [
            {
              id: 'prod-2',
              name: 'Xiaomi 15 Ultra',
              model: 'X15U',
              brand: 'Xiaomi',
              category: { id: 'cat-1', name: 'Điện thoại' },
              minPriceVnd: '24990000',
              maxPriceVnd: '24990000',
              price: '24990000',
              currency: 'VND',
              primaryImageUrl: '',
              inStock: true,
              averageRating: 4.7,
              reviewCount: 5,
            },
          ],
          meta: { timestamp: '2026-11-18T00:00:00Z' },
          message: '',
        })
      })

      expect(screen.getByText('Xiaomi 15 Ultra')).toBeInTheDocument()

      // Stale first request resolves later with iPhone
      await act(async () => {
        resolveFirst({
          data: [
            {
              id: 'prod-1',
              name: 'Stale iPhone Result',
              model: 'A1',
              brand: 'Apple',
              category: { id: 'cat-1', name: 'Điện thoại' },
              minPriceVnd: '10000000',
              maxPriceVnd: '10000000',
              price: '10000000',
              currency: 'VND',
              primaryImageUrl: '',
              inStock: true,
            },
          ],
          meta: { timestamp: '2026-11-18T00:00:00Z' },
          message: '',
        })
      })

      expect(screen.queryByText('Stale iPhone Result')).not.toBeInTheDocument()
      expect(screen.getByText('Xiaomi 15 Ultra')).toBeInTheDocument()
    })

    it('supports keyboard ArrowDown, ArrowUp, Enter to navigate, and Escape / outside click to close', async () => {
      vi.useFakeTimers()
      vi.mocked(catalogApi.listProductsWithMeta).mockResolvedValue({
        data: [
          {
            id: 'prod-1',
            name: 'iPhone 16 Pro',
            model: 'A3293',
            brand: 'Apple',
            category: { id: 'cat-1', name: 'Điện thoại' },
            minPriceVnd: '28990000',
            maxPriceVnd: '28990000',
            price: '28990000',
            currency: 'VND',
            primaryImageUrl: '',
            inStock: true,
            averageRating: 4.9,
            reviewCount: 10,
          },
          {
            id: 'prod-2',
            name: 'iPhone 15',
            model: 'A3090',
            brand: 'Apple',
            category: { id: 'cat-1', name: 'Điện thoại' },
            minPriceVnd: '19990000',
            maxPriceVnd: '19990000',
            price: '19990000',
            currency: 'VND',
            primaryImageUrl: '',
            inStock: true,
            averageRating: 4.5,
            reviewCount: 5,
          },
        ],
        meta: { timestamp: '2026-11-18T00:00:00Z' },
        message: '',
      })

      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/']}>
            <Header />
            <Routes>
              <Route path="*" element={<LocationDisplay />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      )

      const input = screen.getByPlaceholderText('Tìm thiết bị, dòng máy, thương hiệu...')
      fireEvent.change(input, { target: { value: 'iphone' } })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(260)
      })

      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(2)

      // ArrowDown selects first, ArrowDown again selects second, ArrowUp goes back to first
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      expect(options[1]).toHaveAttribute('aria-selected', 'true')
      fireEvent.keyDown(input, { key: 'ArrowUp' })
      expect(options[0]).toHaveAttribute('aria-selected', 'true')

      // Escape closes dropdown
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

      // Re-open with ArrowDown and press Enter to navigate to product detail
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(screen.getByTestId('test-location')).toHaveTextContent('/products/prod-1')
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

      // Outside click closes dropdown when open
      fireEvent.change(input, { target: { value: 'iphone' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(260)
      })
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      fireEvent.mouseDown(document.body)
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
  })
})
