import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminLayout } from './AdminLayout'

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'admin@auraphone.vn' },
    logout: vi.fn(),
  }),
}))

vi.mock('@/api/posts', () => ({
  postsApi: {
    listNotifications: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }),
    listPosts: vi.fn().mockResolvedValue({ data: [], meta: { pagination: { total: 0 } } }),
  },
}))

vi.mock('@/api/chat', () => ({
  listAdminConversations: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/hooks/useAdminChatSocket', () => ({
  useAdminChatSocket: vi.fn(),
}))

vi.mock('@/components/notifications/AdminNotificationBell', () => ({
  AdminNotificationBell: () => <div data-testid="admin-notification-bell" />,
}))

function renderLayout(initialRoute = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/" element={<AdminLayout />}>
            <Route index element={<div>Nội dung tổng quan</div>} />
            <Route path="posts" element={<div>Nội dung bài viết</div>} />
            <Route path="products" element={<div>Nội dung sản phẩm</div>} />
            <Route path="orders" element={<div>Nội dung đơn hàng</div>} />
            <Route path="chat" element={<div>Nội dung tin nhắn</div>} />
            <Route path="returns" element={<div>Nội dung trả hàng</div>} />
            <Route path="reviews" element={<div>Nội dung đánh giá</div>} />
            <Route path="categories" element={<div>Nội dung danh mục</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AdminLayout responsive behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders menu button with aria attributes and responsive visibility', () => {
    renderLayout()

    const menuButton = screen.getByRole('button', { name: 'Mở menu điều hướng' })
    expect(menuButton).toBeInTheDocument()
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(menuButton).toHaveAttribute('aria-controls', 'admin-drawer-nav')
    expect(menuButton.className).toContain('lg:hidden')
  })

  it('hides sidebar below lg breakpoint and keeps it visible from lg', () => {
    const { container } = renderLayout()

    const sidebar = container.querySelector('aside')
    expect(sidebar).toBeInTheDocument()
    expect(sidebar?.className).toContain('hidden')
    expect(sidebar?.className).toContain('lg:flex')
  })

  it('applies responsive padding on header and main to prevent horizontal scroll', () => {
    const { container } = renderLayout()

    const header = container.querySelector('header')
    expect(header?.className).toContain('px-4')
    expect(header?.className).toContain('lg:px-8')

    const main = container.querySelector('main')
    expect(main?.className).toContain('p-4')
    expect(main?.className).toContain('lg:p-8')
  })

  it('opens drawer containing all navigation links when menu button is clicked', () => {
    renderLayout()

    const menuButton = screen.getByRole('button', { name: 'Mở menu điều hướng' })
    expect(screen.queryByRole('dialog', { name: 'Menu điều hướng' })).not.toBeInTheDocument()

    fireEvent.click(menuButton)

    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    const drawer = screen.getByRole('dialog', { name: 'Menu điều hướng' })
    expect(drawer).toBeInTheDocument()
    expect(drawer).toHaveAttribute('id', 'admin-drawer-nav')

    // Verify all navigation links are present inside drawer
    expect(drawer.querySelector('a[href="/"]')).toHaveTextContent('Tổng quan')
    expect(drawer.querySelector('a[href="/posts"]')).toHaveTextContent('Bài viết')
    expect(drawer.querySelector('a[href="/products"]')).toHaveTextContent('Sản phẩm')
    expect(drawer.querySelector('a[href="/orders"]')).toHaveTextContent('Đơn hàng')
    expect(drawer.querySelector('a[href="/chat"]')).toHaveTextContent('Tin nhắn hỗ trợ')
    expect(drawer.querySelector('a[href="/returns"]')).toHaveTextContent('Trả hàng')
    expect(drawer.querySelector('a[href="/reviews"]')).toHaveTextContent('Đánh giá')
    expect(drawer.querySelector('a[href="/categories"]')).toHaveTextContent('Danh mục')
  })

  it('moves focus into drawer on open and restores focus to menu button on close', () => {
    renderLayout()

    const menuButton = screen.getByRole('button', { name: 'Mở menu điều hướng' })
    menuButton.focus()
    expect(document.activeElement).toBe(menuButton)

    fireEvent.click(menuButton)

    const drawer = screen.getByRole('dialog', { name: 'Menu điều hướng' })
    expect(document.activeElement).toBe(drawer)

    const closeButton = screen.getByRole('button', { name: 'Đóng menu điều hướng' })
    fireEvent.click(closeButton)

    expect(screen.queryByRole('dialog', { name: 'Menu điều hướng' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(menuButton)
  })

  it('navigates and closes drawer when a drawer navigation item is selected', () => {
    renderLayout()

    const menuButton = screen.getByRole('button', { name: 'Mở menu điều hướng' })
    fireEvent.click(menuButton)

    const drawer = screen.getByRole('dialog', { name: 'Menu điều hướng' })
    const productsLink = drawer.querySelector('a[href="/products"]')
    expect(productsLink).toBeInTheDocument()

    fireEvent.click(productsLink!)

    expect(screen.getByText('Nội dung sản phẩm')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Menu điều hướng' })).not.toBeInTheDocument()
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(menuButton)
  })

  it('closes drawer and returns focus to menu button when pressing Escape', () => {
    renderLayout()

    const menuButton = screen.getByRole('button', { name: 'Mở menu điều hướng' })
    fireEvent.click(menuButton)

    expect(screen.getByRole('dialog', { name: 'Menu điều hướng' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Menu điều hướng' })).not.toBeInTheDocument()
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(menuButton)
  })

  it('closes drawer and returns focus to menu button when clicking the backdrop overlay', () => {
    renderLayout()

    const menuButton = screen.getByRole('button', { name: 'Mở menu điều hướng' })
    fireEvent.click(menuButton)

    const backdrop = screen.getByTestId('drawer-backdrop')
    expect(backdrop).toBeInTheDocument()

    fireEvent.click(backdrop)

    expect(screen.queryByRole('dialog', { name: 'Menu điều hướng' })).not.toBeInTheDocument()
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(menuButton)
  })
})
