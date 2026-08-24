import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { CatalogPage } from './CatalogPage'
import { catalogApi } from '@/api/catalog'
import type { ProductSummary, ProductFilterParams } from '@/api/types'
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

vi.mock('@/api/catalog', () => ({
  catalogApi: {
    listCategories: vi.fn(),
    listBrands: vi.fn(),
    listProducts: vi.fn(),
    listProductsWithMeta: vi.fn(),
  },
}))

function createDummyProducts(count: number): ProductSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `prod-${i + 1}`,
    name: `Phone Model ${i + 1}`,
    model: `MOD-${i + 1}`,
    brand: 'Apple',
    category: { id: 'cat-phone', name: 'Điện thoại' },
    minPriceVnd: `${(i + 1) * 1000000}`,
    maxPriceVnd: `${(i + 1) * 1000000 + 500000}`,
    price: `${(i + 1) * 1000000}`,
    currency: 'VND',
    primaryImageUrl: '',
    inStock: true,
  }))
}

describe('CatalogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    vi.mocked(catalogApi.listCategories).mockResolvedValue([
      { id: 'cat-phone', name: 'Điện thoại' },
      { id: 'cat-computer', name: 'Máy tính' },
    ])
    vi.mocked(catalogApi.listBrands).mockResolvedValue(['Apple', 'Samsung', 'Xiaomi'])
  })

  it('renders products and categories properly', async () => {
    vi.mocked(catalogApi.listProductsWithMeta).mockResolvedValue({
      data: [
        {
          id: 'p-1',
          name: 'iPhone 15 Pro Max',
          model: 'A3106',
          brand: 'Apple',
          category: { id: 'cat-phone', name: 'Điện thoại' },
          minPriceVnd: '29990000',
          maxPriceVnd: '35990000',
          price: '29990000',
          currency: 'VND',
          primaryImageUrl: '',
          inStock: true,
        },
      ],
      meta: {
        timestamp: '2026-08-16T00:00:00.000Z',
        pagination: {
          page: 1,
          limit: 6,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    render(
      <MemoryRouter initialEntries={['/products']}>
        <CatalogPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getAllByText('iPhone 15 Pro Max').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Apple').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Điện thoại').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Máy tính').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders empty state when no products found', async () => {
    vi.mocked(catalogApi.listProductsWithMeta).mockResolvedValue({
      data: [],
      meta: {
        timestamp: '2026-08-16T00:00:00.000Z',
        pagination: {
          page: 1,
          limit: 6,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    render(
      <MemoryRouter initialEntries={['/products?q=nonexistent']}>
        <CatalogPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy sản phẩm')).toBeInTheDocument()
    })
  })

  it('paginates products correctly when more than 6 items exist', async () => {
    const tenProducts = createDummyProducts(10)

    vi.mocked(catalogApi.listProductsWithMeta).mockImplementation(async (filter: ProductFilterParams = {}) => {
      const page = filter.page || 1
      const limit = filter.limit || 6
      const start = (page - 1) * limit
      const data = tenProducts.slice(start, start + limit)
      return {
        data,
        meta: {
          timestamp: '2026-08-16T00:00:00.000Z',
          pagination: {
            page,
            limit,
            total: 10,
            totalPages: 2,
            hasNext: page === 1,
            hasPrev: page === 2,
          },
        },
        message: '',
      }
    })

    render(
      <MemoryRouter initialEntries={['/products']}>
        <Routes>
          <Route path="/products" element={<CatalogPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      // First page shows Phone Model 1 through 6
      expect(screen.getByText('Phone Model 1')).toBeInTheDocument()
      expect(screen.getByText('Phone Model 6')).toBeInTheDocument()
      // Does not show Phone Model 7 on page 1
      expect(screen.queryByText('Phone Model 7')).not.toBeInTheDocument()
    })

    // Verify pagination controls are present
    const paginationNav = screen.getByRole('navigation', { name: /phân trang/i })
    expect(paginationNav).toBeInTheDocument()

    // Page 1 button is active, Previous button is disabled
    const prevButton = screen.getByRole('button', { name: /trang trước/i })
    expect(prevButton).toBeDisabled()

    const nextButton = screen.getByRole('button', { name: /trang sau/i })
    expect(nextButton).not.toBeDisabled()

    // Click page 2
    const page2Button = screen.getByRole('button', { name: /trang 2/i })
    fireEvent.click(page2Button)

    await waitFor(() => {
      expect(screen.queryByText('Phone Model 1')).not.toBeInTheDocument()
      expect(screen.getByText('Phone Model 7')).toBeInTheDocument()
      expect(screen.getByText('Phone Model 10')).toBeInTheDocument()
    })
  })

  it('loads the correct page from URL query parameter with backend pagination', async () => {
    const tenProducts = createDummyProducts(10)

    vi.mocked(catalogApi.listProductsWithMeta).mockImplementation(async (filter: ProductFilterParams = {}) => {
      const page = filter.page || 1
      const limit = filter.limit || 6
      const start = (page - 1) * limit
      const data = tenProducts.slice(start, start + limit)
      return {
        data,
        meta: {
          timestamp: '2026-08-16T00:00:00.000Z',
          pagination: {
            page,
            limit,
            total: 10,
            totalPages: 2,
            hasNext: page === 1,
            hasPrev: page === 2,
          },
        },
        message: '',
      }
    })

    render(
      <MemoryRouter initialEntries={['/products?page=2']}>
        <Routes>
          <Route path="/products" element={<CatalogPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Phone Model 7')).toBeInTheDocument()
      expect(screen.getByText('Phone Model 10')).toBeInTheDocument()
      expect(screen.queryByText('Phone Model 1')).not.toBeInTheDocument()
    })
  })

  it('renders multi-variant products with price ranges and in-stock / out-of-stock badges', async () => {
    vi.mocked(catalogApi.listProductsWithMeta).mockResolvedValue({
      data: [
        {
          id: 'p-in-stock',
          name: 'iPhone 16 Pro',
          model: 'A3293',
          brand: 'Apple',
          category: { id: 'cat-phone', name: 'Điện thoại' },
          minPriceVnd: '28990000',
          maxPriceVnd: '34990000',
          price: '28990000',
          currency: 'VND',
          primaryImageUrl: '',
          inStock: true,
        },
        {
          id: 'p-out-of-stock',
          name: 'Xiaomi 15 Ultra',
          model: 'X15U',
          brand: 'Xiaomi',
          category: { id: 'cat-phone', name: 'Điện thoại' },
          minPriceVnd: '24990000',
          maxPriceVnd: '24990000',
          price: '24990000',
          currency: 'VND',
          primaryImageUrl: '',
          inStock: false,
        },
      ],
      meta: {
        timestamp: '2026-08-16T00:00:00.000Z',
        pagination: {
          page: 1,
          limit: 6,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    render(
      <MemoryRouter initialEntries={['/products']}>
        <CatalogPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('iPhone 16 Pro')).toBeInTheDocument()
      expect(screen.getByText(/28\.990\.000\s*₫\s*-\s*34\.990\.000\s*₫/)).toBeInTheDocument()
      expect(screen.getByText('Còn hàng')).toBeInTheDocument()

      expect(screen.getByText('Xiaomi 15 Ultra')).toBeInTheDocument()
      expect(screen.getByText('Hết hàng')).toBeInTheDocument()
    })
  })

  it('renders brand options from API in the Thương hiệu filter section (Req 1.1, 1.4, 7.1, 7.2)', async () => {
    vi.mocked(catalogApi.listProductsWithMeta).mockResolvedValue({
      data: [],
      meta: {
        timestamp: '2026-08-16T00:00:00.000Z',
        pagination: { page: 1, limit: 6, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: '',
    })

    render(
      <MemoryRouter initialEntries={['/products']}>
        <CatalogPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Thương hiệu')).toBeInTheDocument()
      expect(screen.getByLabelText('Apple')).toBeInTheDocument()
      expect(screen.getByLabelText('Samsung')).toBeInTheDocument()
      expect(screen.getByLabelText('Xiaomi')).toBeInTheDocument()
    })
  })

  it('toggling a brand updates URL searchParams and re-fetches products with brand param (Req 2.1, 3.1, 3.2, 6.1)', async () => {
    vi.mocked(catalogApi.listProductsWithMeta).mockResolvedValue({
      data: [],
      meta: {
        timestamp: '2026-08-16T00:00:00.000Z',
        pagination: { page: 1, limit: 6, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: '',
    })

    render(
      <MemoryRouter initialEntries={['/products']}>
        <CatalogPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Apple')).toBeInTheDocument()
    })

    const appleCheckbox = screen.getByLabelText('Apple')
    fireEvent.click(appleCheckbox)

    await waitFor(() => {
      expect(catalogApi.listProductsWithMeta).toHaveBeenLastCalledWith(
        expect.objectContaining({
          brand: ['Apple'],
        })
      )
    })

    // Click Xiaomi too (multi-select)
    const xiaomiCheckbox = screen.getByLabelText('Xiaomi')
    fireEvent.click(xiaomiCheckbox)

    await waitFor(() => {
      expect(catalogApi.listProductsWithMeta).toHaveBeenLastCalledWith(
        expect.objectContaining({
          brand: ['Apple', 'Xiaomi'],
        })
      )
    })
  })

  it('changing brand selection resets to page 1 (Req 4.1)', async () => {
    vi.mocked(catalogApi.listProductsWithMeta).mockResolvedValue({
      data: [],
      meta: {
        timestamp: '2026-08-16T00:00:00.000Z',
        pagination: { page: 2, limit: 6, total: 10, totalPages: 2, hasNext: false, hasPrev: true },
      },
      message: '',
    })

    render(
      <MemoryRouter initialEntries={['/products?page=2']}>
        <CatalogPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Samsung')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Samsung'))

    await waitFor(() => {
      expect(catalogApi.listProductsWithMeta).toHaveBeenLastCalledWith(
        expect.objectContaining({
          brand: ['Samsung'],
          page: 1,
        })
      )
    })
  })

  it('deep linking: opening catalog URL with brand parameter applies selection and requests brand-filtered products (Req 3.3)', async () => {
    vi.mocked(catalogApi.listProductsWithMeta).mockResolvedValue({
      data: [],
      meta: {
        timestamp: '2026-08-16T00:00:00.000Z',
        pagination: { page: 1, limit: 6, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: '',
    })

    render(
      <MemoryRouter initialEntries={['/products?brand=Apple&brand=Xiaomi']}>
        <CatalogPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(catalogApi.listProductsWithMeta).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: ['Apple', 'Xiaomi'],
        })
      )
      const appleCheckbox = screen.getByLabelText('Apple') as HTMLInputElement
      const xiaomiCheckbox = screen.getByLabelText('Xiaomi') as HTMLInputElement
      const samsungCheckbox = screen.getByLabelText('Samsung') as HTMLInputElement

      expect(appleCheckbox.getAttribute('aria-checked') === 'true' || appleCheckbox.checked).toBe(true)
      expect(xiaomiCheckbox.getAttribute('aria-checked') === 'true' || xiaomiCheckbox.checked).toBe(true)
      expect(samsungCheckbox.getAttribute('aria-checked') === 'false' || !samsungCheckbox.checked).toBe(true)
    })
  })

  it('handles brand list failure with retry affordance while products still render (Req 7.4)', async () => {
    vi.mocked(catalogApi.listBrands).mockRejectedValueOnce(new Error('Network error'))
    vi.mocked(catalogApi.listProductsWithMeta).mockResolvedValue({
      data: [
        {
          id: 'p-1',
          name: 'iPhone 15',
          model: 'A3106',
          brand: 'Apple',
          category: { id: 'cat-phone', name: 'Điện thoại' },
          minPriceVnd: '20000000',
          maxPriceVnd: '20000000',
          price: '20000000',
          currency: 'VND',
          primaryImageUrl: '',
          inStock: true,
        },
      ],
      meta: {
        timestamp: '2026-08-16T00:00:00.000Z',
        pagination: { page: 1, limit: 6, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: '',
    })

    render(
      <MemoryRouter initialEntries={['/products']}>
        <CatalogPage />
      </MemoryRouter>
    )

    // Products still render
    await waitFor(() => {
      expect(screen.getByText('iPhone 15')).toBeInTheDocument()
      expect(screen.getByText('Không thể tải danh sách thương hiệu.')).toBeInTheDocument()
    })

    // Retry button is available
    const retryBtn = screen.getByRole('button', { name: /thử lại/i })
    expect(retryBtn).toBeInTheDocument()

    // When clicked, retry calls listBrands again
    vi.mocked(catalogApi.listBrands).mockResolvedValueOnce(['Apple', 'Samsung'])
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByLabelText('Apple')).toBeInTheDocument()
      expect(screen.getByLabelText('Samsung')).toBeInTheDocument()
    })
  })
})

