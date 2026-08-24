import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProductCard } from './ProductCard'
import type { ProductSummary } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import { useFavorites } from '@/context/FavoritesContext'

vi.mock('@/context/AuthContext', () => ({
  AuthProvider: ({ children }: any) => <div>{children}</div>,
  useAuth: vi.fn(),
}))

vi.mock('@/context/FavoritesContext', () => ({
  FavoritesProvider: ({ children }: any) => <div>{children}</div>,
  useFavorites: vi.fn(),
}))

describe('ProductCard', () => {
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
    viewer: { isFavorite: false },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', role: 'customer' },
      role: 'customer',
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    vi.mocked(useFavorites).mockReturnValue({
      resolveIsFavorite: vi.fn((_id: string, serverVal: boolean) => serverVal),
      isPending: vi.fn(() => false),
      mutate: vi.fn(),
    })
  })

  it('renders brand text badge and product details', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <ProductCard product={dummyProduct} />
        </MemoryRouter>
      </ToastProvider>
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
      <ToastProvider>
        <MemoryRouter>
          <ProductCard product={productWithoutBrand} />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByText('Smartphone')).toBeInTheDocument()
  })

  it('renders "Còn hàng" badge when inStock is true', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <ProductCard product={{ ...dummyProduct, inStock: true }} />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByText('Còn hàng')).toBeInTheDocument()
  })

  it('renders "Hết hàng" badge when inStock is false', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <ProductCard product={{ ...dummyProduct, inStock: false }} />
        </MemoryRouter>
      </ToastProvider>
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
      <ToastProvider>
        <MemoryRouter>
          <ProductCard product={multiVariantProduct} />
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.getByText(/25\.990\.000\s*₫\s*-\s*32\.990\.000\s*₫/)).toBeInTheDocument()
  })

  it('renders favorite button with initial state from product viewer (CATALOG-VIEWER-008, FAVORITE-UI-001)', () => {
    const favoriteProduct: ProductSummary = {
      ...dummyProduct,
      viewer: { isFavorite: true },
    }

    vi.mocked(useFavorites).mockReturnValue({
      resolveIsFavorite: vi.fn((_id: string, _serverVal: boolean) => true),
      isPending: vi.fn(() => false),
      mutate: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter>
          <ProductCard product={favoriteProduct} />
        </MemoryRouter>
      </ToastProvider>
    )

    const favButton = screen.getByRole('button', { name: 'Bỏ khỏi yêu thích' })
    expect(favButton).toBeInTheDocument()
    expect(favButton).toHaveAttribute('aria-pressed', 'true')
  })
})
