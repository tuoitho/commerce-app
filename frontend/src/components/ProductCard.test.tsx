import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProductCard } from './ProductCard'
import type { ProductSummary } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { useFavorites } from '@/context/FavoritesContext'
import { useToast } from '@/context/ToastContext'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/FavoritesContext', () => ({
  useFavorites: vi.fn(),
}))

vi.mock('@/context/ToastContext', () => ({
  useToast: vi.fn(),
}))

describe('ProductCard', () => {
  const mockToggle = vi.fn()
  const mockIsPending = vi.fn()
  const mockSuccess = vi.fn()
  const mockError = vi.fn()

  const dummyProduct: ProductSummary = {
    id: 'prod-apple-1',
    name: 'iPhone 16 Pro Max',
    model: 'A3297',
    brand: 'Apple',
    category: { id: 'cat-phone', name: 'Điện thoại' },
    minPriceVnd: '34990000',
    maxPriceVnd: '34990000',
    price: '34990000',
    currency: 'VND',
    primaryImageUrl: 'https://example.com/iphone-16.jpg',
    inStock: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsPending.mockReturnValue(false)
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
      items: [],
      favoriteIds: new Set<string>(),
      isLoading: false,
      loadError: null,
      isPending: mockIsPending,
      refresh: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      toggle: mockToggle.mockResolvedValue(undefined),
    })
    vi.mocked(useToast).mockReturnValue({
      toast: vi.fn(),
      success: mockSuccess,
      error: mockError,
      info: vi.fn(),
    })
  })

  it('renders brand text badge and product details', () => {
    render(
      <MemoryRouter>
        <ProductCard product={dummyProduct} />
      </MemoryRouter>
    )

    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('iPhone 16 Pro Max')).toBeInTheDocument()
    expect(screen.getByText('A3297')).toBeInTheDocument()
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('alt', 'Apple iPhone 16 Pro Max A3297')
  })

  it('falls back to default label when brand is empty', () => {
    const productWithoutBrand: ProductSummary = {
      ...dummyProduct,
      brand: '',
    }

    render(
      <MemoryRouter>
        <ProductCard product={productWithoutBrand} />
      </MemoryRouter>
    )

    expect(screen.getByText('Smartphone')).toBeInTheDocument()
  })

  it('renders "Còn hàng" badge when inStock is true', () => {
    render(
      <MemoryRouter>
        <ProductCard product={{ ...dummyProduct, inStock: true }} />
      </MemoryRouter>
    )

    expect(screen.getByText('Còn hàng')).toBeInTheDocument()
  })

  it('renders "Hết hàng" badge when inStock is false', () => {
    render(
      <MemoryRouter>
        <ProductCard product={{ ...dummyProduct, inStock: false }} />
      </MemoryRouter>
    )

    expect(screen.getByText('Hết hàng')).toBeInTheDocument()
  })

  it('renders price range when minPriceVnd and maxPriceVnd differ', () => {
    const multiVariantProduct: ProductSummary = {
      ...dummyProduct,
      minPriceVnd: '25990000',
      maxPriceVnd: '32990000',
      price: '25990000',
    }

    render(
      <MemoryRouter>
        <ProductCard product={multiVariantProduct} />
      </MemoryRouter>
    )

    expect(screen.getByText(/25\.990\.000\s*₫\s*-\s*32\.990\.000\s*₫/)).toBeInTheDocument()
  })

  it('renders FavoriteToggleButton with correct accessible name and unpressed state (Req 1.1, 6.3)', () => {
    render(
      <MemoryRouter>
        <ProductCard product={dummyProduct} />
      </MemoryRouter>
    )

    const favButton = screen.getByRole('button', {
      name: /Thêm iPhone 16 Pro Max vào yêu thích/i,
    })
    expect(favButton).toBeInTheDocument()
    expect(favButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders FavoriteToggleButton in pressed state when product is in favorites (Req 4.1, 6.1)', () => {
    vi.mocked(useFavorites).mockReturnValue({
      items: [],
      favoriteIds: new Set<string>(['prod-apple-1']),
      isLoading: false,
      loadError: null,
      isPending: mockIsPending,
      refresh: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      toggle: mockToggle.mockResolvedValue(undefined),
    })

    render(
      <MemoryRouter>
        <ProductCard product={dummyProduct} />
      </MemoryRouter>
    )

    const favButton = screen.getByRole('button', {
      name: /Bỏ iPhone 16 Pro Max khỏi yêu thích/i,
    })
    expect(favButton).toBeInTheDocument()
    expect(favButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking favorite button calls toggle without navigating to product detail (Req 1.1, 2.1)', () => {
    render(
      <MemoryRouter>
        <ProductCard product={dummyProduct} />
      </MemoryRouter>
    )

    const favButton = screen.getByRole('button', {
      name: /Thêm iPhone 16 Pro Max vào yêu thích/i,
    })
    fireEvent.click(favButton)

    expect(mockToggle).toHaveBeenCalledWith('prod-apple-1')
  })
})
