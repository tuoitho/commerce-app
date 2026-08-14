import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchFeaturedProducts, type ProductSummary } from '../api/catalog'
import HomePage from './HomePage'

vi.mock('../api/catalog', () => ({
  fetchFeaturedProducts: vi.fn(),
}))

const mockFetchFeaturedProducts = vi.mocked(fetchFeaturedProducts)
const product: ProductSummary = {
  id: 'p1',
  name: 'iPhone 16 Pro',
  model: 'A3294',
  brand: { id: 'apple', name: 'Apple' },
  minPriceVnd: '28990000',
  maxPriceVnd: '40990000',
  primaryImageUrl: '',
  inStock: true,
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/products" element={<div>Catalog page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('HomePage', () => {
  beforeEach(() => {
    mockFetchFeaturedProducts.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the public hero, CTA and loading live status', () => {
    mockFetchFeaturedProducts.mockReturnValue(new Promise(() => {}))
    renderHome()

    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByText(/phone store, made simple/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /explore phones/i })).toHaveAttribute('href', '/products')
    expect(screen.getByRole('status')).toHaveTextContent(/loading featured phones/i)
  })

  it('renders featured products after loading', async () => {
    mockFetchFeaturedProducts.mockResolvedValue([product])
    renderHome()

    expect(await screen.findByText('iPhone 16 Pro')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /featured phones/i })).toBeInTheDocument()
  })

  it('shows an empty state with a catalog link', async () => {
    mockFetchFeaturedProducts.mockResolvedValue([])
    renderHome()

    expect(await screen.findByText(/no featured phones/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /browse all phones/i })).toHaveAttribute('href', '/products')
  })

  it('shows an error live status and retries the request', async () => {
    mockFetchFeaturedProducts.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([product])
    renderHome()

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load featured phones/i)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('iPhone 16 Pro')).toBeInTheDocument()
    expect(mockFetchFeaturedProducts).toHaveBeenCalledTimes(2)
  })

  it('announces retry loading feedback', async () => {
    let resolveRequest: (value: ProductSummary[]) => void = () => undefined
    mockFetchFeaturedProducts.mockRejectedValueOnce(new Error('boom')).mockReturnValueOnce(new Promise((resolve) => {
      resolveRequest = resolve
    }))
    renderHome()

    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/loading featured phones/i)
    await act(async () => resolveRequest([]))
  })
})
