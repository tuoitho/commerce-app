import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider, useAuth } from './AuthProvider'
import { tokenStore } from '../api/tokenStore'
import type { Cart, CartApi } from '../api/cart'
import { CartProvider } from '../cart/CartProvider'
import { useCart } from '../cart/CartProvider'

function Probe() {
  const { user, accessToken, loading, logout } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.email ?? 'none'}</span>
      <span data-testid="token">{accessToken ?? 'none'}</span>
      <button onClick={() => void logout()}>logout</button>
    </div>
  )
}

function CartProbe() {
  const { cart, error, loading, addVariant } = useCart()
  return <><span data-testid="cart-total">{cart?.totalUnits ?? 'none'}</span><span data-testid="cart-error">{error ?? 'none'}</span><span data-testid="cart-loading">{String(loading)}</span><button onClick={() => void addVariant('variant-1')}>add</button></>
}

describe('AuthProvider session restore', () => {
  const ORIGINAL_STORAGE = window.localStorage

  beforeEach(() => {
    tokenStore.set(null)
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    window.localStorage = ORIGINAL_STORAGE
  })

  it('restores a session from the refresh endpoint when no access token is held', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ user: { id: '1', email: 'user@example.com' }, accessToken: 'abc' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('user').textContent).toBe('user@example.com')
    expect(screen.getByTestId('token').textContent).toBe('abc')
    expect(window.localStorage.getItem('access_token')).toBe('abc')
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
  })

  it('stays signed out when refresh endpoint rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('user').textContent).toBe('none')
    expect(screen.getByTestId('token').textContent).toBe('none')
  })

  it('restores the user through auth me when an access token is persisted', async () => {
    window.localStorage.setItem('access_token', 'persisted-token')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: { id: '1', email: 'user@example.com' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )
    })

    expect(screen.getByTestId('user').textContent).toBe('user@example.com')
    expect(screen.getByTestId('token').textContent).toBe('persisted-token')
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/auth/me', expect.objectContaining({
      credentials: 'include',
      headers: expect.objectContaining({ Authorization: 'Bearer persisted-token' }),
    }))
  })

  it('clears auth and cart when an authorized cart mutation exhausts refresh', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: '1', email: 'user@example.com' }, accessToken: 'abc' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{"cart":{"items":[],"totalUnits":1,"selectedLineCount":0,"selectedTotalVnd":"0"}}', { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }))

    render(<AuthProvider><><Probe /><CartProvider><CartProbe /></CartProvider></></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('cart-total')).toHaveTextContent('1'))
    await act(async () => screen.getByRole('button', { name: 'add' }).click())
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'))
    expect(screen.getByTestId('cart-total')).toHaveTextContent('none')
    expect(screen.getByTestId('cart-error')).toHaveTextContent('none')
    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })

  it('real logout resolves cart loading and ignores a stale load response', async () => {
    tokenStore.set('persisted-token')
    let resolveLoad!: (cart: Cart) => void
    const cartApi: CartApi = {
      fetchCart: vi.fn(() => new Promise<Cart>((resolve) => { resolveLoad = resolve })),
      addVariant: vi.fn(), setQuantity: vi.fn(), setSelected: vi.fn(), setAllSelected: vi.fn(), remove: vi.fn(),
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/auth/me')) return new Response(JSON.stringify({ user: { id: '1', email: 'user@example.com' } }), { status: 200 })
      if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 })
      throw new Error(`unexpected request: ${url}`)
    })

    render(<AuthProvider><><Probe /><CartProvider api={cartApi}><CartProbe /></CartProvider></></AuthProvider>)
    await waitFor(() => expect(cartApi.fetchCart).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('cart-loading')).toHaveTextContent('true'))
    await act(async () => screen.getByRole('button', { name: 'logout' }).click())
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'))
    expect(screen.getByTestId('cart-loading')).toHaveTextContent('false')
    await act(async () => resolveLoad({ items: [], totalUnits: 3n, selectedLineCount: 0, selectedTotalVnd: '0' }))
    expect(screen.getByTestId('cart-total')).toHaveTextContent('none')
    expect(screen.getByTestId('cart-loading')).toHaveTextContent('false')
  })
})
