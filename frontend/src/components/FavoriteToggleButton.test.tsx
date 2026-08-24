import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FavoriteToggleButton } from './FavoriteToggleButton'
import { useAuth } from '@/context/AuthContext'
import { useFavorites } from '@/context/FavoritesContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/api/types'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/FavoritesContext', () => ({
  useFavorites: vi.fn(),
}))

vi.mock('@/context/ToastContext', () => ({
  useToast: vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('FavoriteToggleButton', () => {
  const mockToggle = vi.fn()
  const mockIsPending = vi.fn()
  const mockSuccess = vi.fn()
  const mockError = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsPending.mockReturnValue(false)
    vi.mocked(useToast).mockReturnValue({
      toast: vi.fn(),
      success: mockSuccess,
      error: mockError,
      info: vi.fn(),
    })
  })

  describe('Unauthenticated / Guest user (Req 1.4, 1.5)', () => {
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
      vi.mocked(useFavorites).mockReturnValue({
        items: [],
        favoriteIds: new Set<string>(),
        isLoading: false,
        loadError: null,
        isPending: mockIsPending,
        refresh: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
        toggle: mockToggle,
      })
    })

    it('renders unpressed state with accessible label for guest', () => {
      render(
        <MemoryRouter initialEntries={['/products?page=2']}>
          <FavoriteToggleButton productId="p-1" productName="iPhone 16 Pro" />
        </MemoryRouter>
      )

      const button = screen.getByRole('button', { name: /Thêm iPhone 16 Pro vào yêu thích/i })
      expect(button).toBeInTheDocument()
      expect(button).toHaveAttribute('aria-pressed', 'false')
      expect(button).toHaveAttribute('type', 'button')
    })

    it('redirects guest to /login with encoded current path and search on click without calling toggle or mutating state', () => {
      render(
        <MemoryRouter initialEntries={['/products?page=2&brand=Apple']}>
          <FavoriteToggleButton productId="p-1" productName="iPhone 16 Pro" />
        </MemoryRouter>
      )

      const button = screen.getByRole('button', { name: /Thêm iPhone 16 Pro vào yêu thích/i })
      fireEvent.click(button)

      expect(mockNavigate).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent('/products?page=2&brand=Apple')}`
      )
      expect(mockToggle).not.toHaveBeenCalled()
    })
  })

  describe('Authenticated user (Req 2.1, 2.3, 2.6, 2.7, 6.1, 6.2, 6.3, 6.4)', () => {
    beforeEach(() => {
      vi.mocked(useAuth).mockReturnValue({
        user: { id: 'user-1', email: 'user@example.com' },
        accessToken: 'token-123',
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      })
    })

    it('renders unpressed state when product is not favorited and toggles to add with success toast', async () => {
      vi.mocked(useFavorites).mockReturnValue({
        items: [],
        favoriteIds: new Set<string>(),
        isLoading: false,
        loadError: null,
        isPending: mockIsPending,
        refresh: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
        toggle: mockToggle.mockResolvedValue(undefined),
      })

      render(
        <MemoryRouter>
          <FavoriteToggleButton productId="p-1" productName="iPhone 16 Pro" />
        </MemoryRouter>
      )

      const button = screen.getByRole('button', { name: /Thêm iPhone 16 Pro vào yêu thích/i })
      expect(button).toHaveAttribute('aria-pressed', 'false')

      fireEvent.click(button)

      await waitFor(() => {
        expect(mockToggle).toHaveBeenCalledWith('p-1')
        expect(mockSuccess).toHaveBeenCalledWith('Đã thêm sản phẩm vào danh sách yêu thích')
      })
    })

    it('renders pressed state when product is favorited and toggles to remove with success toast', async () => {
      vi.mocked(useFavorites).mockReturnValue({
        items: [],
        favoriteIds: new Set<string>(['p-1']),
        isLoading: false,
        loadError: null,
        isPending: mockIsPending,
        refresh: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
        toggle: mockToggle.mockResolvedValue(undefined),
      })

      render(
        <MemoryRouter>
          <FavoriteToggleButton productId="p-1" productName="iPhone 16 Pro" />
        </MemoryRouter>
      )

      const button = screen.getByRole('button', { name: /Bỏ iPhone 16 Pro khỏi yêu thích/i })
      expect(button).toHaveAttribute('aria-pressed', 'true')

      fireEvent.click(button)

      await waitFor(() => {
        expect(mockToggle).toHaveBeenCalledWith('p-1')
        expect(mockSuccess).toHaveBeenCalledWith('Đã xóa sản phẩm khỏi danh sách yêu thích')
      })
    })

    it('shows error toast when toggle operation fails (Req 2.7)', async () => {
      vi.mocked(useFavorites).mockReturnValue({
        items: [],
        favoriteIds: new Set<string>(),
        isLoading: false,
        loadError: null,
        isPending: mockIsPending,
        refresh: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
        toggle: mockToggle.mockRejectedValue(new ApiError(400, { code: 'server_error', message: 'Lỗi hệ thống khi lưu yêu thích' })),
      })

      render(
        <MemoryRouter>
          <FavoriteToggleButton productId="p-1" productName="iPhone 16 Pro" />
        </MemoryRouter>
      )

      const button = screen.getByRole('button', { name: /Thêm iPhone 16 Pro vào yêu thích/i })
      fireEvent.click(button)

      await waitFor(() => {
        expect(mockToggle).toHaveBeenCalledWith('p-1')
        expect(mockError).toHaveBeenCalledWith('Lỗi hệ thống khi lưu yêu thích')
      })
    })

    it('disables button when isPending is true to prevent rapid duplicate activations (Req 2.6)', () => {
      mockIsPending.mockImplementation((id: string) => id === 'p-1')
      vi.mocked(useFavorites).mockReturnValue({
        items: [],
        favoriteIds: new Set<string>(),
        isLoading: false,
        loadError: null,
        isPending: mockIsPending,
        refresh: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
        toggle: mockToggle,
      })

      render(
        <MemoryRouter>
          <FavoriteToggleButton productId="p-1" productName="iPhone 16 Pro" />
        </MemoryRouter>
      )

      const button = screen.getByRole('button', { name: /Thêm iPhone 16 Pro vào yêu thích/i })
      expect(button).toBeDisabled()

      fireEvent.click(button)
      expect(mockToggle).not.toHaveBeenCalled()
    })

    it('stops event propagation and prevents default on click so parent link is not triggered', () => {
      vi.mocked(useFavorites).mockReturnValue({
        items: [],
        favoriteIds: new Set<string>(),
        isLoading: false,
        loadError: null,
        isPending: mockIsPending,
        refresh: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
        toggle: mockToggle.mockResolvedValue(undefined),
      })

      const parentClickHandler = vi.fn()

      render(
        <MemoryRouter>
          <div onClick={parentClickHandler}>
            <FavoriteToggleButton productId="p-1" productName="iPhone 16 Pro" />
          </div>
        </MemoryRouter>
      )

      const button = screen.getByRole('button', { name: /Thêm iPhone 16 Pro vào yêu thích/i })
      fireEvent.click(button)

      expect(parentClickHandler).not.toHaveBeenCalled()
    })

    it('renders with visible text when showText is true', () => {
      vi.mocked(useFavorites).mockReturnValue({
        items: [],
        favoriteIds: new Set<string>(['p-1']),
        isLoading: false,
        loadError: null,
        isPending: mockIsPending,
        refresh: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
        toggle: mockToggle,
      })

      render(
        <MemoryRouter>
          <FavoriteToggleButton productId="p-1" productName="iPhone 16 Pro" showText />
        </MemoryRouter>
      )

      expect(screen.getByText('Đã yêu thích')).toBeInTheDocument()
    })
  })
})
