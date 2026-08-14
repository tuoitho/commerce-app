import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Cart, CartItem } from '../api/cart'
import { useCart } from '../cart/CartProvider'
import CartPage from './CartPage'

vi.mock('../cart/CartProvider', () => ({ useCart: vi.fn() }))

const mockedUseCart = vi.mocked(useCart)

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'item-1',
    variantId: 'variant-1',
    productId: 'product-1',
    brandName: 'Apple',
    productName: 'iPhone 16',
    model: 'A3294',
    imageUrl: 'https://example.com/phone.jpg',
    options: [{ groupLabel: 'Dung lượng', valueLabel: '256GB' }, { groupLabel: 'Màu sắc', valueLabel: 'Đen' }],
    unitPriceVnd: '29990000',
    lineTotalVnd: '59980000',
    stockQuantity: 5n,
    quantity: 2n,
    selected: true,
    availability: 'available',
    ...overrides,
  }
}

function makeCart(items: CartItem[] = [makeItem()]): Cart {
  return { items, totalUnits: items.reduce((total, item) => total + item.quantity, 0n), selectedLineCount: 1, selectedTotalVnd: '59980000' }
}

function renderPage(value: Partial<ReturnType<typeof useCart>> = {}) {
  const base = {
    cart: makeCart(), loading: false, pending: false, error: null, reload: vi.fn(), addVariant: vi.fn(),
    setQuantity: vi.fn(), setSelected: vi.fn(), setAllSelected: vi.fn(), remove: vi.fn(), ...value,
  }
  mockedUseCart.mockReturnValue(base)
  return render(<MemoryRouter><CartPage /></MemoryRouter>)
}

describe('CartPage task 7.1', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading and retryable error states', () => {
    renderPage({ cart: null, loading: true })
    expect(screen.getByText(/loading cart/i)).toBeInTheDocument()

    const reload = vi.fn()
    renderPage({ cart: null, error: 'Network unavailable', reload })
    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable')
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('shows an empty cart with a continue shopping link', () => {
    renderPage({ cart: makeCart([]) })
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /continue shopping/i })).toHaveAttribute('href', '/products')
  })

  it('keeps retry available when an already-empty cart reload fails', () => {
    const reload = vi.fn()
    renderPage({ cart: makeCart([]), error: 'Network unavailable', reload })
    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable')
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('renders product identity, options, live prices, image fallback and stock details', () => {
    renderPage({ cart: makeCart([makeItem({ imageUrl: '' })]) })
    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('iPhone 16')).toBeInTheDocument()
    expect(screen.getByText('A3294')).toBeInTheDocument()
    expect(screen.getByText(/Dung lượng: 256GB/)).toBeInTheDocument()
    expect(screen.getByText(/Màu sắc: Đen/)).toBeInTheDocument()
    expect(screen.getAllByText(/29\.990\.000/)).toHaveLength(1)
    expect(screen.getAllByText(/59\.980\.000/)).toHaveLength(2)
    expect(screen.getByRole('img', { name: /iPhone 16/i })).toHaveTextContent('No image')
    expect(screen.getByText(/5 available/i)).toBeInTheDocument()
  })

  it('keeps quantities above Number.MAX_SAFE_INTEGER exact in the controls', () => {
    const max = 9223372036854775807n
    const setQuantity = vi.fn()
    renderPage({ cart: makeCart([makeItem({ stockQuantity: max, quantity: max })]), setQuantity })
    expect(screen.getByText(`${max} available`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /increase quantity/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /decrease quantity/i }))
    expect(setQuantity).toHaveBeenCalledWith('item-1', max - 1n)
  })

  it('renders all availability states and restricts their controls', () => {
    const items = [
      makeItem({ id: 'available', availability: 'available' }),
       makeItem({ id: 'insufficient', availability: 'insufficient_stock', quantity: 7n, stockQuantity: 3n }),
       makeItem({ id: 'out', availability: 'out_of_stock', quantity: 2n, stockQuantity: 0n, unitPriceVnd: null, lineTotalVnd: null }),
       makeItem({ id: 'gone', availability: 'unavailable', quantity: 1n, stockQuantity: 0n, unitPriceVnd: null, lineTotalVnd: null }),
    ]
    renderPage({ cart: makeCart(items) })

    expect(screen.getByText(/quantity exceeds current stock/i)).toBeInTheDocument()
    expect(screen.getAllByText(/out of stock/i)).not.toHaveLength(0)
    expect(screen.getAllByText(/no longer available/i)).not.toHaveLength(0)
    expect(screen.getAllByRole('checkbox', { name: /select iPhone 16/i })).toHaveLength(4)
    expect(screen.getAllByRole('checkbox')[2]).toBeDisabled()
    expect(screen.getAllByRole('checkbox')[3]).toBeDisabled()
    expect(screen.getByRole('button', { name: /increase quantity for item available/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /increase quantity for item insufficient/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /decrease quantity for item insufficient/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /increase quantity for item out/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /remove item out/i })).toBeEnabled()
  })

  it('calls quantity, selection and remove actions for permitted rows', () => {
    const setQuantity = vi.fn()
    const setSelected = vi.fn()
    const remove = vi.fn()
    renderPage({ setQuantity, setSelected, remove })
    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }))
    fireEvent.click(screen.getByRole('button', { name: /decrease quantity/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select iPhone 16/i }))
    fireEvent.click(screen.getByRole('button', { name: /remove item/i }))
    expect(setQuantity).toHaveBeenNthCalledWith(1, 'item-1', 3n)
    expect(setQuantity).toHaveBeenNthCalledWith(2, 'item-1', 1n)
    expect(setSelected).toHaveBeenCalledWith('item-1', false)
    expect(remove).toHaveBeenCalledWith('item-1')
  })
})

