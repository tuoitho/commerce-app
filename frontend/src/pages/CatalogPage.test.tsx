import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchCategories, fetchProducts } from '../api/catalog'
import CatalogPage from './CatalogPage'
import type { ProductSummary } from '../api/catalog'

vi.mock('../api/catalog', () => ({
  fetchCategories: vi.fn(),
  fetchProducts: vi.fn(),
}))

const mockFetchCategories = vi.mocked(fetchCategories)
const mockFetchProducts = vi.mocked(fetchProducts)

const CATEGORIES = [
  { id: 'c1', name: 'Electronics' },
  { id: 'c2', name: 'Books' },
]

function makeProduct(id: string, name: string, opts: Partial<ProductSummary> = {}): ProductSummary {
  return {
    id,
    name,
    category: { id: 'c1', name: 'Electronics' },
    price: '24.99',
    currency: 'USD',
    primaryImageUrl: 'https://example.com/img.jpg',
    inStock: true,
    ...opts,
  }
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.search}</div>
}

function DetailStub() {
  const { id } = useParams()
  return <div>DETAIL {id}</div>
}

function renderCatalog(initialEntries = ['/products']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/products" element={<CatalogPage />} />
        <Route path="/products/:id" element={<DetailStub />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

async function flushDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
}

describe('CatalogPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetchCategories.mockReset()
    mockFetchProducts.mockReset()
    mockFetchCategories.mockResolvedValue(CATEGORIES)
    mockFetchProducts.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows a loading state until the request completes', async () => {
    mockFetchProducts.mockReturnValue(new Promise(() => {}))
    renderCatalog()
    expect(screen.getByText(/loading products/i)).toBeInTheDocument()
    await flushDebounce()
    expect(screen.getByText(/loading products/i)).toBeInTheDocument()
  })

  it('renders product summaries returned for the active criteria', async () => {
    mockFetchProducts.mockResolvedValue([makeProduct('p1', 'Wireless Mouse'), makeProduct('p2', 'Keyboard')])
    renderCatalog()
    await flushDebounce()
    expect(screen.getByText('Wireless Mouse')).toBeInTheDocument()
    expect(screen.getByText('Keyboard')).toBeInTheDocument()
    expect(screen.getAllByText('$24.99')).toHaveLength(2)
  })

  it('shows a no-results state that preserves the active criteria', async () => {
    renderCatalog(['/products?q=nope'])
    await flushDebounce()
    expect(screen.getByText(/no products match/i)).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toContain('q=nope')
  })

  it('shows an error state with a retry action that refetches', async () => {
    mockFetchProducts.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([makeProduct('p1', 'Mouse')])
    renderCatalog()
    await flushDebounce()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await flushDebounce()
    expect(screen.getByText('Mouse')).toBeInTheDocument()
  })

  it('persists typed search text in the URL and refetches', async () => {
    renderCatalog()
    await flushDebounce()
    const input = screen.getByPlaceholderText(/search products/i)
    fireEvent.change(input, { target: { value: 'wireless' } })
    expect(screen.getByTestId('location').textContent).toContain('q=wireless')
    await flushDebounce()
    expect(mockFetchProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'wireless' }),
    )
  })

  it('resets all filters from the URL and refetches with no criteria', async () => {
    renderCatalog(['/products?q=mouse&category_id=c1&min_price=10&in_stock=true'])
    await flushDebounce()
    const reset = screen.getByRole('button', { name: /reset filters/i })
    fireEvent.click(reset)
    expect(screen.getByTestId('location').textContent).toBe('')
    await flushDebounce()
    expect(mockFetchProducts).toHaveBeenLastCalledWith({
      q: undefined,
      categoryId: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      inStock: undefined,
    })
  })

  it('navigates from a product summary to its detail route', async () => {
    mockFetchProducts.mockResolvedValue([makeProduct('p1', 'Wireless Mouse')])
    renderCatalog()
    await flushDebounce()
    fireEvent.click(screen.getByText('Wireless Mouse'))
    expect(screen.getByText('DETAIL p1')).toBeInTheDocument()
  })
})
