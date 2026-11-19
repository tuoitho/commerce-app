import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HomePage } from './HomePage'
import { catalogApi } from '@/api/catalog'
import { flashSalesApi } from '@/api/flashSales'
import { useCurrentLive } from '@/hooks/useCurrentLive'
import { useAuth } from '@/context/AuthContext'
import { useFavorites } from '@/context/FavoritesContext'
import { useToast } from '@/context/ToastContext'

vi.mock('@/api/catalog', () => ({
  catalogApi: {
    listFeaturedProducts: vi.fn(),
    listCategories: vi.fn(),
  },
}))

vi.mock('@/api/flashSales', () => ({
  flashSalesApi: {
    getCurrentFlashSale: vi.fn(),
  },
}))

vi.mock('@/hooks/useCurrentLive', () => ({
  useCurrentLive: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/FavoritesContext', () => ({
  useFavorites: vi.fn(),
}))

vi.mock('@/context/ToastContext', () => ({
  useToast: vi.fn(),
}))

describe('HomePage Flash Sale section (Req 2.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useCurrentLive).mockReturnValue(null)
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
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
      isPending: vi.fn().mockReturnValue(false),
      refresh: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn(),
    })
    vi.mocked(useToast).mockReturnValue({
      toast: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    })
    vi.mocked(catalogApi.listFeaturedProducts).mockResolvedValue([
      {
        id: 'feat-1',
        name: 'iPhone 16',
        model: 'A3287',
        brand: 'Apple',
        category: { id: 'cat-1', name: 'Điện thoại' },
        minPriceVnd: '22990000',
        maxPriceVnd: '22990000',
        price: '22990000',
        currency: 'VND',
        primaryImageUrl: '',
        inStock: true,
        averageRating: 4.9,
        reviewCount: 12,
        soldCount: 50,
      },
    ])
    vi.mocked(catalogApi.listCategories).mockResolvedValue([
      { id: 'cat-1', name: 'Điện thoại' },
    ])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('displays active Flash Sale campaign with countdown, discount, strikethrough regular price, and sold progress', async () => {
    const futureEnd = new Date(Date.now() + (2 * 3600 + 15 * 60 + 30) * 1000).toISOString()
    vi.mocked(flashSalesApi.getCurrentFlashSale).mockResolvedValue({
      id: 'fs-1',
      name: 'Deal Chớp Nhoáng 12H',
      startsAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      endsAt: futureEnd,
      items: [
        {
          productId: 'prod-fs-1',
          variantId: 'var-fs-1',
          productName: 'iPhone 16 Pro',
          brand: 'Apple',
          model: 'A3294',
          imageUrl: '/media/products/ip16pro.jpg',
          optionLabel: '256GB / Titan Tự Nhiên',
          regularPriceVnd: '28990000',
          flashPriceVnd: '25990000',
          discountPercent: 10,
          quota: 20,
          soldQuantity: 12,
          inStock: true,
        },
        {
          productId: 'prod-fs-2',
          variantId: 'var-fs-2',
          productName: 'Xiaomi 15 Ultra',
          brand: 'Xiaomi',
          model: 'X15U',
          imageUrl: '',
          optionLabel: '512GB / Đen',
          regularPriceVnd: '24990000',
          flashPriceVnd: '21990000',
          discountPercent: 12,
          quota: 10,
          soldQuantity: 10,
          inStock: true,
        },
      ],
    })

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Flash Sale/i })).toBeInTheDocument()
    })

    const flashSection = screen.getByRole('region', { name: /Flash Sale/i })
    expect(within(flashSection).getByText('Deal Chớp Nhoáng 12H')).toBeInTheDocument()
    expect(within(flashSection).getByTestId('flash-sale-countdown')).toBeInTheDocument()

    // First item: available quota
    const firstLink = within(flashSection).getByRole('link', { name: /iPhone 16 Pro/i })
    expect(firstLink).toHaveAttribute('href', '/products/prod-fs-1')
    expect(within(flashSection).getByText(/25\.990\.000\s*₫/)).toBeInTheDocument()
    const regularPrice = within(flashSection).getByText(/28\.990\.000\s*₫/)
    expect(regularPrice).toHaveClass('line-through')
    expect(within(flashSection).getByText('-10%')).toBeInTheDocument()
    expect(within(flashSection).getByText('Đã bán 12/20')).toBeInTheDocument()

    // Second item: sold out
    const secondLink = within(flashSection).getByRole('link', { name: /Xiaomi 15 Ultra/i })
    expect(secondLink).toHaveAttribute('href', '/products/prod-fs-2')
    expect(within(flashSection).getByText('-12%')).toBeInTheDocument()
    expect(within(flashSection).getByText('Đã hết suất')).toBeInTheDocument()
  })

  it('hides Flash Sale section when getCurrentFlashSale returns null', async () => {
    vi.mocked(flashSalesApi.getCurrentFlashSale).mockResolvedValue(null)

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('iPhone 16')).toBeInTheDocument()
    })

    expect(screen.queryByRole('region', { name: /Flash Sale/i })).not.toBeInTheDocument()
  })

  it('hides Flash Sale section and keeps featured products visible when getCurrentFlashSale rejects', async () => {
    vi.mocked(flashSalesApi.getCurrentFlashSale).mockRejectedValue(new Error('Network error'))

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('iPhone 16')).toBeInTheDocument()
    })

    expect(screen.queryByRole('region', { name: /Flash Sale/i })).not.toBeInTheDocument()
  })
})
