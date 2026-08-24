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
    expect(screen.queryByRole('link', { name: /Yêu thích|Danh sách yêu thích/i })).not.toBeInTheDocument()
    expect(screen.getByText('Đăng nhập')).toBeInTheDocument()
  })

  it('renders "Yêu thích" link when user is authenticated and links to /favorites (FAVORITE-UI-004)', () => {
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

    const favoriteLinks = screen.getAllByRole('link', { name: /Yêu thích/i })
    expect(favoriteLinks.length).toBeGreaterThanOrEqual(1)
    expect(favoriteLinks[0]).toHaveAttribute('href', '/favorites')

    const orderLinks = screen.getAllByRole('link', { name: /Lịch sử mua hàng/i })
    expect(orderLinks.length).toBeGreaterThanOrEqual(1)
    expect(orderLinks[0]).toHaveAttribute('href', '/orders')
  })

  it('renders "Danh sách yêu thích" in mobile drawer when authenticated (FAVORITE-UI-004)', async () => {
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
      const favoriteMobileLink = screen.getByRole('link', { name: /Danh sách yêu thích/i })
      expect(favoriteMobileLink).toHaveAttribute('href', '/favorites')
      const orderLinks = screen.getAllByRole('link', { name: /Lịch sử mua hàng/i })
      expect(orderLinks.length).toBe(2) // 1 desktop + 1 mobile
    })
  })
})
