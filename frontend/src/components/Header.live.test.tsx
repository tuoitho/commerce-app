import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Header } from './Header'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { ToastProvider } from '@/context/ToastContext'
import { catalogApi } from '@/api/catalog'
import { useCurrentLive } from '@/hooks/useCurrentLive'

vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/context/CartContext', () => ({ useCart: vi.fn() }))
vi.mock('@/api/catalog', () => ({ catalogApi: { listCategories: vi.fn() } }))
vi.mock('@/hooks/useCurrentLive', () => ({ useCurrentLive: vi.fn() }))

const renderHeader = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    </ToastProvider>,
  )

describe('Header live entry', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(useCart).mockReturnValue({
      cart: null,
      badgeCount: 0,
      isLoading: false,
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
      refreshCart: vi.fn(),
    })
    vi.mocked(catalogApi.listCategories).mockResolvedValue([])
  })

  it('shows a LIVE link to the live session for every visitor', () => {
    vi.mocked(useCurrentLive).mockReturnValue({ id: 'live-1', title: 'Flash sale', startedAt: '2026-11-13T03:00:00Z' })
    renderHeader()

    const links = screen.getAllByRole('link', { name: /LIVE/ })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/live/live-1')
    }
  })

  it('hides the LIVE link when nothing is live', () => {
    vi.mocked(useCurrentLive).mockReturnValue(null)
    renderHeader()

    expect(screen.queryByRole('link', { name: /LIVE/ })).not.toBeInTheDocument()
  })
})
