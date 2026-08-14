import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchProduct } from '../api/catalog'
import { ApiError } from '../api/client'
import ProductDetailPage from './ProductDetailPage'
import type { ProductDetail } from '../api/catalog'
import { useAuth } from '../auth/AuthProvider'
import { useCart } from '../cart/CartProvider'

vi.mock('../api/catalog', () => ({ fetchProduct: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: vi.fn() }))
vi.mock('../cart/CartProvider', () => ({ useCart: vi.fn() }))

const mockFetchProduct = vi.mocked(fetchProduct)
const mockUseAuth = vi.mocked(useAuth)
const mockUseCart = vi.mocked(useCart)

const groups = [
  { id: '11111111-1111-4111-8111-111111111111', label: 'Color', position: 1, values: [{ id: '21111111-1111-4111-8111-111111111111', label: 'Black' }, { id: '31111111-1111-4111-8111-111111111111', label: 'Silver' }] },
  { id: '41111111-1111-4111-8111-111111111111', label: 'Storage', position: 2, values: [{ id: '51111111-1111-4111-8111-111111111111', label: '128 GB' }, { id: '61111111-1111-4111-8111-111111111111', label: '256 GB' }] },
]

function makeDetail(opts: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: 'p1',
    name: 'Wireless Mouse',
    description: 'A mouse without wires.',
    model: 'M1',
    brand: { id: 'c1', name: 'Apple' },
    imageUrls: ['https://example.com/mouse.jpg'],
    minPriceVnd: '24990000',
    maxPriceVnd: '24990000',
    featured: false,
    optionGroups: [],
    variants: [{ id: 'v1', optionValueIds: {}, priceVnd: '24990000', stockQuantity: 10n }],
    createdAt: '2026-08-12T00:00:00Z',
    updatedAt: '2026-08-12T00:00:00Z',
    ...opts,
  }
}

