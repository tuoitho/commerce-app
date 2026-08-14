import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from './App'

const auth = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}))

const cart = vi.hoisted(() => ({
  cart: { items: [], totalUnits: 3n, selectedLineCount: 0, selectedTotalVnd: '0' },
}))

vi.mock('./auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ user: auth.user, loading: false, login: auth.login, register: auth.register, logout: auth.logout }),
}))

vi.mock('./cart/CartProvider', () => ({
  CartProvider: ({ children }: { children: ReactNode }) => children,
  useCart: () => ({ cart: cart.cart, loading: false, pending: false, error: null, reload: vi.fn(), addVariant: vi.fn(), setQuantity: vi.fn(), setSelected: vi.fn(), setAllSelected: vi.fn(), remove: vi.fn() }),
}))

vi.mock('./pages/CatalogPage', () => ({ default: () => <h1>Phones page</h1> }))
vi.mock('./pages/ProductDetailPage', () => ({ default: () => <h1>Product page</h1> }))

describe('storefront routes', () => {
  beforeEach(() => {
    auth.user = null
    auth.login.mockReset()
    auth.register.mockReset()
  })

  it('navigates between the public home, phones, and cart links without a reload', async () => {
    render(<MemoryRouter initialEntries={['/']}><AppRoutes /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Phones' }))
    expect(screen.getByRole('heading', { name: 'Phones page' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('routes product detail URLs to the product page', () => {
    render(<MemoryRouter initialEntries={['/products/p1']}><AppRoutes /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Product page' })).toBeInTheDocument()
  })

  it('renders not found with a home link for unknown routes', () => {
    render(<MemoryRouter initialEntries={['/does-not-exist']}><AppRoutes /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
  })

  it('redirects a signed-out cart visit to login with its internal return location', () => {
    render(<MemoryRouter initialEntries={['/cart']}><AppRoutes /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Register' })[0]).toHaveAttribute('href', '/register')
  })

  it('returns to cart after a successful login', async () => {
    auth.login.mockImplementation(async () => {
      auth.user = { id: 'user-1', email: 'user@example.com' }
    })
    render(<MemoryRouter initialEntries={['/cart']}><AppRoutes /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!)

    await screen.findByRole('heading', { name: 'Cart' })
    expect(auth.login).toHaveBeenCalledWith('user@example.com', 'password')
  })

  it('returns to cart after registration with the original location state', async () => {
    auth.register.mockImplementation(async () => {
      auth.user = { id: 'user-1', email: 'new@example.com' }
    })
    render(<MemoryRouter initialEntries={[{ pathname: '/register', state: { from: { pathname: '/cart', search: '?step=1', hash: '#items' } } }]}><AppRoutes /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!)

    await screen.findByRole('heading', { name: 'Cart' })
    expect(auth.register).toHaveBeenCalledWith('new@example.com', 'password')
  })

  it('preserves return state when handing off from login to register', async () => {
    auth.register.mockImplementation(async () => {
      auth.user = { id: 'user-1', email: 'new@example.com' }
    })
    render(<MemoryRouter initialEntries={[{ pathname: '/login', state: { from: { pathname: '/cart' } } }]}><AppRoutes /></MemoryRouter>)

    fireEvent.click(screen.getAllByRole('link', { name: 'Register' })[1])
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!)

    await screen.findByRole('heading', { name: 'Cart' })
    expect(auth.register).toHaveBeenCalledWith('new@example.com', 'password')
  })

  it('shows total cart units in the shared header', () => {
    render(<MemoryRouter initialEntries={['/']}><AppRoutes /></MemoryRouter>)

    expect(screen.getByRole('link', { name: /Cart \(3\)/ })).toBeInTheDocument()
  })
})
