import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { FavoritesPage } from './FavoritesPage'
import { favoritesApi } from '@/api/favorites'
import { useAuth } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import { useFavorites } from '@/context/FavoritesContext'

vi.mock('@/api/favorites', () => ({
  favoritesApi: {
    listFavorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/FavoritesContext', () => ({
  FavoritesProvider: ({ children }: any) => <div>{children}</div>,
  useFavorites: vi.fn(),
}))

const mockFavorites = [
  {
    id: 'prod-1',
    name: 'iPhone 16 Pro Max',
    model: 'A3297',
    brand: 'Apple',
    category: { id: 'cat-phone', name: 'Điện thoại' },
    minPriceVnd: '34990000',
    maxPriceVnd: '34990000',
    price: '34990000',
    currency: 'VND',
    primaryImageUrl: 'https://example.com/iphone-16.jpg',
    inStock: true,
    active: true,
    favoritedAt: '2026-08-24T00:00:00Z',
    viewer: { isFavorite: true },
  },
  {
    id: 'prod-2',
    name: 'Xiaomi 15 Ultra',
    model: 'X15U',
    brand: 'Xiaomi',
    category: { id: 'cat-phone', name: 'Điện thoại' },
    minPriceVnd: '24990000',
    maxPriceVnd: '26990000',
    price: '24990000',
    currency: 'VND',
    primaryImageUrl: 'https://example.com/xiaomi-15.jpg',
    inStock: false,
    active: true,
    favoritedAt: '2026-08-23T00:00:00Z',
    viewer: { isFavorite: true },
  },
]

describe('FavoritesPage (FAVORITE-UI-002, FAVORITE-UI-003, FAVORITE-UI-005, FAVORITE-UI-006, FAVORITE-UI-007)', () => {
  const mockMutate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'cust-1', email: 'customer@auraphone.vn', role: 'customer' },
      role: 'customer',
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    vi.mocked(useFavorites).mockReturnValue({
      resolveIsFavorite: vi.fn((_id, serverVal) => serverVal ?? true),
      isPending: vi.fn(() => false),
      mutate: mockMutate,
    })
  })

  it('renders auth-loading skeleton without premature redirect when auth is restoring (FAVORITE-UI-005)', () => {
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
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <Routes>
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/login" element={<div>Trang Đăng Nhập</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(screen.queryByText('Trang Đăng Nhập')).not.toBeInTheDocument()
    expect(favoritesApi.listFavorites).not.toHaveBeenCalled()
  })

  it('redirects unauthenticated visitor to /login?redirect=%2Ffavorites (FAVORITE-UI-005)', async () => {
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
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <Routes>
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/login" element={<div>Trang Đăng Nhập</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Trang Đăng Nhập')).toBeInTheDocument()
    })
  })

  it('renders empty state when customer has no favorites (FAVORITE-UI-002)', async () => {
    vi.mocked(favoritesApi.listFavorites).mockResolvedValueOnce({
      message: '',
      data: [],
      meta: {
        timestamp: '2026-08-24T00:00:00Z',
        pagination: {
          page: 1,
          limit: 12,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      },
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Chưa có sản phẩm yêu thích nào')).toBeInTheDocument()
      expect(screen.getByText('Khám phá điện thoại ngay')).toBeInTheDocument()
    })
  })

  it('renders error state and handles retry action (FAVORITE-UI-002)', async () => {
    vi.mocked(favoritesApi.listFavorites)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        message: '',
        data: mockFavorites,
        meta: {
          timestamp: '2026-08-24T00:00:00Z',
          pagination: {
            page: 1,
            limit: 12,
            total: 2,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        },
      })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Không thể tải dữ liệu')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Thử lại/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }))

    await waitFor(() => {
      expect(screen.getByText('iPhone 16 Pro Max')).toBeInTheDocument()
      expect(screen.getByText('Xiaomi 15 Ultra')).toBeInTheDocument()
    })
  })

  it('renders populated favorites grid with pagination controls (FAVORITE-UI-002)', async () => {
    vi.mocked(favoritesApi.listFavorites).mockResolvedValueOnce({
      message: '',
      data: mockFavorites,
      meta: {
        timestamp: '2026-08-24T00:00:00Z',
        pagination: {
          page: 1,
          limit: 12,
          total: 15,
          totalPages: 2,
          hasNext: true,
          hasPrev: false,
        },
      },
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Danh sách yêu thích')).toBeInTheDocument()
      expect(screen.getByText('15 sản phẩm')).toBeInTheDocument()
      expect(screen.getByText('iPhone 16 Pro Max')).toBeInTheDocument()
      expect(screen.getByText('Xiaomi 15 Ultra')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Trang sau' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()
    })
  })

  it('handles inactive products by disabling detail navigation and showing "Ngừng kinh doanh" (FAVORITE-UI-003, FAVORITE-UI-006)', async () => {
    const inactiveProduct = {
      id: 'prod-inactive-1',
      name: 'iPhone 12 Pro',
      model: 'A2407',
      brand: 'Apple',
      category: { id: 'cat-phone', name: 'Điện thoại' },
      minPriceVnd: '15990000',
      maxPriceVnd: '15990000',
      price: '15990000',
      currency: 'VND',
      primaryImageUrl: 'https://example.com/iphone-12.jpg',
      inStock: false,
      active: false,
      favoritedAt: '2026-08-20T00:00:00Z',
      viewer: { isFavorite: true },
    }

    vi.mocked(favoritesApi.listFavorites).mockResolvedValueOnce({
      message: '',
      data: [inactiveProduct],
      meta: {
        timestamp: '2026-08-24T00:00:00Z',
        pagination: {
          page: 1,
          limit: 12,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('iPhone 12 Pro')).toBeInTheDocument()
      expect(screen.getByText('Ngừng kinh doanh')).toBeInTheDocument()
      // Detail navigation link is NOT present for inactive product
      expect(screen.queryByRole('link', { name: /iPhone 12 Pro/i })).not.toBeInTheDocument()
      // Remove button is still available
      expect(screen.getByRole('button', { name: /Xóa/i })).toBeInTheDocument()
    })
  })

  it('recovers from out-of-range page by navigating to max(totalPages, 1) (FAVORITE-UI-007)', async () => {
    vi.mocked(favoritesApi.listFavorites)
      .mockResolvedValueOnce({
        message: '',
        data: [],
        meta: {
          timestamp: '2026-08-24T00:00:00Z',
          pagination: {
            page: 4,
            limit: 12,
            total: 15,
            totalPages: 2,
            hasNext: false,
            hasPrev: true,
          },
        },
      })
      .mockResolvedValueOnce({
        message: '',
        data: mockFavorites,
        meta: {
          timestamp: '2026-08-24T00:00:00Z',
          pagination: {
            page: 2,
            limit: 12,
            total: 15,
            totalPages: 2,
            hasNext: false,
            hasPrev: true,
          },
        },
      })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites?page=4']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(favoritesApi.listFavorites).toHaveBeenCalledWith(4, 12)
    })

    await waitFor(() => {
      expect(favoritesApi.listFavorites).toHaveBeenCalledWith(2, 12)
    })
  })

  it('recovers from out-of-range page when totalPages is 0 by navigating to page 1 and rendering empty state (FAVORITE-UI-007)', async () => {
    vi.mocked(favoritesApi.listFavorites)
      .mockResolvedValueOnce({
        message: '',
        data: [],
        meta: {
          timestamp: '2026-08-24T00:00:00Z',
          pagination: {
            page: 4,
            limit: 12,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        },
      })
      .mockResolvedValueOnce({
        message: '',
        data: [],
        meta: {
          timestamp: '2026-08-24T00:00:00Z',
          pagination: {
            page: 1,
            limit: 12,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        },
      })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/favorites?page=4']}>
          <FavoritesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(favoritesApi.listFavorites).toHaveBeenCalledWith(4, 12)
    })

    await waitFor(() => {
      expect(screen.getByText('Chưa có sản phẩm yêu thích nào')).toBeInTheDocument()
    })
  })
})
