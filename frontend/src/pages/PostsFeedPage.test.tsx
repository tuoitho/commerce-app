import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PostsFeedPage } from './PostsFeedPage'
import { postsApi } from '@/api/posts'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

vi.mock('@/api/posts', () => ({
  postsApi: {
    listPosts: vi.fn(),
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/ToastContext', () => ({
  useToast: vi.fn(),
}))

describe('PostsFeedPage Component', () => {
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

  it('renders post list when API succeeds (Req 2.1, 2.2)', async () => {
    vi.mocked(postsApi.listPosts).mockResolvedValue({
      data: [
        {
          id: 'p-1',
          authorId: 'a-1',
          authorName: 'Quản trị viên',
          authorRole: 'admin',
          content: 'Bài viết số một về công nghệ...',
          createdAt: '2026-10-20T10:00:00Z',
          updatedAt: '2026-10-20T10:00:00Z',
          media: [],
          referredProducts: [],
          reactions: {
            totalCount: 0,
            counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
            viewerReaction: null,
          },
          commentCount: 0,
        },
      ],
      meta: {
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        timestamp: '2026-10-21T00:00:00Z',
      },
      message: 'OK',
    } as any)

    render(
      <MemoryRouter>
        <PostsFeedPage />
      </MemoryRouter>
    )

    expect(screen.getByTestId('posts-feed-loading')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Bài viết số một về công nghệ...')).toBeInTheDocument()
    })
  })

  it('renders empty state when no posts exist (Req 2.6)', async () => {
    vi.mocked(postsApi.listPosts).mockResolvedValue({
      data: [],
      meta: {
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        timestamp: '2026-10-21T00:00:00Z',
      },
      message: 'OK',
    } as any)

    render(
      <MemoryRouter>
        <PostsFeedPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/chưa có bài viết nào/i)).toBeInTheDocument()
    })
  })

  it('renders error state and handles retry button when API fails', async () => {
    vi.mocked(postsApi.listPosts)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        data: [
          {
            id: 'p-2',
            authorId: 'a-1',
            authorName: 'Quản trị viên',
            authorRole: 'admin',
            content: 'Bài viết sau khi thử lại',
            createdAt: '2026-10-20T10:00:00Z',
            updatedAt: '2026-10-20T10:00:00Z',
            media: [],
            referredProducts: [],
            reactions: {
              totalCount: 0,
              counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
              viewerReaction: null,
            },
            commentCount: 0,
          },
        ],
        meta: {
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
          timestamp: '2026-10-21T00:00:00Z',
        },
        message: 'OK',
      } as any)

    render(
      <MemoryRouter>
        <PostsFeedPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/không thể tải danh sách bài viết/i)).toBeInTheDocument()
    })

    const retryBtn = screen.getByRole('button', { name: /thử lại/i })
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('Bài viết sau khi thử lại')).toBeInTheDocument()
    })
  })
})