describe('CartPage task 7.2', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows selected line count and valid-only BigInt total', () => {
    const items = [
      makeItem({ id: 'selected', selected: true, lineTotalVnd: '10000000000000000000000000000000000001' }),
      makeItem({ id: 'out', availability: 'out_of_stock', selected: false, stockQuantity: 0n, unitPriceVnd: null, lineTotalVnd: null }),
    ]
    renderPage({ cart: { ...makeCart(items), selectedLineCount: 1, selectedTotalVnd: '10000000000000000000000000000000000001' } })

    expect(screen.getByText('1 selected item')).toBeInTheDocument()
    expect(screen.getAllByText((text) => text.includes('10.000.000.000.000.000.000.000.000.000.000.000.001')).length).toBe(2)
    expect(screen.getByRole('button', { name: /continue to checkout/i })).toBeEnabled()
  })

  it('persists row selection through the backend and defaults new rows to selected', () => {
    const setSelected = vi.fn()
    renderPage({ setSelected })

    const row = screen.getByRole('checkbox', { name: /select iPhone 16/i })
    expect(row).toBeChecked()
    fireEvent.click(row)
    expect(setSelected).toHaveBeenCalledWith('item-1', false)
  })

  it('announces successful row and select-all selection changes', async () => {
    const setSelected = vi.fn().mockResolvedValue(true)
    const setAllSelected = vi.fn().mockResolvedValue(true)
    const view = renderPage({ setSelected, setAllSelected })
    const summary = () => within(screen.getByRole('region', { name: 'Cart summary' }))

    fireEvent.click(screen.getByRole('checkbox', { name: /select iPhone 16/i }))
    await waitFor(() => expect(summary().getByRole('status')).toHaveTextContent(/selection cleared/i))

    mockedUseCart.mockReturnValue({
      cart: makeCart([makeItem({ selected: false })]), loading: false, pending: false, error: null, reload: vi.fn(), addVariant: vi.fn(),
      setQuantity: vi.fn(), setSelected, setAllSelected, remove: vi.fn(),
    })
    view.rerender(<MemoryRouter><CartPage /></MemoryRouter>)
    const selectAll = summary().getByRole('checkbox', { name: /select all available items/i })
    fireEvent.click(selectAll)
    await waitFor(() => expect(summary().getByRole('status')).toHaveTextContent(/all available items selected/i))
  })

  it('clears a prior selection success before a later failed mutation', async () => {
    const setSelected = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    renderPage({ setSelected, error: 'Selection failed' })
    const summary = within(screen.getByRole('region', { name: 'Cart summary' }))
    const row = screen.getByRole('checkbox', { name: /select iPhone 16/i })

    fireEvent.click(row)
    await waitFor(() => expect(summary.getByRole('status')).toHaveTextContent(/selection cleared/i))

    fireEvent.click(row)
    await waitFor(() => expect(summary.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Selection failed')
  })

  it('does not announce selection success when row or select-all mutation fails', async () => {
    const setSelected = vi.fn().mockResolvedValue(false)
    const setAllSelected = vi.fn().mockResolvedValue(false)
    renderPage({ setSelected, setAllSelected, error: 'Selection failed' })
    const summary = within(screen.getByRole('region', { name: 'Cart summary' }))

    fireEvent.click(screen.getByRole('checkbox', { name: /select iPhone 16/i }))
    await waitFor(() => expect(summary.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Selection failed')

    fireEvent.click(summary.getByRole('checkbox', { name: /select all available items/i }))
    await waitFor(() => expect(summary.queryByRole('status')).not.toBeInTheDocument())
    expect(setSelected).toHaveBeenCalledWith('item-1', false)
    expect(setAllSelected).toHaveBeenCalledWith(false)
  })

  it('selects and unselects all through the backend while skipping unavailable rows', () => {
    const setAllSelected = vi.fn()
    const items = [
      makeItem({ id: 'available-1', selected: false }),
      makeItem({ id: 'available-2', selected: true }),
      makeItem({ id: 'unavailable', availability: 'unavailable', selected: false, unitPriceVnd: null, lineTotalVnd: null }),
    ]
    const view = renderPage({ cart: { ...makeCart(items), selectedLineCount: 1, selectedTotalVnd: '59980000' }, setAllSelected })

    const selectAll = screen.getByRole('checkbox', { name: /select all available items/i })
    expect(selectAll).not.toBeChecked()
    fireEvent.click(selectAll)
    expect(setAllSelected).toHaveBeenCalledWith(true)
    mockedUseCart.mockReturnValue({
      ...({ cart: makeCart(items.map((item) => item.availability === 'available' ? { ...item, selected: true } : item)), loading: false, pending: false, error: null, reload: vi.fn(), addVariant: vi.fn(), setQuantity: vi.fn(), setSelected: vi.fn(), setAllSelected, remove: vi.fn() }),
      cart: { ...makeCart(items.map((item) => item.availability === 'available' ? { ...item, selected: true } : item)), selectedLineCount: 2, selectedTotalVnd: '119960000' },
    })
    view.rerender(<MemoryRouter><CartPage /></MemoryRouter>)
    const selectedAll = screen.getByRole('checkbox', { name: /select all available items/i })
    expect(selectedAll).toBeChecked()
    fireEvent.click(selectedAll)
    expect(setAllSelected).toHaveBeenCalledWith(false)
    expect(screen.getAllByRole('checkbox', { name: /select iPhone 16/i })[2]).toBeDisabled()
  })

  it('disables checkout with no selected valid lines and explains the enabled placeholder', () => {
    const items = [makeItem({ selected: false }), makeItem({ id: 'out', availability: 'out_of_stock', selected: true, stockQuantity: 0n, unitPriceVnd: null, lineTotalVnd: null })]
    renderPage({ cart: { ...makeCart(items), selectedLineCount: 0, selectedTotalVnd: '0' } })

    const checkout = screen.getByRole('button', { name: /continue to checkout/i })
    expect(screen.getByText('0 selected items')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Cart summary' })).getByRole('strong')).toHaveTextContent('0')
    expect(checkout).toBeDisabled()
  })

  it('shows the checkout scope message after an enabled CTA is activated', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /continue to checkout/i }))
    expect(within(screen.getByRole('region', { name: 'Cart summary' })).getByRole('status')).toHaveTextContent(/checkout is outside the current scope/i)
  })
})
