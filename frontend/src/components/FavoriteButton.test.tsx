import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FavoriteButton } from './FavoriteButton'
import { useAuth } from '@/context/AuthContext'
import { useFavorites } from '@/context/FavoritesContext'
import { useToast } from '@/context/ToastContext'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/FavoritesContext', () => ({
  useFavorites: vi.fn(),
}))

vi.mock('@/context/ToastContext', async () => {
  const actual = await vi.importActual<typeof import('@/context/ToastContext')>('@/context/ToastContext')
  return {
    ...actual,
    useToast: vi.fn(),
  }
})

describe('FavoriteButton Component (FAVORITE-UI-001, FAVORITE-AUTH-REDIRECT-001/003, CATALOG-VIEWER-008)', () => {
  const mockMutate = vi.fn()
  const mockToastError = vi.fn()
  const mockResolveIsFavorite = vi.fn((_id: string, serverVal: boolean) => serverVal)
  const mockIsPending = vi.fn((_id: string) => false)

  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveIsFavorite.mockImplementation((_id: string, serverVal: boolean) => serverVal)
    mockIsPending.mockImplementation((_id: string) => false)
    vi.mocked(useToast).mockReturnValue({
      toast: vi.fn(),
      success: vi.fn(),
      error: mockToastError,
      info: vi.fn(),
    })

    vi.mocked(useFavorites).mockReturnValue({
      resolveIsFavorite: mockResolveIsFavorite,
      isPending: mockIsPending,
      mutate: mockMutate,
    })

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'cust-1', email: 'cust@auraphone.vn', role: 'customer' },
      role: 'customer',
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
  })

  it('renders non-favorite state with accessible name and aria-pressed=false (FAVORITE-UI-001)', () => {
    render(
      <MemoryRouter>
        <FavoriteButton productId="prod-1" initialIsFavorite={false} surface="product-card" />
      </MemoryRouter>
    )

    const btn = screen.getByRole('button', { name: 'Thêm vào yêu thích' })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders favorite state with accessible name and aria-pressed=true (FAVORITE-UI-001, CATALOG-VIEWER-008)', () => {
    mockResolveIsFavorite.mockReturnValue(true)

    render(
      <MemoryRouter>
        <FavoriteButton productId="prod-1" initialIsFavorite={true} surface="product-card" />
      </MemoryRouter>
    )

    const btn = screen.getByRole('button', { name: 'Bỏ khỏi yêu thích' })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('toggles favorite and stops event propagation upon click (FAVORITE-UI-001)', async () => {
    mockMutate.mockResolvedValueOnce({
      kind: 'confirmed',
      state: { productId: 'prod-1', isFavorite: true },
    })

    const parentClick = vi.fn()

    render(
      <MemoryRouter>
        <div onClick={parentClick}>
          <FavoriteButton productId="prod-1" initialIsFavorite={false} surface="product-card" />
        </div>
      </MemoryRouter>
    )

    const btn = screen.getByRole('button', { name: 'Thêm vào yêu thích' })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        productId: 'prod-1',
        nextState: true,
      })
    })

    expect(parentClick).not.toHaveBeenCalled()
  })

  it('navigates to /login?redirect=... when clicked by unauthenticated user (FAVORITE-AUTH-REDIRECT-001)', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      role: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/products?q=phone#results']}>
        <FavoriteButton productId="prod-1" initialIsFavorite={false} surface="product-card" />
      </MemoryRouter>
    )

    const btn = screen.getByRole('button', { name: 'Thêm vào yêu thích' })
    fireEvent.click(btn)

    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('disables interaction while auth is restoring without redirecting (FAVORITE-AUTH-REDIRECT-003)', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      role: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <FavoriteButton productId="prod-1" initialIsFavorite={false} surface="product-card" />
      </MemoryRouter>
    )

    const btn = screen.getByRole('button', { name: 'Thêm vào yêu thích' })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)

    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('shows Vietnamese toast error on mutation failure (FAVORITE-SESSION-STATE-003)', async () => {
    mockMutate.mockResolvedValueOnce({
      kind: 'failed',
      restoredState: false,
      error: new Error('Request failed'),
    })

    render(
      <MemoryRouter>
        <FavoriteButton productId="prod-1" initialIsFavorite={false} surface="product-detail" />
      </MemoryRouter>
    )

    const btn = screen.getByRole('button', { name: 'Thêm vào yêu thích' })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Không thể cập nhật yêu thích',
        expect.stringContaining('Đã xảy ra lỗi')
      )
    })
  })
})