function renderDetail(id = 'p1', search = '') {
  function LoginProbe() {
    const location = useLocation()
    return <div>{location.state?.from?.pathname}{location.state?.from?.search}</div>
  }

  return render(
    <MemoryRouter initialEntries={[`/products/${id}${search}`]}>
      <Routes>
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProductDetailPage', () => {
  beforeEach(() => {
    mockFetchProduct.mockReset()
    mockUseAuth.mockReturnValue({ user: { id: 'u1', email: 'user@example.com' }, accessToken: 'token', loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn() })
    mockUseCart.mockReturnValue({ cart: null, loading: false, pending: false, error: null, reload: vi.fn(), addVariant: vi.fn().mockResolvedValue(true), setQuantity: vi.fn(), setSelected: vi.fn(), setAllSelected: vi.fn(), remove: vi.fn() })
  })

  afterEach(() => {
    mockFetchProduct.mockReset()
    vi.clearAllMocks()
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
    expect(screen.getByText(/24\.990\.000/)).toBeInTheDocument()
    expect(screen.getByText(/in stock/i)).toBeInTheDocument()
    expect(screen.getByText(/Apple M1/)).toBeInTheDocument()
  })

  it('renders out-of-stock state', async () => {
    mockFetchProduct.mockResolvedValue(makeDetail({ variants: [{ id: 'v1', optionValueIds: {}, priceVnd: '24990000', stockQuantity: 0n }] }))
    renderDetail()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/out of stock/i))
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

  it('renders options and updates price and stock for the selected variant', async () => {
    mockFetchProduct.mockResolvedValue(makeDetail({
      optionGroups: groups,
      minPriceVnd: '100',
      maxPriceVnd: '200',
      variants: [
        { id: 'v1', optionValueIds: { [groups[0].id]: groups[0].values[0].id, [groups[1].id]: groups[1].values[0].id }, priceVnd: '100', stockQuantity: 3n },
        { id: 'v2', optionValueIds: { [groups[0].id]: groups[0].values[1].id, [groups[1].id]: groups[1].values[1].id }, priceVnd: '200', stockQuantity: 0n },
      ],
    }))
    renderDetail()
    await waitFor(() => expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Black' }))
    fireEvent.click(screen.getByRole('button', { name: '128 GB' }))
    expect(screen.getByText(/100/)).toBeInTheDocument()
    expect(screen.getByText(/3 in stock/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Black' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByRole('button', { name: '128 GB' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('restores valid option query parameters without selecting foreign values', async () => {
    mockFetchProduct.mockResolvedValue(makeDetail({ optionGroups: groups, variants: [{ id: 'v1', optionValueIds: { [groups[0].id]: groups[0].values[0].id, [groups[1].id]: groups[1].values[0].id }, priceVnd: '100', stockQuantity: 3n }] }))
    renderDetail('p1', `?option=${groups[0].id}%3A${groups[0].values[0].id}&option=bad%3Avalue`)
    await waitFor(() => expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Black' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByRole('button', { name: '128 GB' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports an invalid complete combination and does not offer add', async () => {
    mockFetchProduct.mockResolvedValue(makeDetail({
      optionGroups: groups,
      variants: [{ id: 'v1', optionValueIds: { [groups[0].id]: groups[0].values[0].id, [groups[1].id]: groups[1].values[0].id }, priceVnd: '100', stockQuantity: 3n }],
    }))
    renderDetail('p1', `?option=${groups[0].id}%3A${groups[0].values[1].id}&option=${groups[1].id}%3A${groups[1].values[0].id}`)
    await waitFor(() => expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/combination is not available/i))
    expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument()
  })

  it('shows missing-group and out-of-stock feedback without offering add', async () => {
    mockFetchProduct.mockResolvedValue(makeDetail({ optionGroups: groups, variants: [{ id: 'v2', optionValueIds: { [groups[0].id]: groups[0].values[1].id, [groups[1].id]: groups[1].values[1].id }, priceVnd: '200', stockQuantity: 0n }] }))
    renderDetail()
    await waitFor(() => expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument())
    expect(screen.getByText(/select Color and Storage/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Silver' }))
    fireEvent.click(screen.getByRole('button', { name: '256 GB' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/out of stock/i)
    const addButton = screen.getByRole('button', { name: /add to cart/i })
    expect(addButton).toBeDisabled()
    fireEvent.click(addButton)
    expect(mockUseCart().addVariant).not.toHaveBeenCalled()
  })

  it('redirects guests with the internal location and does not auto-add', async () => {
    mockUseAuth.mockReturnValue({ user: null, accessToken: null, loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn() })
    mockFetchProduct.mockResolvedValue(makeDetail())
    renderDetail()
    await waitFor(() => expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }))
    expect(screen.getByText('/products/p1')).toBeInTheDocument()
    expect(mockUseCart().addVariant).not.toHaveBeenCalled()
  })

  it('sends only the variant ID and reports add success or API errors', async () => {
    const addVariant = vi.fn().mockResolvedValue(true)
    mockUseCart.mockReturnValue({ ...mockUseCart(), addVariant })
    mockFetchProduct.mockResolvedValue(makeDetail())
    renderDetail()
    await waitFor(() => fireEvent.click(screen.getByRole('button', { name: /add to cart/i })))
    await waitFor(() => expect(addVariant).toHaveBeenCalledWith('v1'))
    expect(screen.getByRole('status')).toHaveTextContent(/added to cart/i)
    addVariant.mockRejectedValue(new ApiError(409, { code: 'stock_limit', message: 'Not enough stock' }))
    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/not enough stock/i))
  })

  it('reports add failure when the cart mutation is not confirmed', async () => {
    const addVariant = vi.fn().mockResolvedValue(false)
    mockUseCart.mockReturnValue({ ...mockUseCart(), addVariant })
    mockFetchProduct.mockResolvedValue(makeDetail())
    renderDetail()
    await waitFor(() => fireEvent.click(screen.getByRole('button', { name: /add to cart/i })))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not add/i))
    expect(screen.queryByText(/added to cart/i)).not.toBeInTheDocument()
  })
})
