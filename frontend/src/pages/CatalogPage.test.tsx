import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchCategories, fetchProducts } from '../api/catalog'
import CatalogPage from './CatalogPage'
import type { ProductSummary } from '../api/catalog'

vi.mock('../api/catalog', () => ({
  fetchCategories: vi.fn(),
  fetchProducts: vi.fn(),
  isCanonicalCategoryId: (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
}))

const mockFetchCategories = vi.mocked(fetchCategories)
const mockFetchProducts = vi.mocked(fetchProducts)

const APPLE_ID = '00000000-0000-4000-8000-000000000001'
const XIAOMI_ID = '00000000-0000-4000-8000-000000000002'
const UNKNOWN_ID = '33333333-3333-3333-3333-333333333333'

const CATEGORIES = [
  { id: APPLE_ID, name: 'Apple' },
  { id: XIAOMI_ID, name: 'Xiaomi' },
]

function makeProduct(id: string, name: string, opts: Partial<ProductSummary> = {}): ProductSummary {
  return {
    id,
    name,
    model: 'M1',
    brand: { id: APPLE_ID, name: 'Apple' },
    minPriceVnd: '24990000',
    maxPriceVnd: '24990000',
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

function renderCatalog(initialEntries: string | string[] = ['/products']) {
  const entries = typeof initialEntries === 'string' ? [initialEntries] : initialEntries
  return render(
    <MemoryRouter initialEntries={entries}>
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
    expect(screen.getAllByText(/24\.990\.000/)).toHaveLength(2)
    expect(screen.getByText(/2 results/i)).toBeInTheDocument()
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

  it('restores direct multi-brand, price, stock and search criteria', async () => {
    renderCatalog(`/products?q=iphone&category_id=${APPLE_ID}&category_id=${XIAOMI_ID}&min_price=100&max_price=500&in_stock=true`)
    await flushDebounce()

    expect(screen.getByDisplayValue('iphone')).toBeInTheDocument()
    expect(screen.getByLabelText('Apple')).toBeChecked()
    expect(screen.getByLabelText('Xiaomi')).toBeChecked()
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
    expect(screen.getByDisplayValue('500')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'In stock' })).toBeChecked()
    expect(mockFetchProducts).toHaveBeenLastCalledWith({
      q: 'iphone', categoryIds: [APPLE_ID, XIAOMI_ID], minPrice: '100', maxPrice: '500', inStock: true,
    })
  })

  it('updates repeated brand IDs without losing the combined search criteria', async () => {
    renderCatalog(['/products?q=phone&min_price=100'])
    await flushDebounce()

    fireEvent.click(screen.getByLabelText('Apple'))
    fireEvent.click(screen.getByLabelText('Xiaomi'))
    expect(screen.getByTestId('location').textContent).toContain('q=phone')
    expect(screen.getByTestId('location').textContent).toContain('min_price=100')
    expect(screen.getByTestId('location').textContent).toContain(`category_id=${APPLE_ID}`)
    expect(screen.getByTestId('location').textContent).toContain(`category_id=${XIAOMI_ID}`)
  })

  it('offers any, in-stock and out-of-stock filters and restores false from the URL', async () => {
    renderCatalog(['/products?in_stock=false'])
    await flushDebounce()

    expect(screen.getByRole('radio', { name: 'Any stock status' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'In stock' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Out of stock' })).toBeChecked()
    expect(mockFetchProducts).toHaveBeenLastCalledWith(expect.objectContaining({ inStock: false }))

    fireEvent.click(screen.getByRole('radio', { name: 'Any stock status' }))
    expect(screen.getByTestId('location').textContent).not.toContain('in_stock=')
    await flushDebounce()
    expect(mockFetchProducts).toHaveBeenLastCalledWith(expect.objectContaining({ inStock: undefined }))
  })

  it('filters malformed category IDs but keeps valid nonexistent IDs shareable', async () => {
    renderCatalog(`/products?category_id=malformed&category_id=${UNKNOWN_ID}`)
    await flushDebounce()

    expect(screen.getByTestId('location').textContent).toContain('category_id=malformed')
    expect(screen.getByTestId('location').textContent).toContain(`category_id=${UNKNOWN_ID}`)
    expect(mockFetchProducts).toHaveBeenLastCalledWith({ categoryIds: [UNKNOWN_ID], q: undefined, minPrice: undefined, maxPrice: undefined, inStock: undefined })
    expect(screen.getByText(/0 results/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('resets all filters from the URL and refetches with no criteria', async () => {
    renderCatalog(`/products?q=mouse&category_id=${APPLE_ID}&min_price=10&in_stock=true`)
    await flushDebounce()
    const reset = screen.getByRole('button', { name: /reset filters/i })
    fireEvent.click(reset)
    expect(screen.getByTestId('location').textContent).toBe('')
    await flushDebounce()
    expect(mockFetchProducts).toHaveBeenLastCalledWith({
      q: undefined,
      categoryIds: [],
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
