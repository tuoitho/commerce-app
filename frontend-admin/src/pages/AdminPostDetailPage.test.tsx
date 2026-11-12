import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { AdminPostDetailPage } from './AdminPostDetailPage'
import { postsApi, type PostDetail } from '@/api/posts'

vi.mock('@/api/posts', () => ({
  postsApi: {
    getPostById: vi.fn(),
    setPostReaction: vi.fn(),
    createComment: vi.fn(),
    deleteComment: vi.fn(),
    setCommentReaction: vi.fn(),
  },
}))

describe('AdminPostDetailPage', () => {
  const samplePostDetail: PostDetail = {
    id: 'post-1',
    authorId: 'admin-1',
    authorName: 'Quản trị viên',
    authorRole: 'admin',
    content: 'Đánh giá chuyên sâu iPhone 15 Pro Max bản Titan Tự Nhiên',
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
        id: 'prod-10',
        name: 'iPhone 15 Pro Max 256GB',
        brand: 'Apple',
        price: '29990000',
        currency: 'VND',
        imageUrl: 'https://example.com/ip15.jpg',
        inStock: true,
        active: true,
      },
    ],
    reactions: {
      totalCount: 2,
      counts: { like: 1, love: 1, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'love',
    },
    commentCount: 2,
    createdAt: '2026-10-21T08:00:00Z',
    updatedAt: '2026-10-21T08:00:00Z',
    comments: [
      {
        id: 'comment-root-1',
        postId: 'post-1',
        authorId: 'user-1',
        authorName: 'Nguyễn Văn A',
        authorRole: 'customer',
        parentId: null,
        replyToUserId: null,
        replyToUserName: null,
        content: 'Bình luận gốc cấp 1 tuyệt vời',
        reactions: {
          totalCount: 1,
          counts: { like: 1, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
          viewerReaction: 'like',
        },
        createdAt: '2026-10-21T08:10:00Z',
        updatedAt: '2026-10-21T08:10:00Z',
        replies: [
          {
            id: 'comment-reply-1',
            postId: 'post-1',
            authorId: 'admin-1',
            authorName: 'Quản trị viên',
            authorRole: 'admin',
            parentId: 'comment-root-1',
            replyToUserId: 'user-1',
            replyToUserName: 'Nguyễn Văn A',
            content: 'Dạ AuraPhone cảm ơn quý khách!',
            reactions: {
              totalCount: 0,
              counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
              viewerReaction: null,
            },
            createdAt: '2026-10-21T08:15:00Z',
            updatedAt: '2026-10-21T08:15:00Z',
          },
        ],
      },
    ],
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    // Setup clipboard mock
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders 404 message in Vietnamese when post is not found', async () => {
    vi.mocked(postsApi.getPostById).mockRejectedValue(new Error('Post not found'))

    render(
      <MemoryRouter initialEntries={['/posts/invalid-id']}>
        <Routes>
          <Route path="/posts/:id" element={<AdminPostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Bài viết không tồn tại hoặc đã bị xóa')).toBeInTheDocument()
    })
  })

  it('renders post details, referred product cards, media, and comments correctly', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)

    render(
      <MemoryRouter initialEntries={['/posts/post-1']}>
        <Routes>
          <Route path="/posts/:id" element={<AdminPostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Đánh giá chuyên sâu iPhone 15 Pro Max bản Titan Tự Nhiên')).toBeInTheDocument()
      expect(screen.getByText('iPhone 15 Pro Max 256GB')).toBeInTheDocument()
      expect(screen.getByText('Bình luận gốc cấp 1 tuyệt vời')).toBeInTheDocument()
    })

    // Article has id `#post-article-post-1` with tabIndex -1
    const article = document.getElementById('post-article-post-1')
    expect(article).toBeInTheDocument()
    expect(article).toHaveAttribute('tabIndex', '-1')
  })

  it('allows Admin to toggle reaction on post', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)
    vi.mocked(postsApi.setPostReaction).mockResolvedValue({
      totalCount: 1,
      counts: { like: 1, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: null, // toggled off love
    })

    render(
      <MemoryRouter initialEntries={['/posts/post-1']}>
        <Routes>
          <Route path="/posts/:id" element={<AdminPostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('post-reaction-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('post-reaction-button'))

    await waitFor(() => {
      expect(postsApi.setPostReaction).toHaveBeenCalledWith('post-1', null)
    })
  })

  it('copies share link and displays toast "Đã sao chép liên kết bài viết"', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)

    render(
      <MemoryRouter initialEntries={['/posts/post-1']}>
        <Routes>
          <Route path="/posts/:id" element={<AdminPostDetailPage />} />
        </Routes>
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

  it('allows Admin to add a new root comment and delete comment', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)
    vi.mocked(postsApi.createComment).mockResolvedValue({
      id: 'comment-new',
      postId: 'post-1',
      authorId: 'admin-1',
      authorName: 'Quản trị viên',
      authorRole: 'admin',
      parentId: null,
      replyToUserId: null,
      replyToUserName: null,
      content: 'Bình luận mới của quản trị',
      reactions: {
        totalCount: 0,
        counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
        viewerReaction: null,
      },
      createdAt: '2026-10-21T08:20:00Z',
      updatedAt: '2026-10-21T08:20:00Z',
    })
    vi.mocked(postsApi.deleteComment).mockResolvedValue({
      deletedCommentId: 'comment-root-1',
      commentCount: 0,
    })

    render(
      <MemoryRouter initialEntries={['/posts/post-1']}>
        <Routes>
          <Route path="/posts/:id" element={<AdminPostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/viết bình luận/i)).toBeInTheDocument()
    })

    // Add root comment
    const commentInput = screen.getByPlaceholderText(/viết bình luận/i)
    fireEvent.change(commentInput, { target: { value: 'Bình luận mới của quản trị' } })
    fireEvent.click(screen.getByRole('button', { name: /gửi bình luận/i }))

    await waitFor(() => {
      expect(postsApi.createComment).toHaveBeenCalledWith('post-1', {
        content: 'Bình luận mới của quản trị',
        parentCommentId: null,
      })
      expect(screen.getByText('Bình luận mới của quản trị')).toBeInTheDocument()
    })

    const existingRootNode = document.getElementById('comment-comment-root-1')
    const newRootNode = document.getElementById('comment-comment-new')
    expect(existingRootNode).toBeInTheDocument()
    expect(newRootNode).toBeInTheDocument()
    expect(
      existingRootNode!.compareDocumentPosition(newRootNode!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    // Delete comment
    const deleteBtn = screen.getByTestId('delete-comment-comment-root-1')
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(postsApi.deleteComment).toHaveBeenCalledWith('post-1', 'comment-root-1')
    })
  })

  it('auto-scrolls and highlights post when focus=post is present', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)

    render(
      <MemoryRouter initialEntries={['/posts/post-1?focus=post&focusTs=1700000000']}>
        <Routes>
          <Route path="/posts/:id" element={<AdminPostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      const article = document.getElementById('post-article-post-1')
      expect(article).toBeInTheDocument()
      expect(article).toHaveClass('ring-2')
      expect(article).toHaveClass('ring-emerald-500')
    })
  })

  it('auto-expands parent thread, scrolls, and highlights comment when commentId is present', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)

    render(
      <MemoryRouter initialEntries={['/posts/post-1?commentId=comment-reply-1&focusTs=1700000001']}>
        <Routes>
          <Route path="/posts/:id" element={<AdminPostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      const targetComment = document.getElementById('comment-comment-reply-1')
      expect(targetComment).toBeInTheDocument()
      expect(targetComment).toHaveClass('ring-2')
      expect(targetComment).toHaveClass('ring-emerald-500')
    })
  })

  it('displays alert in Vietnamese when target commentId does not exist', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)

    render(
      <MemoryRouter initialEntries={['/posts/post-1?commentId=non-existent-comment&focusTs=1700000002']}>
        <Routes>
          <Route path="/posts/:id" element={<AdminPostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(
        screen.getByText('Bình luận mục tiêu không còn tồn tại hoặc đã bị xóa')
      ).toBeInTheDocument()
    })
  })

  it('does not re-trigger deep-link scrollIntoView on subsequent post interactions, but re-triggers when focusTs changes', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)
    vi.mocked(postsApi.createComment).mockResolvedValue({
      id: 'comment-new-1',
      postId: 'post-1',
      authorId: 'admin-1',
      authorName: 'Quản trị viên',
      authorRole: 'admin',
      parentId: null,
      replyToUserId: null,
      replyToUserName: null,
      content: 'Thêm bình luận mới',
      reactions: {
        totalCount: 0,
        counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
        viewerReaction: null,
      },
      createdAt: '2026-10-21T09:00:00Z',
      updatedAt: '2026-10-21T09:00:00Z',
    })

    let testNavigate: (path: string) => void = () => {}
    function NavHelper() {
      const navigate = useNavigate()
      testNavigate = navigate
      return null
    }

    render(
      <MemoryRouter initialEntries={['/posts/post-1?commentId=comment-root-1&focusTs=100']}>
        <NavHelper />
        <Routes>
          <Route path="/posts/:id" element={<AdminPostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      const targetComment = document.getElementById('comment-comment-root-1')
      expect(targetComment).toBeInTheDocument()
      expect(targetComment?.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })

    const scrollSpy = vi.mocked(window.HTMLElement.prototype.scrollIntoView)
    scrollSpy.mockClear()

    // Add a comment to mutate post state
    const commentInput = screen.getByPlaceholderText(/viết bình luận/i)
    fireEvent.change(commentInput, { target: { value: 'Thêm bình luận mới' } })
    fireEvent.click(screen.getByRole('button', { name: /gửi bình luận/i }))

    await waitFor(() => {
      expect(postsApi.createComment).toHaveBeenCalled()
      expect(screen.getByText('Thêm bình luận mới')).toBeInTheDocument()
    })

    // Wait a tick to ensure no deferred scroll fired
    await new Promise((resolve) => setTimeout(resolve, 150))

    // scrollIntoView must NOT have been called on subsequent interaction
    expect(scrollSpy).not.toHaveBeenCalled()

    // Changing focusTs DOES re-trigger scrollIntoView
    act(() => {
      testNavigate('/posts/post-1?commentId=comment-root-1&focusTs=200')
    })

    await waitFor(() => {
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })
  })

  it('enables keyboard accessibility for post reaction picker (Req 8.3)', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)
    vi.mocked(postsApi.setPostReaction).mockResolvedValue({
      totalCount: 3,
      counts: { like: 1, love: 1, haha: 1, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'haha',
    })

    render(
      <MemoryRouter initialEntries={['/posts/post-1']}>
        <Routes>
          <Route path="/posts/:id" element={<AdminPostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('post-reaction-button')).toBeInTheDocument()
    })

    const reactionBtn = screen.getByTestId('post-reaction-button')

    // 1. Focusing opens the picker
    fireEvent.focus(reactionBtn)
    expect(screen.getByTestId('post-reaction-option-haha')).toBeInTheDocument()

    // 2. Escape closes the picker
    fireEvent.keyDown(reactionBtn, { key: 'Escape' })
    expect(screen.queryByTestId('post-reaction-option-haha')).not.toBeInTheDocument()

    // 3. ArrowUp opens the picker
    fireEvent.keyDown(reactionBtn, { key: 'ArrowUp' })
    expect(screen.getByTestId('post-reaction-option-haha')).toBeInTheDocument()

    // 4. Click an emotion
    fireEvent.click(screen.getByTestId('post-reaction-option-haha'))

    await waitFor(() => {
      expect(postsApi.setPostReaction).toHaveBeenCalledWith('post-1', 'haha')
      expect(screen.queryByTestId('post-reaction-option-haha')).not.toBeInTheDocument()
    })
  })

  it('sends parentCommentId of the target level-2 reply when replying to a level-2 comment', async () => {
    vi.mocked(postsApi.getPostById).mockResolvedValue(samplePostDetail)
    vi.mocked(postsApi.createComment).mockResolvedValue({
      id: 'comment-reply-2',
      postId: 'post-1',
      authorId: 'admin-1',
      authorName: 'Quản trị viên',
      authorRole: 'admin',
      parentId: 'comment-root-1',
      replyToUserId: 'admin-1',
      replyToUserName: 'Quản trị viên',
      content: 'Phản hồi trực tiếp vào bình luận cấp 2',
      reactions: {
        totalCount: 0,
        counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
        viewerReaction: null,
      },
      createdAt: '2026-10-21T09:10:00Z',
      updatedAt: '2026-10-21T09:10:00Z',
    })

    render(
      <MemoryRouter initialEntries={['/posts/post-1']}>
        <Routes>
          <Route path="/posts/:id" element={<AdminPostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/xem 1 phản hồi/i)).toBeInTheDocument()
    })

    // Expand thread to reveal level-2 reply (comment-reply-1)
    fireEvent.click(screen.getByText(/xem 1 phản hồi/i))

    await waitFor(() => {
      expect(screen.getByText(/Dạ AuraPhone cảm ơn quý khách!/i)).toBeInTheDocument()
    })

    // Click "Trả lời" on the level-2 reply (second "Trả lời" button)
    const replyButtons = screen.getAllByRole('button', { name: 'Trả lời' })
    fireEvent.click(replyButtons[1])

    const replyInput = screen.getByPlaceholderText(/trả lời @/i)
    fireEvent.change(replyInput, { target: { value: 'Phản hồi trực tiếp vào bình luận cấp 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }))

    await waitFor(() => {
      expect(postsApi.createComment).toHaveBeenCalledWith('post-1', {
        content: 'Phản hồi trực tiếp vào bình luận cấp 2',
        parentCommentId: 'comment-reply-1',
      })
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
              id: 'comment-newly-arrived',
              postId: 'post-1',
              authorId: 'user-2',
              authorName: 'Trần Thị B',
              authorRole: 'customer',
              parentId: 'comment-root-1',
              replyToUserId: 'admin-1',
              replyToUserName: 'Quản trị viên',
              content: 'Bình luận mới vừa gửi qua WebSocket',
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
      <MemoryRouter initialEntries={['/posts/post-1']}>
        <NavHelper />
        <Routes>
          <Route path="/posts/:id" element={<AdminPostDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Bình luận gốc cấp 1 tuyệt vời')).toBeInTheDocument()
    })

    // User clicks a notification for comment-newly-arrived while already on /posts/post-1
    act(() => {
      testNavigate('/posts/post-1?commentId=comment-newly-arrived&focusTs=1792576778078')
    })

    await waitFor(() => {
      expect(screen.getByText(/Bình luận mới vừa gửi qua WebSocket/i)).toBeInTheDocument()
      expect(
        screen.queryByText('Bình luận mục tiêu không còn tồn tại hoặc đã bị xóa')
      ).not.toBeInTheDocument()
      const newCommentEl = document.getElementById('comment-comment-newly-arrived')
      expect(newCommentEl).toBeInTheDocument()
      expect(newCommentEl).toHaveClass('ring-2')
      expect(newCommentEl).toHaveClass('ring-emerald-500')
    })
  })
})
