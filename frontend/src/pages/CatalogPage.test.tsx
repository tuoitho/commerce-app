import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { CatalogPage } from './CatalogPage'
import { catalogApi } from '@/api/catalog'
import type { ProductSummary, ProductFilterParams } from '@/api/types'

vi.mock('@/api/catalog', () => ({
  catalogApi: {
    listCategories: vi.fn(),
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
    vi.mocked(catalogApi.listCategories).mockResolvedValue([
      { id: 'cat-phone', name: 'Điện thoại' },
      { id: 'cat-computer', name: 'Máy tính' },
    ])
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
})
