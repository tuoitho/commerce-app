import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AdminPostsPage } from './AdminPostsPage'
import { postsApi, type PostItem } from '@/api/posts'
import { getAdminProducts } from '@/api/products'

vi.mock('@/api/posts', () => ({
  postsApi: {
    listPosts: vi.fn(),
    createAdminPost: vi.fn(),
    updateAdminPost: vi.fn(),
    deleteAdminPost: vi.fn(),
    uploadPostMedia: vi.fn(),
  },
}))

vi.mock('@/api/products', () => ({
  getAdminProducts: vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('AdminPostsPage', () => {
  const sampleProduct = {
    id: 'prod-1',
    name: 'iPhone 15 Pro Max',
    brand: 'Apple',
    model: '15 Pro Max',
    price: '30000000',
    minPriceVnd: '30000000',
    maxPriceVnd: '30000000',
    currency: 'VND',
    category: { id: 'c1', name: 'Điện thoại' },
    primaryImageUrl: 'https://example.com/iphone.jpg',
    inStock: true,
  }

  const samplePost: PostItem = {
    id: 'post-1',
    authorId: 'admin-1',
    authorName: 'Quản trị viên',
    authorRole: 'admin',
    content: 'Đánh giá chi tiết siêu phẩm iPhone 15 Pro Max',
    media: [
      {
        id: 'med-1',
        fileName: 'iphone.jpg',
        fileSize: 10240,
        fileType: 'image',
        fileUrl: '/api/v1/posts/media/med-1',
        mimeType: 'image/jpeg',
        position: 0,
      },
    ],
    referredProducts: [
      {
        id: 'prod-1',
        name: 'iPhone 15 Pro Max',
        brand: 'Apple',
        price: '30000000',
        currency: 'VND',
        imageUrl: 'https://example.com/iphone.jpg',
        inStock: true,
        active: true,
      },
    ],
    reactions: {
      totalCount: 5,
      counts: { like: 3, love: 2, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'like',
    },
    commentCount: 2,
    createdAt: '2026-10-21T08:00:00Z',
    updatedAt: '2026-10-21T08:00:00Z',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    mockNavigate.mockReset()
    // Setup clipboard mock
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders empty state in Vietnamese when there are no posts', async () => {
    vi.mocked(postsApi.listPosts).mockResolvedValue({
      data: [],
      meta: {
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
        timestamp: '2026-10-21T00:00:00Z',
      },
      message: 'OK',
    })

    render(
      <MemoryRouter>
        <AdminPostsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Chưa có bài viết nào')).toBeInTheDocument()
    })
  })

  it('renders posts list with content, referred products, and action buttons', async () => {
    vi.mocked(postsApi.listPosts).mockResolvedValue({
      data: [samplePost],
      meta: {
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        timestamp: '2026-10-21T00:00:00Z',
      },
      message: 'OK',
    })

    render(
      <MemoryRouter>
        <AdminPostsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Đánh giá chi tiết siêu phẩm iPhone 15 Pro Max')).toBeInTheDocument()
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
      expect(screen.getAllByText('Quản trị viên').length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: /xem chi tiết/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /chỉnh sửa/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /xóa/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /chia sẻ/i })).toBeInTheDocument()
    })
  })

  it('navigates to post detail when clicking "Xem chi tiết"', async () => {
    vi.mocked(postsApi.listPosts).mockResolvedValue({
      data: [samplePost],
      meta: {
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        timestamp: '2026-10-21T00:00:00Z',
      },
      message: 'OK',
    })

    render(
      <MemoryRouter>
        <AdminPostsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /xem chi tiết/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /xem chi tiết/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/posts/post-1')
  })

  it('copies post link and displays toast "Đã sao chép liên kết bài viết" on share click', async () => {
    vi.mocked(postsApi.listPosts).mockResolvedValue({
      data: [samplePost],
      meta: {
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        timestamp: '2026-10-21T00:00:00Z',
      },
      message: 'OK',
    })

    render(
      <MemoryRouter>
        <AdminPostsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /chia sẻ/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /chia sẻ/i }))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/posts/post-1')
    )

    await waitFor(() => {
      expect(screen.getByText('Đã sao chép liên kết bài viết')).toBeInTheDocument()
    })
  })

  it('opens confirmation dialog and deletes post when clicking "Xóa"', async () => {
    vi.mocked(postsApi.listPosts).mockResolvedValue({
      data: [samplePost],
      meta: {
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        timestamp: '2026-10-21T00:00:00Z',
      },
      message: 'OK',
    })
    vi.mocked(postsApi.deleteAdminPost).mockResolvedValue({ id: 'post-1' })

    render(
      <MemoryRouter>
        <AdminPostsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /xóa/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /xóa/i }))

    await waitFor(() => {
      expect(screen.getByText(/bạn có chắc chắn muốn xóa bài viết này/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /xác nhận xóa/i }))

    await waitFor(() => {
      expect(postsApi.deleteAdminPost).toHaveBeenCalledWith('post-1')
    })
  })

  it('validates empty content and missing referred products when creating a post', async () => {
    vi.mocked(postsApi.listPosts).mockResolvedValue({
      data: [],
      meta: {
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
        timestamp: '2026-10-21T00:00:00Z',
      },
      message: 'OK',
    })

    render(
      <MemoryRouter>
        <AdminPostsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^tạo bài viết$/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /^tạo bài viết$/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Click submit with empty form
    fireEvent.click(screen.getByRole('button', { name: /đăng bài viết/i }))

    await waitFor(() => {
      expect(screen.getByText('Nội dung bài viết phải từ 1 đến 5.000 ký tự')).toBeInTheDocument()
      expect(screen.getByText('Vui lòng chọn từ 1 đến 10 sản phẩm giới thiệu')).toBeInTheDocument()
    })
  })

  it('allows searching products, selecting products, uploading media, and creating post successfully', async () => {
    vi.mocked(postsApi.listPosts).mockResolvedValue({
      data: [],
      meta: {
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
        timestamp: '2026-10-21T00:00:00Z',
      },
      message: 'OK',
    })
    vi.mocked(getAdminProducts).mockResolvedValue({
      data: [sampleProduct as any],
      meta: { timestamp: '2026-10-21T00:00:00Z' },
      message: 'OK',
    })
    vi.mocked(postsApi.uploadPostMedia).mockResolvedValue({
      id: 'med-new-1',
      fileName: 'test.jpg',
      fileSize: 5000,
      fileType: 'image',
      fileUrl: '/api/v1/posts/media/med-new-1',
      mimeType: 'image/jpeg',
      position: 0,
    })
    vi.mocked(postsApi.createAdminPost).mockResolvedValue({
      ...samplePost,
      id: 'post-created',
      content: 'Bài viết mới tinh',
    } as any)

    render(
      <MemoryRouter>
        <AdminPostsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^tạo bài viết$/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /^tạo bài viết$/i }))

    // Type content
    const textarea = screen.getByPlaceholderText(/nhập nội dung bài viết/i)
    fireEvent.change(textarea, { target: { value: 'Bài viết mới tinh' } })

    // Search and select product
    const productSearchInput = screen.getByPlaceholderText(/tìm kiếm sản phẩm/i)
    fireEvent.change(productSearchInput, { target: { value: 'iPhone' } })

    await waitFor(() => {
      expect(getAdminProducts).toHaveBeenCalled()
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    })

    // Click on product to add
    fireEvent.click(screen.getByRole('button', { name: /chọn sản phẩm/i }))

    // Upload image
    const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' })
    const fileInput = screen.getByLabelText(/tải lên ảnh hoặc video/i)
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(postsApi.uploadPostMedia).toHaveBeenCalledTimes(1)
      expect(screen.getByText('test.jpg')).toBeInTheDocument()
    })

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /đăng bài viết/i }))

    await waitFor(() => {
      expect(postsApi.createAdminPost).toHaveBeenCalledWith({
        content: 'Bài viết mới tinh',
        mediaIds: ['med-new-1'],
        referredProductIds: ['prod-1'],
      })
    })
  })
})
