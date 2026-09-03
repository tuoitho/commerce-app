import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
  },
}))

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
})
