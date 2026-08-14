import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Cart, CartItem } from '../api/cart'
import { CartProvider, useCart } from './CartProvider'
import type { User } from '../api/auth'
import { ApiError, serializeApiJson } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import SiteHeader from '../components/SiteHeader'
import CartPage from '../pages/CartPage'

const cartApi = vi.hoisted(() => ({
  fetchCart: vi.fn(),
  addVariant: vi.fn(),
  setQuantity: vi.fn(),
  setSelected: vi.fn(),
  setAllSelected: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('../api/cart', () => ({ ...cartApi, createCartApi: vi.fn() }))
vi.mock('../api/auth', () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}))
vi.mock('../auth/AuthProvider', () => ({ useAuth: vi.fn() }))

const user: User = { id: 'user-1', email: 'user@example.com' }
const makeCart = (totalUnits: bigint): Cart => ({
  items: [],
  totalUnits,
  selectedLineCount: 0,
  selectedTotalVnd: '0',
})

function Probe() {
  const cart = useCart()
  return (
    <div>
      <span data-testid="loading">{String(cart.loading)}</span>
      <span data-testid="pending">{String(cart.pending)}</span>
      <span data-testid="total">{cart.cart?.totalUnits ?? 'none'}</span>
      <span data-testid="error">{cart.error ?? 'none'}</span>
      <button onClick={() => void cart.addVariant('variant-1')}>add</button>
      <button onClick={() => void cart.setAllSelected(true)}>select</button>
    </div>
  )
}

interface HarnessAuthValue {
  user: User | null
  accessToken: string | null
  loading: boolean
  login: () => Promise<void>
  register: () => Promise<void>
  logout: () => Promise<void>
}

const HarnessAuthContext = createContext<HarnessAuthValue | null>(null)

function HarnessAuthProvider({ client, storage, children }: { client: ReturnType<typeof import('../api/client').createApiClient>; storage: Storage; children: ReactNode }) {
  const [session, setSession] = useState<{ user: User; accessToken: string } | null>(null)
  const login = async () => {
    const next = await client.post<{ user: User; accessToken: string }>('/auth/login', { email: user.email, password: 'password' })
    storage.setItem('access_token', next.accessToken)
    setSession(next)
  }
  const logout = async () => {
    storage.removeItem('access_token')
    setSession(null)
  }
  return <HarnessAuthContext.Provider value={{ user: session?.user ?? null, accessToken: session?.accessToken ?? null, loading: false, login, register: login, logout }}>{children}</HarnessAuthContext.Provider>
}

function renderCart() {
  vi.mocked(useAuth).mockReturnValue({ user, accessToken: 'token', loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn() })
  return render(
    <CartProvider api={cartApi}><Probe /></CartProvider>,
  )
}

describe('CartProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user, accessToken: 'token', loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn() })
    cartApi.fetchCart.mockResolvedValue(makeCart(1n))
  })

  afterEach(() => vi.restoreAllMocks())

  it('does not fetch before auth is resolved or for a signed-out user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, accessToken: null, loading: true, login: vi.fn(), register: vi.fn(), logout: vi.fn() })
    render(<CartProvider api={cartApi}><Probe /></CartProvider>)
    await act(async () => {})
    expect(cartApi.fetchCart).not.toHaveBeenCalled()
  })

  it('loads for the active user and serializes mutations in enqueue order', async () => {
    const first = makeCart(2n)
    const second = makeCart(3n)
    let resolveFirst!: (cart: Cart) => void
    cartApi.addVariant.mockReturnValue(new Promise<Cart>((resolve) => (resolveFirst = resolve)))
    cartApi.setAllSelected.mockResolvedValue(second)

    renderCart()
    await waitFor(() => expect(cartApi.fetchCart).toHaveBeenCalledTimes(1))
    await act(async () => {
      screen.getByRole('button', { name: 'add' }).click()
      screen.getByRole('button', { name: 'select' }).click()
    })
    expect(cartApi.setAllSelected).not.toHaveBeenCalled()
    await act(async () => resolveFirst(first))
    await waitFor(() => expect(cartApi.setAllSelected).toHaveBeenCalledWith(true))
    expect(screen.getByTestId('total')).toHaveTextContent('3')
  })

  it('reloads after a business error and keeps the reconciled snapshot', async () => {
    const reconciled = makeCart(4n)
    cartApi.addVariant.mockRejectedValue(new ApiError(409, { code: 'stock_limit', message: 'limit' }))
    cartApi.fetchCart.mockResolvedValueOnce(makeCart(1n)).mockResolvedValueOnce(reconciled)

    renderCart()
    await waitFor(() => expect(cartApi.fetchCart).toHaveBeenCalledTimes(1))
    await act(async () => screen.getByRole('button', { name: 'add' }).click())
    await waitFor(() => expect(cartApi.fetchCart).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('total')).toHaveTextContent('4')
    expect(screen.getByTestId('error')).toHaveTextContent('limit')
  })

  it('returns false for failed row and select-all mutations', async () => {
    cartApi.setSelected.mockRejectedValue(new Error('row selection failed'))
    cartApi.setAllSelected.mockRejectedValue(new Error('bulk selection failed'))
    function MutationResultProbe() {
      const value = useCart()
      const [result, setResult] = useState('none')
      return <div><button onClick={async () => setResult(String(await value.setSelected('item-1', false)))}>row</button><button onClick={async () => setResult(String(await value.setAllSelected(false)))}>all</button><span data-testid="mutation-result">{result}</span></div>
    }

    render(<CartProvider api={cartApi}><MutationResultProbe /></CartProvider>)
    await waitFor(() => expect(cartApi.fetchCart).toHaveBeenCalled())
    await act(async () => screen.getByRole('button', { name: 'row' }).click())
    await waitFor(() => expect(screen.getByTestId('mutation-result')).toHaveTextContent('false'))
    await act(async () => screen.getByRole('button', { name: 'all' }).click())
    await waitFor(() => expect(screen.getByTestId('mutation-result')).toHaveTextContent('false'))
  })

  it('covers all six actions and exposes pending while the queue is active', async () => {
    let resolveAdd!: (cart: Cart) => void
    const deferred = new Promise<Cart>((resolve) => (resolveAdd = resolve))
    cartApi.addVariant.mockReturnValue(deferred)
    cartApi.setQuantity.mockResolvedValue(makeCart(2n))
    cartApi.setSelected.mockResolvedValue(makeCart(2n))
    cartApi.setAllSelected.mockResolvedValue(makeCart(2n))
    cartApi.remove.mockResolvedValue(makeCart(0n))
    function AllActions() {
      const value = useCart()
      return <div><button onClick={() => void value.addVariant('v')}>a</button><button onClick={() => void value.setQuantity('i', 2n)}>q</button><button onClick={() => void value.setSelected('i', true)}>s</button><button onClick={() => void value.setAllSelected(true)}>all</button><button onClick={() => void value.remove('i')}>r</button><span data-testid="p">{String(value.pending)}</span></div>
    }
    render(<CartProvider api={cartApi}><AllActions /></CartProvider>)
    await waitFor(() => expect(cartApi.fetchCart).toHaveBeenCalled())
    await act(async () => screen.getByRole('button', { name: 'a' }).click())
    expect(screen.getByTestId('p')).toHaveTextContent('true')
    expect(cartApi.setQuantity).not.toHaveBeenCalled()
    expect(cartApi.setSelected).not.toHaveBeenCalled()
    expect(cartApi.setAllSelected).not.toHaveBeenCalled()
    expect(cartApi.remove).not.toHaveBeenCalled()
    await act(async () => resolveAdd(makeCart(1n)))
    await waitFor(() => expect(screen.getByTestId('p')).toHaveTextContent('false'))
    await act(async () => {
      screen.getByRole('button', { name: 'q' }).click()
      screen.getByRole('button', { name: 's' }).click()
      screen.getByRole('button', { name: 'all' }).click()
      screen.getByRole('button', { name: 'r' }).click()
    })
    await waitFor(() => expect(cartApi.remove).toHaveBeenCalledWith('i'))
  })

  it('ignores stale load and mutation results after user change', async () => {
    let resolveOldLoad!: (cart: Cart) => void
    let resolveOldMutation!: (cart: Cart) => void
    cartApi.fetchCart.mockReturnValueOnce(new Promise<Cart>((resolve) => (resolveOldLoad = resolve))).mockResolvedValue(makeCart(9n))
    cartApi.addVariant.mockReturnValue(new Promise<Cart>((resolve) => (resolveOldMutation = resolve)))
    const view = renderCart()
    await act(async () => screen.getByRole('button', { name: 'add' }).click())
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-2', email: 'two@example.com' }, accessToken: 'two', loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn() })
    view.rerender(<CartProvider api={cartApi}><Probe /></CartProvider>)
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('9'))
    await act(async () => { resolveOldLoad(makeCart(1n)); resolveOldMutation(makeCart(2n)) })
    expect(screen.getByTestId('total')).toHaveTextContent('9')
    expect(screen.getByTestId('pending')).toHaveTextContent('false')
  })

  it('keeps the confirmed snapshot when reload itself fails', async () => {
    cartApi.addVariant.mockRejectedValue(new ApiError(409, { code: 'stock_limit', message: 'limit' }))
    cartApi.fetchCart.mockResolvedValueOnce(makeCart(1n)).mockRejectedValueOnce(new Error('offline'))
    renderCart()
    await waitFor(() => expect(cartApi.fetchCart).toHaveBeenCalledTimes(1))
    await act(async () => screen.getByRole('button', { name: 'add' }).click())
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('limit'))
    expect(screen.getByTestId('total')).toHaveTextContent('1')
  })

  it('updates the header count only after a confirmed mutation response', async () => {
    const confirmed = makeCart(3n)
    let resolveQuantity!: (cart: Cart) => void
    cartApi.setQuantity.mockReturnValue(new Promise<Cart>((resolve) => (resolveQuantity = resolve)))
    function QuantityProbe() {
      const value = useCart()
      return <button onClick={() => void value.setQuantity('item-1', 3n)}>change quantity</button>
    }

    render(<MemoryRouter><CartProvider api={cartApi}><SiteHeader /><QuantityProbe /></CartProvider></MemoryRouter>)
    await waitFor(() => expect(cartApi.fetchCart).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('link', { name: 'Cart (1)' })).toBeInTheDocument()
    screen.getByRole('button', { name: 'change quantity' }).click()
    expect(screen.getByRole('link', { name: 'Cart (1)' })).toBeInTheDocument()
    await act(async () => resolveQuantity(confirmed))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Cart (3)' })).toBeInTheDocument())
  })

  it('repairs insufficient stock from the confirmed response without selecting the line', async () => {
    const limitedItem = {
      id: 'item-1', variantId: 'variant-1', productId: 'product-1', brandName: 'Apple', productName: 'iPhone 16', model: 'A3294', imageUrl: '', options: [],
      unitPriceVnd: '29990000', lineTotalVnd: '209930000', stockQuantity: 3n, quantity: 7n, selected: false, availability: 'insufficient_stock',
    } as Cart['items'][number]
    const limited: Cart = { items: [limitedItem], totalUnits: 7n, selectedLineCount: 0, selectedTotalVnd: '0' }
    const repaired = { ...limited, items: [{ ...limited.items[0], quantity: 3n, lineTotalVnd: '89970000', availability: 'available', selected: false }] }
    cartApi.fetchCart.mockResolvedValueOnce(limited)
    cartApi.setQuantity.mockResolvedValueOnce(repaired)
    function ProviderState() {
      const value = useCart()
      return <span data-testid="provider-error">{value.error ?? 'none'}</span>
    }

    render(<MemoryRouter><CartProvider api={cartApi}><CartPage /><ProviderState /></CartProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/quantity exceeds current stock/i)).toBeInTheDocument())
    screen.getByRole('button', { name: /decrease quantity for item item-1/i }).click()
    await waitFor(() => expect(cartApi.setQuantity).toHaveBeenCalledWith('item-1', 3n))
    await waitFor(() => expect(screen.getByText('3 available')).toBeInTheDocument())
    expect(screen.getByRole('checkbox', { name: /select iPhone 16/i })).not.toBeChecked()
    expect(screen.getByTestId('provider-error')).toHaveTextContent('none')
  })

  it('proves two independent clients share authorized backend persistence', async () => {
    const backend = { cart: makeCart(0n), sessions: new Map<string, User>() }
    let loginCount = 0
    const makeClient = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const token = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '')
      if (url.endsWith('/auth/login')) {
        const body = JSON.parse(String(init?.body)) as { email: string }
        if (body.email === user.email) {
          const accessToken = loginCount++ === 0 ? 'one-token' : 'two-token'
          backend.sessions.set(accessToken, user)
          return new Response(JSON.stringify({ user, accessToken }), { status: 200 })
        }
      }
       if (url.endsWith('/cart') && backend.sessions.has(token ?? '')) return new Response(serializeApiJson({ cart: structuredClone(backend.cart) }), { status: 200 })
      if (url.endsWith('/cart/items') && backend.sessions.has(token ?? '')) {
        backend.cart = makeCart(1n)
         return new Response(serializeApiJson({ cart: structuredClone(backend.cart) }), { status: 200 })
      }
      if (url.endsWith('/cart/items/i/selection') && backend.sessions.has(token ?? '')) {
        backend.cart = { ...backend.cart, selectedLineCount: 1 }
         return new Response(serializeApiJson({ cart: structuredClone(backend.cart) }), { status: 200 })
      }
      return new Response('', { status: 401 })
    }
    const storageOne = { data: new Map<string, string>() } as unknown as Storage
    const storageTwo = { data: new Map<string, string>() } as unknown as Storage
    storageOne.getItem = (key) => storageOne.data.get(key) ?? null
    storageOne.setItem = (key, value) => storageOne.data.set(key, value)
    storageOne.removeItem = (key) => storageOne.data.delete(key)
    storageTwo.getItem = (key) => storageTwo.data.get(key) ?? null
    storageTwo.setItem = (key, value) => storageTwo.data.set(key, value)
    storageTwo.removeItem = (key) => storageTwo.data.delete(key)
    const { createApiClient } = await import('../api/client')
    const { createCartApi } = await vi.importActual<typeof import('../api/cart')>('../api/cart')
    const apiClientOne = createApiClient({ fetch: makeClient, storage: storageOne })
    const apiClientTwo = createApiClient({ fetch: makeClient, storage: storageTwo })
    const clientOne = createCartApi(apiClientOne)
    const clientTwo = createCartApi(apiClientTwo)
    function ClientProbe({ name }: { name: string }) {
      const value = useCart()
      const auth = useContext(HarnessAuthContext)
      return <div><span data-testid={`${name}-total`}>{value.cart?.totalUnits ?? 'none'}</span><button onClick={() => void auth?.login()}>{name}-login</button><button onClick={() => void value.addVariant('v')}>{name}-add</button><button onClick={() => void value.setSelected('i', true)}>{name}-select</button><button onClick={() => void value.reload()}>{name}-reload</button></div>
    }
    vi.mocked(useAuth).mockImplementation(() => {
      const value = useContext(HarnessAuthContext)
      if (!value) throw new Error('missing harness auth')
      return value
    })
    render(<><HarnessAuthProvider client={apiClientOne} storage={storageOne}><CartProvider api={clientOne}><ClientProbe name="one" /></CartProvider></HarnessAuthProvider><HarnessAuthProvider client={apiClientTwo} storage={storageTwo}><CartProvider api={clientTwo}><ClientProbe name="two" /></CartProvider></HarnessAuthProvider></>)
    await act(async () => {
      screen.getByRole('button', { name: 'one-login' }).click()
      screen.getByRole('button', { name: 'two-login' }).click()
    })
    await waitFor(() => expect(screen.getByTestId('one-total')).toHaveTextContent('0'))
    await act(async () => screen.getByRole('button', { name: 'one-add' }).click())
    await act(async () => screen.getByRole('button', { name: 'one-select' }).click())
    await act(async () => screen.getByRole('button', { name: 'two-reload' }).click())
    expect(screen.getByTestId('two-total')).toHaveTextContent('1')
    expect(backend.cart.selectedLineCount).toBe(1)
    expect(storageOne.getItem('access_token')).toBe('one-token')
    expect(storageTwo.getItem('access_token')).toBe('two-token')
  })

  it('persists default, row, and bulk selection through a fresh provider and page', async () => {
    const validItem: CartItem = {
      id: 'valid-item', variantId: 'valid-variant', productId: 'product-1', brandName: 'Apple', productName: 'iPhone 16', model: 'A3294', imageUrl: '', options: [],
      unitPriceVnd: '29990000', lineTotalVnd: '59980000', stockQuantity: 5n, quantity: 2n, selected: false, availability: 'available',
    }
    const invalidItem: CartItem = { ...validItem, id: 'invalid-item', variantId: 'invalid-variant', availability: 'out_of_stock', selected: false, stockQuantity: 0n, unitPriceVnd: null, lineTotalVnd: null }
    const backend = { items: [] as CartItem[] }
    const snapshot = (): Cart => {
      const selected = backend.items.filter((item) => item.availability === 'available' && item.selected)
      return {
        items: structuredClone(backend.items),
        totalUnits: backend.items.reduce((total, item) => total + item.quantity, 0n),
        selectedLineCount: selected.length,
        selectedTotalVnd: selected.reduce((total, item) => total + BigInt(item.lineTotalVnd ?? '0'), 0n).toString(),
      }
    }
    const backendApi = {
      fetchCart: async () => snapshot(),
      addVariant: async () => {
        backend.items = [{ ...validItem, selected: true }, { ...invalidItem }]
        return snapshot()
      },
      setQuantity: async (_itemId: string, _quantity: bigint) => snapshot(),
      setSelected: async (itemId: string, selected: boolean) => {
        const item = backend.items.find((candidate) => candidate.id === itemId)
        if (item) item.selected = item.availability === 'available' && selected
        return snapshot()
      },
      setAllSelected: async (selected: boolean) => {
        backend.items.forEach((item) => { item.selected = item.availability === 'available' && selected })
        return snapshot()
      },
      remove: async (itemId: string) => {
        backend.items = backend.items.filter((item) => item.id !== itemId)
        return snapshot()
      },
    }
    function AddProbe() {
      const value = useCart()
      return <button onClick={() => void value.addVariant('valid-variant')}>Add test line</button>
    }

    vi.mocked(useAuth).mockReturnValue({ user, accessToken: 'token', loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn() })
    const first = render(<MemoryRouter><CartProvider api={backendApi}><CartPage /><AddProbe /></CartProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument())
    screen.getByRole('button', { name: 'Add test line' }).click()
    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: /select iPhone 16/i })).toHaveLength(2))
    expect(screen.getAllByRole('checkbox', { name: /select iPhone 16/i })[0]).toBeChecked()

    fireEvent.click(screen.getAllByRole('checkbox', { name: /select iPhone 16/i })[0])
    await waitFor(() => expect(backend.items[0].selected).toBe(false))
    expect(screen.getByText('0 selected items')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /select all available items/i }))
    await waitFor(() => expect(backend.items[0].selected).toBe(true))
    expect(backend.items[1].selected).toBe(false)
    expect(screen.getByText('1 selected item')).toBeInTheDocument()

    first.unmount()
    render(<MemoryRouter><CartProvider api={backendApi}><CartPage /></CartProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: /select iPhone 16/i })).toHaveLength(2))
    expect(screen.getAllByRole('checkbox', { name: /select iPhone 16/i })[0]).toBeChecked()
    expect(screen.getAllByRole('checkbox', { name: /select iPhone 16/i })[1]).not.toBeChecked()
    expect(screen.getAllByRole('checkbox', { name: /select iPhone 16/i })[1]).toBeDisabled()
  })
})
