import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from '../App'
import { authApi } from '@/api/auth'
import { tokenStore } from '@/api/tokenStore'

vi.mock('@/api/posts', () => ({
  postsApi: {
    listNotifications: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }),
    listPosts: vi.fn().mockResolvedValue({ data: [], meta: { pagination: { total: 0 } } }),
  },
}))

vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
}))

describe('App Shell', () => {
  const adminUser = { id: 'admin-1', email: 'admin@auraphone.vn', role: 'admin' }

  beforeEach(() => {
    vi.clearAllMocks()
    tokenStore.setToken('token-admin-123')
    window.history.pushState({}, '', '/')
    vi.mocked(authApi.getMe).mockResolvedValue(adminUser)
  })

  it('renders the admin dashboard shell with header and brand title', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('AuraPhone Admin')).toBeInTheDocument()
      expect(screen.getByText('Bảng điều khiển quản trị hệ thống AuraPhone')).toBeInTheDocument()
    })
  })

  it('renders sidebar navigation links', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Tổng quan/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Bài viết/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Sản phẩm/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Tin nhắn hỗ trợ/i })).toBeInTheDocument()
      expect(screen.getByText(/Người dùng/i)).toBeInTheDocument()
    })
  })

  it('renders notification bell in header', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /thông báo/i })).toBeInTheDocument()
    })
  })

  it('renders posts page when navigating to /posts', async () => {
    window.history.pushState({}, '', '/posts')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /quản lý bài viết/i })).toBeInTheDocument()
    })
  })

  it('renders shadcn/ui components (Cards, Badges, Buttons)', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Thống kê nhanh')).toBeInTheDocument()
      expect(screen.getByText('Hệ thống')).toBeInTheDocument()
      expect(screen.getByText('Hoạt động')).toBeInTheDocument()
    })

    const actionButton = screen.getByRole('button', { name: /Làm mới dữ liệu/i })
    expect(actionButton).toBeInTheDocument()
  })

  it('handles user interaction on the action button', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Làm mới dữ liệu/i })).toBeInTheDocument()
    })

    const actionButton = screen.getByRole('button', { name: /Làm mới dữ liệu/i })
    fireEvent.click(actionButton)
    expect(screen.getByText(/Đã làm mới/i)).toBeInTheDocument()
  })

  it('renders product form page when navigating to /products/new', async () => {
    window.history.pushState({}, '', '/products/new')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /thêm sản phẩm mới/i })).toBeInTheDocument()
      expect(screen.getByLabelText(/tên sản phẩm/i)).toBeInTheDocument()
    })
  })
})
