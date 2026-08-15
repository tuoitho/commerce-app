import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CatalogPage } from './CatalogPage'
import { catalogApi } from '@/api/catalog'

vi.mock('@/api/catalog', () => ({
  catalogApi: {
    listCategories: vi.fn(),
    listProducts: vi.fn(),
  },
}))

describe('CatalogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(catalogApi.listCategories).mockResolvedValue({
      categories: [
        { id: 'cat-apple', name: 'Apple' },
        { id: 'cat-xiaomi', name: 'Xiaomi' },
      ],
    })
  })

  it('renders products and categories properly', async () => {
    vi.mocked(catalogApi.listProducts).mockResolvedValue({
      products: [
        {
          id: 'p-1',
          name: 'iPhone 15 Pro Max',
          model: 'A3106',
          brand: { id: 'cat-apple', name: 'Apple' },
          category: { id: 'cat-phone', name: 'Điện thoại' },
          minPriceVnd: '29990000',
          maxPriceVnd: '35990000',
          price: '29990000',
          currency: 'VND',
          primaryImageUrl: '',
          inStock: true,
        },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/products']}>
        <CatalogPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getAllByText('iPhone 15 Pro Max').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Apple').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Xiaomi').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders empty state when no products found', async () => {
    vi.mocked(catalogApi.listProducts).mockResolvedValue({
      products: [],
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
})
