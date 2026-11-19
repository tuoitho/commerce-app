import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ProductDetailPage } from './ProductDetailPage'
import { catalogApi } from '@/api/catalog'
import { ApiError } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { useFavorites } from '@/context/FavoritesContext'
import { useCart } from '@/context/CartContext'
import { ToastProvider } from '@/context/ToastContext'
import { CompareProvider, COMPARE_STORAGE_KEY } from '@/context/CompareContext'

vi.mock('@/api/catalog', () => ({
  catalogApi: {
    getProduct: vi.fn(),
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/FavoritesContext', () => ({
  useFavorites: vi.fn(),
}))

vi.mock('@/context/CartContext', () => ({
  useCart: vi.fn(),
}))

const mockMultiVariantProduct = {
  id: 'p-multi',
  name: 'iPhone 16 Pro',
  model: 'A3293',
  description: 'Flagship phone from Apple with multi-variants.',
  brand: 'Apple',
  category: { id: 'cat-phone', name: 'Điện thoại' },
  minPriceVnd: '25990000',
  maxPriceVnd: '28990000',
  price: '25990000',
  currency: 'VND',
  imageUrls: ['https://example.com/iphone-16.jpg'],
  stockQuantity: 13,
  inStock: true,
  featured: true,
  optionGroups: [
    {
      id: 'opt-storage',
      label: 'Dung lượng',
      position: 1,
      values: [
        { id: 'val-128', label: '128GB' },
        { id: 'val-256', label: '256GB' },
      ],
    },
    {
      id: 'opt-color',
      label: 'Màu sắc',
      position: 2,
      values: [
        { id: 'val-black', label: 'Titan Đen' },
        { id: 'val-desert', label: 'Titan Sa Mạc' },
      ],
    },
  ],
  variants: [
    {
      id: 'var-128-black',
      optionValueIds: { 'opt-storage': 'val-128', 'opt-color': 'val-black' },
      priceVnd: '25990000',
      stockQuantity: 5,
      active: true,
    },
    {
      id: 'var-256-black',
      optionValueIds: { 'opt-storage': 'val-256', 'opt-color': 'val-black' },
      priceVnd: '28990000',
      stockQuantity: 8,
      active: true,
    },
    {
      id: 'var-128-desert',
      optionValueIds: { 'opt-storage': 'val-128', 'opt-color': 'val-desert' },
      priceVnd: '25990000',
      stockQuantity: 0,
      active: true,
    },
    {
      id: 'var-256-desert',
      optionValueIds: { 'opt-storage': 'val-256', 'opt-color': 'val-desert' },
      priceVnd: '28990000',
      stockQuantity: 3,
      active: false,
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('ProductDetailPage', () => {
  const mockAddItem = vi.fn()
  const mockToggleFavorite = vi.fn()
  const mockIsPending = vi.fn()

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
      toggle: mockToggleFavorite.mockResolvedValue(undefined),
    })
    vi.mocked(useCart).mockReturnValue({
      cart: null,
      isLoading: false,
      badgeCount: 0,
      refreshCart: vi.fn(),
      addItem: mockAddItem,
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })
  })

  it('renders product details and option groups properly', async () => {
    vi.mocked(catalogApi.getProduct).mockResolvedValue({
      id: 'p-1',
      name: 'iPhone 15 Pro',
      model: 'A3102',
      description: 'Flagship phone from Apple.',
      brand: 'Apple',
      category: { id: 'cat-phone', name: 'Điện thoại' },
      minPriceVnd: '25990000',
      maxPriceVnd: '32990000',
      price: '25990000',
      currency: 'VND',
      imageUrls: [],
      stockQuantity: 10,
      inStock: true,
      featured: true,
      optionGroups: [
        {
          id: 'opt-color',
          label: 'Màu sắc',
          position: 1,
          values: [{ id: 'val-blue', label: 'Titan Xanh' }],
        },
      ],
      variants: [
        {
          id: 'var-1',
          optionValueIds: { 'opt-color': 'val-blue' },
          priceVnd: '25990000',
          stockQuantity: 5,
          active: true,
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/products/p-1']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getAllByText('iPhone 15 Pro').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Apple')).toBeInTheDocument()
      expect(screen.getAllByText('Điện thoại').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Màu sắc:')).toBeInTheDocument()
      expect(screen.getByText('Titan Xanh')).toBeInTheDocument()
    })
  })

  it('shows the live price, the struck regular price and the remaining live quota', async () => {
    vi.mocked(catalogApi.getProduct).mockResolvedValue({
      ...mockMultiVariantProduct,
      variants: mockMultiVariantProduct.variants.map((v) =>
        v.id === 'var-128-black' ? { ...v, livePriceVnd: '23990000', liveRemaining: 4 } : { ...v, livePriceVnd: null, liveRemaining: null },
      ),
    })
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/products/p-multi']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(await screen.findByText('Giá live')).toBeInTheDocument()
    expect(screen.getAllByText(/23\.990\.000/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTestId('pdp-regular-price')).toHaveTextContent('25.990.000')
    expect(screen.getByTestId('pdp-regular-price')).toHaveClass('line-through')
    expect(screen.getByText('Còn 4 suất giá live')).toBeInTheDocument()
  })

  it('keeps the regular price display for variants without a live price', async () => {
    vi.mocked(catalogApi.getProduct).mockResolvedValue(mockMultiVariantProduct)
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/products/p-multi']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(await screen.findByText('GIÁ NIÊM YẾT CHÍNH HÃNG')).toBeInTheDocument()
    expect(screen.queryByText('Giá live')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pdp-regular-price')).not.toBeInTheDocument()
  })

  it('dynamically updates displayed price and stock count when selecting different option variants (Req 5.1, Req 5.3)', async () => {
    vi.mocked(catalogApi.getProduct).mockResolvedValue(mockMultiVariantProduct)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/products/p-multi']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'iPhone 16 Pro' })).toBeInTheDocument()
    })

    // Initial auto-selected options: 128GB + Titan Đen (Price: 25.990.000 ₫, Stock: 5)
    expect(screen.getAllByText(/25\.990\.000\s*₫/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Còn 5 máy sẵn hàng')).toBeInTheDocument()
    expect(screen.getByText('Còn hàng')).toBeInTheDocument()

    // Switch to 256GB
    const btn256 = screen.getByRole('button', { name: '256GB' })
    fireEvent.click(btn256)

    await waitFor(() => {
      // 256GB + Titan Đen (Price: 28.990.000 ₫, Stock: 8)
      expect(screen.getAllByText(/28\.990\.000\s*₫/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Còn 8 máy sẵn hàng')).toBeInTheDocument()
      expect(screen.getByText('Còn hàng')).toBeInTheDocument()
    })
  })

  it('renders "Hết hàng" and disables add to cart when selected variant has 0 stock or is inactive (Req 5.2)', async () => {
    vi.mocked(catalogApi.getProduct).mockResolvedValue(mockMultiVariantProduct)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/products/p-multi']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'iPhone 16 Pro' })).toBeInTheDocument()
    })

    // Switch to Titan Sa Mạc while on 128GB (which has stockQuantity: 0)
    const btnDesert = screen.getByRole('button', { name: /Titan Sa Mạc/i })
    fireEvent.click(btnDesert)

    await waitFor(() => {
      // Status badge and indicator show "Hết hàng"
      expect(screen.getAllByText('Hết hàng').length).toBeGreaterThanOrEqual(1)
    })

    // Switch to 256GB + Titan Sa Mạc (which has active: false)
    const btn256 = screen.getByRole('button', { name: '256GB' })
    fireEvent.click(btn256)

    await waitFor(() => {
      // Inactive variant also shows "Hết hàng"
      expect(screen.getAllByText('Hết hàng').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders "Hết hàng" badge when all variants have zero stock (Req 5.2)', async () => {
    const allOutOfStockProduct = {
      ...mockMultiVariantProduct,
      inStock: false,
      variants: mockMultiVariantProduct.variants.map((v) => ({
        ...v,
        stockQuantity: 0,
      })),
    }
    vi.mocked(catalogApi.getProduct).mockResolvedValue(allOutOfStockProduct)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/products/p-multi']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'iPhone 16 Pro' })).toBeInTheDocument()
      expect(screen.getAllByText('Hết hàng').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('adds selected variant to cart with correct variant ID (Req 5.4)', async () => {
    mockAddItem.mockResolvedValue(undefined)
    vi.mocked(catalogApi.getProduct).mockResolvedValue(mockMultiVariantProduct)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/products/p-multi']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'iPhone 16 Pro' })).toBeInTheDocument()
    })

    // Select 256GB (val-256) + Titan Đen (val-black) -> variant ID: var-256-black
    const btn256 = screen.getByRole('button', { name: '256GB' })
    fireEvent.click(btn256)

    // Click "Thêm vào giỏ hàng"
    const addToCartBtn = screen.getByRole('button', { name: /Thêm vào giỏ hàng/i })
    fireEvent.click(addToCartBtn)

    await waitFor(() => {
      expect(mockAddItem).toHaveBeenCalledWith('var-256-black')
    })
  })

  it('handles stock_limit error cleanly when cart addition exceeds available inventory (Req 5.4)', async () => {
    mockAddItem.mockRejectedValue(
      new ApiError(400, { code: 'stock_limit', message: 'Số lượng vượt quá tồn kho khả dụng' })
    )
    vi.mocked(catalogApi.getProduct).mockResolvedValue(mockMultiVariantProduct)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/products/p-multi']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'iPhone 16 Pro' })).toBeInTheDocument()
    })

    const addToCartBtn = screen.getByRole('button', { name: /Thêm vào giỏ hàng/i })
    fireEvent.click(addToCartBtn)

    await waitFor(() => {
      expect(mockAddItem).toHaveBeenCalledWith('var-128-black')
      expect(screen.getByText('Vượt quá tồn kho')).toBeInTheDocument()
    })
  })

  it('redirects unauthenticated user to login page when attempting to add to cart', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(catalogApi.getProduct).mockResolvedValue(mockMultiVariantProduct)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/products/p-multi']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/login" element={<div>Trang đăng nhập</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'iPhone 16 Pro' })).toBeInTheDocument()
    })

    const addToCartBtn = screen.getByRole('button', { name: /Thêm vào giỏ hàng/i })
    fireEvent.click(addToCartBtn)

    await waitFor(() => {
      expect(screen.getByText('Trang đăng nhập')).toBeInTheDocument()
    })
  })

  it('renders favorite toggle button with correct state on product detail page (Req 1.2, 4.1, 6.1)', async () => {
    vi.mocked(catalogApi.getProduct).mockResolvedValue(mockMultiVariantProduct)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/products/p-multi']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'iPhone 16 Pro' })).toBeInTheDocument()
    })

    const favButtons = screen.getAllByRole('button', { name: /Thêm iPhone 16 Pro vào yêu thích/i })
    expect(favButtons.length).toBeGreaterThanOrEqual(1)
    favButtons.forEach((btn) => {
      expect(btn).toHaveAttribute('aria-pressed', 'false')
    })

    fireEvent.click(favButtons[0])

    await waitFor(() => {
      expect(mockToggleFavorite).toHaveBeenCalledWith('p-multi')
    })
  })

  it('redirects guest to login when clicking favorite button on product detail page (Req 1.4, 1.5)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(catalogApi.getProduct).mockResolvedValue(mockMultiVariantProduct)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/products/p-multi']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/login" element={<div>Trang đăng nhập</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'iPhone 16 Pro' })).toBeInTheDocument()
    })

    const favButtons = screen.getAllByRole('button', { name: /Thêm iPhone 16 Pro vào yêu thích/i })
    fireEvent.click(favButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Trang đăng nhập')).toBeInTheDocument()
      expect(mockToggleFavorite).not.toHaveBeenCalled()
    })
  })

  it('renders ProductReviewsSection and reflects dynamic review rating in header', async () => {
    vi.mocked(catalogApi.getProduct).mockResolvedValue(mockMultiVariantProduct)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/products/p-multi']}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'iPhone 16 Pro' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Đánh giá từ khách hàng' })).toBeInTheDocument()
    })
  })

  describe('Flash Sale display and PD-4 effective price rule (Req 2.5)', () => {
    it('shows Flash Sale countdown box, sold progress, flash price, and struck regular price for selected variant', async () => {
      const endsAt = new Date(Date.now() + 3600 * 1000).toISOString()
      vi.mocked(catalogApi.getProduct).mockResolvedValue({
        ...mockMultiVariantProduct,
        variants: mockMultiVariantProduct.variants.map((v) =>
          v.id === 'var-128-black'
            ? {
                ...v,
                flashSale: {
                  flashSaleId: 'fs-1',
                  campaignName: 'Flash Sale Giờ Vàng',
                  flashPriceVnd: '22990000',
                  quota: 20,
                  soldQuantity: 7,
                  endsAt,
                },
              }
            : { ...v, flashSale: null }
        ),
      })

      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/products/p-multi']}>
            <Routes>
              <Route path="/products/:id" element={<ProductDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      )

      expect(await screen.findByText('Flash Sale Giờ Vàng')).toBeInTheDocument()
      expect(screen.getByTestId('pdp-flash-sale-box')).toBeInTheDocument()
      expect(screen.getByTestId('pdp-flash-sale-countdown')).toBeInTheDocument()
      expect(screen.getByText('Đã bán 7/20')).toBeInTheDocument()
      expect(screen.getAllByText(/22\.990\.000\s*₫/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByTestId('pdp-regular-price')).toHaveTextContent('25.990.000')
      expect(screen.getByTestId('pdp-regular-price')).toHaveClass('line-through')

      // Switch to 256GB (no flashSale) -> box disappears and regular price 28.990.000 shows
      fireEvent.click(screen.getByRole('button', { name: '256GB' }))
      await waitFor(() => {
        expect(screen.queryByTestId('pdp-flash-sale-box')).not.toBeInTheDocument()
        expect(screen.getAllByText(/28\.990\.000\s*₫/).length).toBeGreaterThanOrEqual(1)
      })
    })

    it('shows "Đã hết suất" and falls back to regular price when flashSale soldQuantity >= quota', async () => {
      const endsAt = new Date(Date.now() + 3600 * 1000).toISOString()
      vi.mocked(catalogApi.getProduct).mockResolvedValue({
        ...mockMultiVariantProduct,
        variants: mockMultiVariantProduct.variants.map((v) =>
          v.id === 'var-128-black'
            ? {
                ...v,
                flashSale: {
                  flashSaleId: 'fs-1',
                  campaignName: 'Flash Sale Giờ Vàng',
                  flashPriceVnd: '22990000',
                  quota: 20,
                  soldQuantity: 20,
                  endsAt,
                },
              }
            : { ...v, flashSale: null }
        ),
      })

      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/products/p-multi']}>
            <Routes>
              <Route path="/products/:id" element={<ProductDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      )

      expect(await screen.findByText('Đã hết suất')).toBeInTheDocument()
      expect(screen.getByText('GIÁ NIÊM YẾT CHÍNH HÃNG')).toBeInTheDocument()
      expect(screen.getAllByText(/25\.990\.000\s*₫/).length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText(/22\.990\.000\s*₫/)).not.toBeInTheDocument()
    })

    it('applies PD-4 rule: shows lower price between livePriceVnd and flashSale, and prefers live on ties', async () => {
      const endsAt = new Date(Date.now() + 3600 * 1000).toISOString()
      // Variant 128GB: flash (21.99M) < live (23.99M) -> Flash Sale wins
      // Variant 256GB: flash (24.99M) == live (24.99M) -> Live wins (tie goes to live)
      vi.mocked(catalogApi.getProduct).mockResolvedValue({
        ...mockMultiVariantProduct,
        variants: mockMultiVariantProduct.variants.map((v) => {
          if (v.id === 'var-128-black') {
            return {
              ...v,
              livePriceVnd: '23990000',
              liveRemaining: 5,
              flashSale: {
                flashSaleId: 'fs-1',
                campaignName: 'Flash Sale Giờ Vàng',
                flashPriceVnd: '21990000',
                quota: 20,
                soldQuantity: 5,
                endsAt,
              },
            }
          }
          if (v.id === 'var-256-black') {
            return {
              ...v,
              livePriceVnd: '24990000',
              liveRemaining: 3,
              flashSale: {
                flashSaleId: 'fs-1',
                campaignName: 'Flash Sale Giờ Vàng',
                flashPriceVnd: '24990000',
                quota: 20,
                soldQuantity: 5,
                endsAt,
              },
            }
          }
          return v
        }),
      })

      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/products/p-multi']}>
            <Routes>
              <Route path="/products/:id" element={<ProductDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      )

      // 128GB: Flash Sale wins (21.990.000)
      expect(await screen.findByTestId('pdp-flash-sale-box')).toBeInTheDocument()
      expect(screen.getAllByText(/21\.990\.000\s*₫/).length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('Giá live')).not.toBeInTheDocument()

      // Switch to 256GB: tie at 24.990.000 -> Live wins
      fireEvent.click(screen.getByRole('button', { name: '256GB' }))
      await waitFor(() => {
        expect(screen.getByText('Giá live')).toBeInTheDocument()
        expect(screen.getAllByText(/24\.990\.000\s*₫/).length).toBeGreaterThanOrEqual(1)
      })
    })

    it('falls back to live pricing when Flash Sale expires mid-view', async () => {
      vi.useFakeTimers()
      try {
        const baseTime = new Date('2026-11-19T10:00:00.000Z')
        vi.setSystemTime(baseTime)
        const endsAt = new Date(baseTime.getTime() + 2500).toISOString()

        vi.mocked(catalogApi.getProduct).mockResolvedValue({
          ...mockMultiVariantProduct,
          variants: mockMultiVariantProduct.variants.map((v) =>
            v.id === 'var-128-black'
              ? {
                  ...v,
                  livePriceVnd: '23990000',
                  liveRemaining: 5,
                  flashSale: {
                    flashSaleId: 'fs-1',
                    campaignName: 'Flash Sale Sắp Hết',
                    flashPriceVnd: '21990000',
                    quota: 20,
                    soldQuantity: 5,
                    endsAt,
                  },
                }
              : v
          ),
        })

        render(
          <ToastProvider>
            <MemoryRouter initialEntries={['/products/p-multi']}>
              <Routes>
                <Route path="/products/:id" element={<ProductDetailPage />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        )

        await act(async () => {
          await Promise.resolve()
          await Promise.resolve()
        })

        // Initially Flash Sale (21.990.000) wins over Live (23.990.000)
        expect(screen.getByTestId('pdp-flash-sale-box')).toBeInTheDocument()
        expect(screen.getAllByText(/21\.990\.000\s*₫/).length).toBeGreaterThanOrEqual(1)
        expect(screen.queryByText('Giá live')).not.toBeInTheDocument()

        // Advance past endsAt so Flash Sale expires mid-view
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000)
        })

        // Flash sale box disappears and pricing falls back to Giá live (23.990.000), not regular (25.990.000)
        expect(screen.queryByTestId('pdp-flash-sale-box')).not.toBeInTheDocument()
        expect(screen.getByText('Giá live')).toBeInTheDocument()
        expect(screen.getAllByText(/23\.990\.000\s*₫/).length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('Còn 5 suất giá live')).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('Structured technical specs tab (Req 5.3)', () => {
    it('renders actual product.specs groups and rows in order without simulated fallback specs', async () => {
      vi.mocked(catalogApi.getProduct).mockResolvedValue({
        ...mockMultiVariantProduct,
        specs: [
          {
            group: 'Màn hình',
            items: [
              { label: 'Kích thước & Tấm nền', value: '6.3 inch, LTPO Super Retina XDR OLED' },
              { label: 'Tần số quét', value: 'ProMotion 1–120Hz' },
            ],
          },
          {
            group: 'Hiệu năng & Chipset',
            items: [{ label: 'Chipset', value: 'Apple A18 Pro (3nm)' }],
          },
        ],
      })

      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/products/p-multi']}>
            <Routes>
              <Route path="/products/:id" element={<ProductDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      )

      expect(await screen.findByText('Màn hình')).toBeInTheDocument()
      expect(screen.getByText('Kích thước & Tấm nền')).toBeInTheDocument()
      expect(screen.getByText('6.3 inch, LTPO Super Retina XDR OLED')).toBeInTheDocument()
      expect(screen.getByText('Tần số quét')).toBeInTheDocument()
      expect(screen.getByText('ProMotion 1–120Hz')).toBeInTheDocument()
      expect(screen.getByText('Hiệu năng & Chipset')).toBeInTheDocument()
      expect(screen.getByText('Chipset')).toBeInTheDocument()
      expect(screen.getByText('Apple A18 Pro (3nm)')).toBeInTheDocument()

      // Simulated hardcoded strings from old getPhoneTechSpecs must NOT appear
      expect(screen.queryByText(/Apple A18 Pro \(3nm thế hệ 2\) hiệu năng cao/)).not.toBeInTheDocument()
      expect(screen.queryByText(/6\.3" Super Retina XDR OLED 120Hz ProMotion/)).not.toBeInTheDocument()
    })

    it('renders clear Vietnamese empty state when product.specs is empty or undefined', async () => {
      vi.mocked(catalogApi.getProduct).mockResolvedValue({
        ...mockMultiVariantProduct,
        specs: [],
      })

      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/products/p-multi']}>
            <Routes>
              <Route path="/products/:id" element={<ProductDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      )

      expect(await screen.findByText(/chưa có thông số kỹ thuật/i)).toBeInTheDocument()
      expect(screen.queryByText(/Apple A18 Pro \(3nm thế hệ 2\)/)).not.toBeInTheDocument()
    })

    it('toggles product in CompareContext when clicking So sánh button on ProductDetailPage (Req 5.4)', async () => {
      window.sessionStorage.clear()
      vi.mocked(catalogApi.getProduct).mockResolvedValue(mockMultiVariantProduct)

      render(
        <ToastProvider>
          <CompareProvider>
            <MemoryRouter initialEntries={['/products/p-multi']}>
              <Routes>
                <Route path="/products/:id" element={<ProductDetailPage />} />
              </Routes>
            </MemoryRouter>
          </CompareProvider>
        </ToastProvider>
      )

      const compareBtn = await screen.findByRole('button', {
        name: /Thêm iPhone 16 Pro vào so sánh/i,
      })
      expect(compareBtn).toHaveAttribute('aria-pressed', 'false')

      fireEvent.click(compareBtn)

      await waitFor(() => {
        const activeBtn = screen.getByRole('button', {
          name: /Bỏ iPhone 16 Pro khỏi so sánh/i,
        })
        expect(activeBtn).toHaveAttribute('aria-pressed', 'true')
        expect(JSON.parse(window.sessionStorage.getItem(COMPARE_STORAGE_KEY) || '[]')).toHaveLength(1)
      })
    })
  })
})
