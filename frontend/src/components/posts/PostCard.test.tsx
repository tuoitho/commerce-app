import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PostCard } from './PostCard'
import type { PostItem } from '@/api/posts'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/ToastContext', () => ({
  useToast: vi.fn(),
}))

describe('PostCard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      user: null,
      accessToken: null,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(useToast).mockReturnValue({
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      toast: vi.fn(),
    })
  })

  const mockPost: PostItem = {
    id: 'post-1',
    authorId: 'admin-1',
    authorName: 'Quản trị viên',
    authorRole: 'admin',
    content: 'Đánh giá siêu phẩm flagship mới nhất...',
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    media: [
      {
        id: 'media-1',
        fileName: 'flagship.jpg',
        fileSize: 1024,
        fileType: 'image',
        fileUrl: '/api/v1/posts/media/media-1',
        mimeType: 'image/jpeg',
        position: 0,
      },
    ],
    referredProducts: [
      {
        id: 'prod-1',
        name: 'iPhone 15 Pro Max',
        brand: 'Apple',
        price: '29990000',
        currency: 'VND',
        imageUrl: 'https://example.com/p1.jpg',
        inStock: true,
        active: true,
      },
      {
        id: 'prod-2',
        name: 'Galaxy S24 Ultra',
        brand: 'Samsung',
        price: '27990000',
        currency: 'VND',
        imageUrl: 'https://example.com/p2.jpg',
        inStock: false,
        active: true,
      },
    ],
    reactions: {
      totalCount: 5,
      counts: { like: 3, love: 2, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: null,
    },
    commentCount: 2,
  }

  it('renders author info, admin badge and post content (Req 2.1)', () => {
    render(
      <MemoryRouter>
        <PostCard post={mockPost} />
      </MemoryRouter>
    )

    expect(screen.getAllByText('Quản trị viên').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Đánh giá siêu phẩm flagship mới nhất...')).toBeInTheDocument()
  })

  it('renders referred product cards with title, brand, formatted price, stock status and link (Req 2.3, 2.4)', () => {
    render(
      <MemoryRouter>
        <PostCard post={mockPost} />
      </MemoryRouter>
    )

    // Product 1
    expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText(/29\.990\.000/)).toBeInTheDocument()
    expect(screen.getByText('Còn hàng')).toBeInTheDocument()

    // Product 2
    expect(screen.getByText('Galaxy S24 Ultra')).toBeInTheDocument()
    expect(screen.getByText('Samsung')).toBeInTheDocument()
    expect(screen.getByText(/27\.990\.000/)).toBeInTheDocument()
    expect(screen.getByText('Hết hàng')).toBeInTheDocument()

    // Links to product details
    const links = screen.getAllByRole('link')
    const product1Link = links.find((l) => l.getAttribute('href') === '/products/prod-1')
    const product2Link = links.find((l) => l.getAttribute('href') === '/products/prod-2')
    expect(product1Link).toBeDefined()
    expect(product2Link).toBeDefined()
  })

  it('renders media gallery image attachment (Req 2.1)', () => {
    render(
      <MemoryRouter>
        <PostCard post={mockPost} />
      </MemoryRouter>
    )

    const img = screen.getByAltText('flagship.jpg')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', '/api/v1/posts/media/media-1')
  })
})
