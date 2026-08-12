import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchProduct } from '../api/catalog'
import { ApiError } from '../api/client'
import ProductDetailPage from './ProductDetailPage'
import type { ProductDetail } from '../api/catalog'

vi.mock('../api/catalog', () => ({ fetchProduct: vi.fn() }))

const mockFetchProduct = vi.mocked(fetchProduct)

function makeDetail(opts: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: 'p1',
    name: 'Wireless Mouse',
    description: 'A mouse without wires.',
    category: { id: 'c1', name: 'Electronics' },
    price: '24.99',
    currency: 'USD',
    imageUrls: ['https://example.com/mouse.jpg'],
    stockQuantity: 10,
    inStock: true,
    createdAt: '2026-08-12T00:00:00Z',
    updatedAt: '2026-08-12T00:00:00Z',
    ...opts,
  }
}

function renderDetail(id = 'p1') {
  return render(
    <MemoryRouter initialEntries={[`/products/${id}`]}>
      <Routes>
        <Route path="/products/:id" element={<ProductDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProductDetailPage', () => {
  beforeEach(() => {
    mockFetchProduct.mockReset()
  })

  afterEach(() => {
    mockFetchProduct.mockReset()
  })

  it('shows a loading state while fetching', () => {
    mockFetchProduct.mockReturnValue(new Promise(() => {}))
    renderDetail()
    expect(screen.getByText(/loading product/i)).toBeInTheDocument()
  })

  it('renders the complete product detail', async () => {
    mockFetchProduct.mockResolvedValue(makeDetail())
    renderDetail()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Wireless Mouse' })).toBeInTheDocument())
    expect(screen.getByText(/a mouse without wires/i)).toBeInTheDocument()
    expect(screen.getByText('$24.99')).toBeInTheDocument()
    expect(screen.getByText(/in stock \(10\)/i)).toBeInTheDocument()
    expect(screen.getByText('Electronics')).toBeInTheDocument()
  })

  it('renders out-of-stock state', async () => {
    mockFetchProduct.mockResolvedValue(makeDetail({ stockQuantity: 0, inStock: false }))
    renderDetail()
    await waitFor(() => expect(screen.getByText(/out of stock/i)).toBeInTheDocument())
  })

  it('shows a generic error state for failed requests', async () => {
    mockFetchProduct.mockRejectedValue(new ApiError(500, { code: 'internal', message: 'boom' }))
    renderDetail()
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /back to catalog/i })).toBeInTheDocument()
  })

  it('shows a product-not-found state with navigation back to the catalog', async () => {
    mockFetchProduct.mockRejectedValue(
      new ApiError(404, { code: 'product_not_found', message: 'product not found' }),
    )
    renderDetail()
    await waitFor(() => expect(screen.getByText(/product not found/i)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /back to catalog/i })).toHaveAttribute('href', '/products')
  })
})
