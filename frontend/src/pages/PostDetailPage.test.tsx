import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { PostDetailPage } from './PostDetailPage'
import { postsApi, type PostDetail } from '@/api/posts'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

vi.mock('@/api/posts', () => ({
  postsApi: {
    getPostById: vi.fn(),
    setPostReaction: vi.fn(),
    createComment: vi.fn(),
    deleteComment: vi.fn(),
    setCommentReaction: vi.fn(),
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/ToastContext', () => ({
  useToast: vi.fn(),
}))

describe('PostDetailPage Component', () => {
  const samplePostDetail: PostDetail = {
    id: 'post-100',
    authorId: 'admin-1',
    authorName: 'Quản trị viên',
    authorRole: 'admin',
    content: 'Chi tiết sản phẩm mới nhất 2026...',
    media: [
      {
        id: 'media-1',
        fileUrl: '/api/v1/posts/media/media-1',
        fileType: 'image',
        fileName: 'cover.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        position: 0,
      },
    ],
    referredProducts: [
      {
        id: 'prod-1',
        name: 'iPhone 16 Pro Max',
        brand: 'Apple',
        price: '34990000',
        currency: 'VND',
        imageUrl: '/images/iphone16.jpg',
        inStock: true,
        active: true,
      },
    ],
    reactions: {
      totalCount: 5,
      counts: { like: 3, love: 2, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: null,
    },
    commentCount: 2,
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    comments: [
      {
        id: 'root-c1',
        postId: 'post-100',
        authorId: 'user-1',
        authorName: 'Nguyễn Văn A',
        authorRole: 'customer',
        parentId: null,
        replyToUserId: null,
        replyToUserName: null,
        content: 'Bình luận gốc cấp 1',
        reactions: {
          totalCount: 0,
          counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
          viewerReaction: null,
        },
        createdAt: '2026-10-20T11:00:00Z',
        updatedAt: '2026-10-20T11:00:00Z',
        replies: [
          {
            id: 'reply-c2',
            postId: 'post-100',
            authorId: 'user-2',
            authorName: 'Trần Thị B',
            authorRole: 'customer',
            parentId: 'root-c1',
            replyToUserId: 'user-1',
            replyToUserName: 'Nguyễn Văn A',
            content: 'Phản hồi cấp 2',
            reactions: {
              totalCount: 0,
              counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
              viewerReaction: null,
            },
            createdAt: '2026-10-20T11:05:00Z',
            updatedAt: '2026-10-20T11:05:00Z',
          },
        ],
      },
    ],
  }

  const mockToastError = vi.fn()
  const mockToastSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useToast).mockReturnValue({
      success: mockToastSuccess,
      error: mockToastError,
      info: vi.fn(),
      toast: vi.fn(),
    })
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      user: null,
      accessToken: null,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    // Mock scrollIntoView and focus on HTMLElement prototype
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    window.HTMLElement.prototype.focus = vi.fn()
  })

  it('renders post detail, media, referred products and comments when found (Req 2.1, 2.2)', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)

    render(
      <MemoryRouter initialEntries={['/posts/post-100']}>
        <Routes>
          <Route path="/posts/:id" element={<PostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Chi tiết sản phẩm mới nhất 2026...')).toBeInTheDocument()
      expect(screen.getByText('iPhone 16 Pro Max')).toBeInTheDocument()
      expect(screen.getByText('Bình luận gốc cấp 1')).toBeInTheDocument()
    })

    // Check post article element id
    expect(document.getElementById('post-article-post-100')).toBeInTheDocument()
  })

  it('renders 404 state in Vietnamese when post is not found (Req 2.7)', async () => {
    vi.mocked(postsApi.getPostById).mockRejectedValue(new Error('Post not found'))

    render(
      <MemoryRouter initialEntries={['/posts/non-existent-id']}>
        <Routes>
          <Route path="/posts/:id" element={<PostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Bài viết không tồn tại hoặc đã bị xóa/i)).toBeInTheDocument()
    })
  })

  it('scrolls and highlights post article when focus=post is provided (Req 7.2)', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)

    render(
      <MemoryRouter initialEntries={['/posts/post-100?focus=post&focusTs=123456']}>
        <Routes>
          <Route path="/posts/:id" element={<PostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Chi tiết sản phẩm mới nhất 2026...')).toBeInTheDocument()
    })

    const article = document.getElementById('post-article-post-100')
    expect(article).toBeInTheDocument()

    await waitFor(() => {
      expect(article?.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
      expect(article?.focus).toHaveBeenCalledWith({ preventScroll: true })
      expect(article?.className).toContain('ring-2 ring-emerald-500 bg-emerald-50/40')
    })
  })

  it('auto-expands parent thread, scrolls and highlights level-2 reply when commentId is provided (Req 7.3)', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)

    render(
      <MemoryRouter initialEntries={['/posts/post-100?commentId=reply-c2&focusTs=123456']}>
        <Routes>
          <Route path="/posts/:id" element={<PostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Phản hồi cấp 2')).toBeInTheDocument()
    })

    const replyEl = document.getElementById('comment-reply-c2')
    expect(replyEl).toBeInTheDocument()

    await waitFor(() => {
      expect(replyEl?.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
      expect(replyEl?.focus).toHaveBeenCalledWith({ preventScroll: true })
    })
  })

  it('displays Vietnamese message when commentId does not exist in post (Req 7.5)', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)

    render(
      <MemoryRouter initialEntries={['/posts/post-100?commentId=deleted-comment-999&focusTs=123456']}>
        <Routes>
          <Route path="/posts/:id" element={<PostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Bình luận mục tiêu không còn tồn tại hoặc đã bị xóa/i)).toBeInTheDocument()
    })
  })

  it('re-triggers scroll and highlight when focusTs changes on the same post (Req 7.4)', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)

    let testNavigate: (path: string) => void = () => {}
    function NavHelper() {
      const navigate = useNavigate()
      testNavigate = navigate
      return null
    }

    render(
      <MemoryRouter initialEntries={['/posts/post-100?commentId=root-c1&focusTs=100']}>
        <NavHelper />
        <Routes>
          <Route path="/posts/:id" element={<PostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Bình luận gốc cấp 1')).toBeInTheDocument()
    })

    const rootEl = document.getElementById('comment-root-c1')
    await waitFor(() => {
      expect(rootEl?.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })

    vi.mocked(rootEl!.scrollIntoView).mockClear()

    // Now navigate to focus=post with new focusTs
    act(() => {
      testNavigate('/posts/post-100?focus=post&focusTs=200')
    })

    const article = document.getElementById('post-article-post-100')
    await waitFor(() => {
      expect(article?.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
      expect(article?.focus).toHaveBeenCalledWith({ preventScroll: true })
    })
  })

  it('collapses auto-expanded thread when user clicks collapse in PostDetailPage', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)

    render(
      <MemoryRouter initialEntries={['/posts/post-100?commentId=reply-c2&focusTs=123']}>
        <Routes>
          <Route path="/posts/:id" element={<PostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Phản hồi cấp 2')).toBeInTheDocument()
    })

    const toggleBtn = screen.getByTestId('toggle-replies-root-c1')
    expect(toggleBtn).toHaveTextContent(/Thu gọn câu trả lời/i)

    fireEvent.click(toggleBtn)

    await waitFor(() => {
      expect(screen.queryByText('Phản hồi cấp 2')).not.toBeInTheDocument()
    })
  })

  it('persists comment reactions when post is subsequently updated in PostDetailPage', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-auth', email: 'user@test.com', role: 'customer' } as any,
      accessToken: 'token-auth',
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(postsApi.setCommentReaction).mockResolvedValue({
      totalCount: 1,
      counts: { like: 0, love: 1, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'love',
    })
    vi.mocked(postsApi.setPostReaction).mockResolvedValue({
      totalCount: 6,
      counts: { like: 3, love: 3, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'love',
    })

    render(
      <MemoryRouter initialEntries={['/posts/post-100']}>
        <Routes>
          <Route path="/posts/:id" element={<PostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Bình luận gốc cấp 1')).toBeInTheDocument()
    })

    // React to comment root-c1 with love
    const commentReactBtn = screen.getByTestId('comment-reaction-trigger-root-c1')
    fireEvent.click(commentReactBtn)
    const commentLoveOption = screen.getByTestId('comment-reaction-btn-root-c1-love')
    fireEvent.click(commentLoveOption)

    await waitFor(() => {
      expect(postsApi.setCommentReaction).toHaveBeenCalledWith('root-c1', 'love')
      expect(screen.getByTestId('comment-reactions-summary-root-c1')).toHaveTextContent('1')
    })

    // Now react to the post via ReactionBar
    const postReactTrigger = screen.getByTestId('reaction-trigger-button')
    fireEvent.click(postReactTrigger)

    await waitFor(() => {
      expect(postsApi.setPostReaction).toHaveBeenCalled()
    })

    // Comment reaction must NOT revert to 0
    expect(screen.getByTestId('comment-reactions-summary-root-c1')).toHaveTextContent('1')
  })

  it('does not re-trigger deep-link scrollIntoView on subsequent post interactions, but re-triggers when focusTs changes', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-auth', email: 'user@test.com', role: 'customer' } as any,
      accessToken: 'token-auth',
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(postsApi.setPostReaction).mockResolvedValue({
      totalCount: 6,
      counts: { like: 4, love: 2, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'like',
    })

    let testNavigate: (path: string) => void = () => {}
    function NavHelper() {
      const navigate = useNavigate()
      testNavigate = navigate
      return null
    }

    render(
      <MemoryRouter initialEntries={['/posts/post-100?commentId=root-c1&focusTs=100']}>
        <NavHelper />
        <Routes>
          <Route path="/posts/:id" element={<PostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Bình luận gốc cấp 1')).toBeInTheDocument()
    })

    const rootEl = document.getElementById('comment-root-c1')
    await waitFor(() => {
      expect(rootEl?.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })

    const scrollSpy = vi.mocked(window.HTMLElement.prototype.scrollIntoView)
    scrollSpy.mockClear()

    // Mutate post state by reacting to the post
    const postReactTrigger = screen.getByTestId('reaction-trigger-button')
    await act(async () => {
      fireEvent.click(postReactTrigger)
    })

    await waitFor(() => {
      expect(postsApi.setPostReaction).toHaveBeenCalled()
    })

    // Wait a tick to ensure no deferred scroll fired
    await new Promise((resolve) => setTimeout(resolve, 150))

    // scrollIntoView must NOT have been called on subsequent interaction
    expect(scrollSpy).not.toHaveBeenCalled()

    // Changing focusTs DOES re-trigger scrollIntoView
    act(() => {
      testNavigate('/posts/post-100?commentId=root-c1&focusTs=200')
    })

    await waitFor(() => {
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })
  })

  it('refetches post detail when navigating to a newly created commentId while already on the post page', async () => {
    const updatedPostDetail: PostDetail = {
      ...samplePostDetail,
      commentCount: 3,
      comments: [
        {
          ...samplePostDetail.comments[0],
          replies: [
            ...samplePostDetail.comments[0].replies,
            {
              id: 'reply-newly-arrived',
              postId: 'post-100',
              authorId: 'admin-1',
              authorName: 'Quản trị viên',
              authorRole: 'admin',
              parentId: 'root-c1',
              replyToUserId: 'user-10',
              replyToUserName: 'Nguyễn Văn A',
              content: 'Phản hồi mới vừa gửi qua WebSocket',
              reactions: {
                totalCount: 0,
                counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
                viewerReaction: null,
              },
              createdAt: '2026-10-21T09:20:00Z',
              updatedAt: '2026-10-21T09:20:00Z',
            },
          ],
        },
      ],
    }

    vi.mocked(postsApi.getPostById)
      .mockResolvedValueOnce(samplePostDetail)
      .mockResolvedValueOnce(updatedPostDetail)

    let testNavigate: (path: string) => void = () => {}
    function NavHelper() {
      const navigate = useNavigate()
      testNavigate = navigate
      return null
    }

    render(
      <MemoryRouter initialEntries={['/posts/post-100']}>
        <NavHelper />
        <Routes>
          <Route path="/posts/:id" element={<PostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Bình luận gốc cấp 1')).toBeInTheDocument()
    })

    act(() => {
      testNavigate('/posts/post-100?commentId=reply-newly-arrived&focusTs=1792576778078')
    })

    await waitFor(() => {
      expect(screen.getByText(/Phản hồi mới vừa gửi qua WebSocket/i)).toBeInTheDocument()
      expect(
        screen.queryByText(/Bình luận mục tiêu không còn tồn tại hoặc đã bị xóa/i)
      ).not.toBeInTheDocument()
      const newCommentEl = document.getElementById('comment-reply-newly-arrived')
      expect(newCommentEl).toBeInTheDocument()
      expect(newCommentEl?.className).toContain('ring-2 ring-emerald-500')
    })
  })
})
