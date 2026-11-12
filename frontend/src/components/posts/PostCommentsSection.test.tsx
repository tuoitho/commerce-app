import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PostCommentsSection } from './PostCommentsSection'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { postsApi } from '@/api/posts'
import type { PostCommentThread, ReactionSummary } from '@/api/posts'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/ToastContext', () => ({
  useToast: vi.fn(),
}))

vi.mock('@/api/posts', () => ({
  postsApi: {
    createComment: vi.fn(),
    deleteComment: vi.fn(),
    setCommentReaction: vi.fn(),
  },
}))

describe('PostCommentsSection Component', () => {
  const emptyReactions: ReactionSummary = {
    totalCount: 0,
    counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
    viewerReaction: null,
  }

  const sampleComments: PostCommentThread[] = [
    {
      id: 'root-1',
      postId: 'post-1',
      authorId: 'admin-1',
      authorName: 'Quản trị viên',
      authorRole: 'admin',
      parentId: null,
      replyToUserId: null,
      replyToUserName: null,
      content: 'Chào mừng các bạn đến với buổi ra mắt sản phẩm mới!',
      reactions: {
        totalCount: 2,
        counts: { like: 1, love: 1, haha: 0, wow: 0, sad: 0, angry: 0 },
        viewerReaction: null,
      },
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
      replies: [
        {
          id: 'reply-1',
          postId: 'post-1',
          authorId: 'user-2',
          authorName: 'Minh Hoàng',
          authorRole: 'customer',
          parentId: 'root-1',
          replyToUserId: 'admin-1',
          replyToUserName: 'Quản trị viên',
          content: 'Sản phẩm này có sẵn tại showroom Hà Nội chưa shop?',
          reactions: emptyReactions,
          createdAt: '2026-10-20T10:05:00Z',
          updatedAt: '2026-10-20T10:05:00Z',
        },
      ],
    },
  ]

  const mockToastSuccess = vi.fn()
  const mockToastError = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useToast).mockReturnValue({
      success: mockToastSuccess,
      error: mockToastError,
      info: vi.fn(),
      toast: vi.fn(),
    })
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: {
        id: 'user-2',
        email: 'customer@test.com',
        role: 'customer',
      } as any,
      accessToken: 'test-token',
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
  })

  it('renders root comments and replies with proper roles, author names and reply-to references (Req 4.1, 4.2, 4.3)', () => {
    render(
      <MemoryRouter>
        <PostCommentsSection
          postId="post-1"
          comments={sampleComments}
          expandedThreadIds={new Set(['root-1'])}
        />
      </MemoryRouter>
    )

    // Root comment elements
    expect(screen.getAllByText('Quản trị viên').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Chào mừng các bạn đến với buổi ra mắt sản phẩm mới!')).toBeInTheDocument()

    // Level-2 reply
    expect(screen.getByText('Minh Hoàng')).toBeInTheDocument()
    expect(screen.getByText('Sản phẩm này có sẵn tại showroom Hà Nội chưa shop?')).toBeInTheDocument()
    // Reply-to reference
    expect(screen.getByText('@Quản trị viên')).toBeInTheDocument()

    // Check element ids for scrolling/focus
    expect(document.getElementById('comment-root-1')).toBeInTheDocument()
    expect(document.getElementById('comment-reply-1')).toBeInTheDocument()
  })

  it('supports expanding and collapsing reply threads (Req 4.4)', () => {
    render(
      <MemoryRouter>
        <PostCommentsSection
          postId="post-1"
          comments={sampleComments}
        />
      </MemoryRouter>
    )

    // Initially replies might be collapsed or visible depending on toggle
    const toggleBtn = screen.getByTestId('toggle-replies-root-1')
    expect(toggleBtn).toBeInTheDocument()
    expect(toggleBtn).toHaveTextContent(/1 câu trả lời/i)

    // Click to expand
    fireEvent.click(toggleBtn)
    expect(screen.getByText('Minh Hoàng')).toBeInTheDocument()

    // Click to collapse
    fireEvent.click(toggleBtn)
    expect(screen.queryByText('Minh Hoàng')).not.toBeInTheDocument()
  })

  it('submits a new root comment when authenticated (Req 4.1)', async () => {
    const onCommentsChange = vi.fn()
    vi.mocked(postsApi.createComment).mockResolvedValue({
      id: 'root-2',
      postId: 'post-1',
      authorId: 'user-2',
      authorName: 'Minh Hoàng',
      authorRole: 'customer',
      parentId: null,
      replyToUserId: null,
      replyToUserName: null,
      content: 'Bài viết rất hữu ích!',
      reactions: emptyReactions,
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    })

    render(
      <MemoryRouter>
        <PostCommentsSection
          postId="post-1"
          comments={sampleComments}
          onCommentsChange={onCommentsChange}
        />
      </MemoryRouter>
    )

    const input = screen.getByPlaceholderText(/viết bình luận của bạn/i)
    fireEvent.change(input, { target: { value: 'Bài viết rất hữu ích!' } })

    const submitBtn = screen.getByTestId('submit-root-comment')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(postsApi.createComment).toHaveBeenCalledWith('post-1', {
        content: 'Bài viết rất hữu ích!',
      })
      expect(mockToastSuccess).toHaveBeenCalledWith('Đã gửi bình luận')
    })
  })

  it('submits a reply to a comment (Req 4.2, 4.3)', async () => {
    const onCommentsChange = vi.fn()
    vi.mocked(postsApi.createComment).mockResolvedValue({
      id: 'reply-2',
      postId: 'post-1',
      authorId: 'user-2',
      authorName: 'Minh Hoàng',
      authorRole: 'customer',
      parentId: 'root-1',
      replyToUserId: 'admin-1',
      replyToUserName: 'Quản trị viên',
      content: 'Dạ vâng em cảm ơn nhiều!',
      reactions: emptyReactions,
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    })

    render(
      <MemoryRouter>
        <PostCommentsSection
          postId="post-1"
          comments={sampleComments}
          expandedThreadIds={new Set(['root-1'])}
          onCommentsChange={onCommentsChange}
        />
      </MemoryRouter>
    )

    // Click reply button on root comment
    const replyBtn = screen.getByTestId('reply-btn-root-1')
    fireEvent.click(replyBtn)

    const replyInput = screen.getByPlaceholderText(/viết câu trả lời/i)
    fireEvent.change(replyInput, { target: { value: 'Dạ vâng em cảm ơn nhiều!' } })

    const sendReplyBtn = screen.getByTestId('submit-reply-root-1')
    fireEvent.click(sendReplyBtn)

    await waitFor(() => {
      expect(postsApi.createComment).toHaveBeenCalledWith('post-1', {
        content: 'Dạ vâng em cảm ơn nhiều!',
        parentCommentId: 'root-1',
      })
      expect(mockToastSuccess).toHaveBeenCalledWith('Đã gửi câu trả lời')
    })
  })

  it('allows author to delete their own comment (Req 4.5)', async () => {
    const onCommentsChange = vi.fn()
    vi.mocked(postsApi.deleteComment).mockResolvedValue({
      deletedCommentId: 'reply-1',
      commentCount: 1,
    })

    render(
      <MemoryRouter>
        <PostCommentsSection
          postId="post-1"
          comments={sampleComments}
          expandedThreadIds={new Set(['root-1'])}
          onCommentsChange={onCommentsChange}
        />
      </MemoryRouter>
    )

    // Since currentUser is user-2, they own reply-1
    const deleteBtn = screen.getByTestId('delete-comment-reply-1')
    expect(deleteBtn).toBeInTheDocument()

    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(postsApi.deleteComment).toHaveBeenCalledWith('post-1', 'reply-1')
      expect(mockToastSuccess).toHaveBeenCalledWith('Đã xóa bình luận')
    })
  })

  it('handles comment reaction and toggling (Req 5.1, 5.2)', async () => {
    vi.mocked(postsApi.setCommentReaction).mockResolvedValue({
      totalCount: 1,
      counts: { like: 1, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'like',
    })

    render(
      <MemoryRouter>
        <PostCommentsSection
          postId="post-1"
          comments={sampleComments}
        />
      </MemoryRouter>
    )

    const reactBtn = screen.getByTestId('comment-reaction-trigger-root-1')
    fireEvent.click(reactBtn)

    // Reaction popup option
    const likeOption = screen.getByTestId('comment-reaction-btn-root-1-like')
    fireEvent.click(likeOption)

    await waitFor(() => {
      expect(postsApi.setCommentReaction).toHaveBeenCalledWith('root-1', 'like')
    })
  })

  it('allows collapsing an auto-expanded reply thread in controlled mode without state oscillation', async () => {
    let currentExpanded = new Set(['root-1'])
    const handleToggle = vi.fn((id: string) => {
      currentExpanded = new Set(currentExpanded)
      if (currentExpanded.has(id)) {
        currentExpanded.delete(id)
      } else {
        currentExpanded.add(id)
      }
    })

    const { rerender } = render(
      <MemoryRouter>
        <PostCommentsSection
          postId="post-1"
          comments={sampleComments}
          expandedThreadIds={currentExpanded}
          onToggleExpandThread={handleToggle}
        />
      </MemoryRouter>
    )

    // Initially expanded
    expect(screen.getByText('Minh Hoàng')).toBeInTheDocument()
    const toggleBtn = screen.getByTestId('toggle-replies-root-1')
    expect(toggleBtn).toHaveTextContent(/Thu gọn câu trả lời/i)

    // User clicks collapse
    fireEvent.click(toggleBtn)
    expect(handleToggle).toHaveBeenCalledWith('root-1')

    // Parent re-renders with updated expandedThreadIds
    rerender(
      <MemoryRouter>
        <PostCommentsSection
          postId="post-1"
          comments={sampleComments}
          expandedThreadIds={currentExpanded}
          onToggleExpandThread={handleToggle}
        />
      </MemoryRouter>
    )

    // Now it MUST be collapsed, NOT oscillating back to true
    expect(screen.queryByText('Minh Hoàng')).not.toBeInTheDocument()
    expect(screen.getByTestId('toggle-replies-root-1')).toHaveTextContent(/Xem 1 câu trả lời/i)
  })

  it('notifies onCommentsChange when reacting to a comment so parent state remains in sync', async () => {
    const onCommentsChange = vi.fn()
    vi.mocked(postsApi.setCommentReaction).mockResolvedValue({
      totalCount: 3,
      counts: { like: 1, love: 2, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'love',
    })

    render(
      <MemoryRouter>
        <PostCommentsSection
          postId="post-1"
          comments={sampleComments}
          onCommentsChange={onCommentsChange}
        />
      </MemoryRouter>
    )

    const reactBtn = screen.getByTestId('comment-reaction-trigger-root-1')
    fireEvent.click(reactBtn)

    const loveOption = screen.getByTestId('comment-reaction-btn-root-1-love')
    fireEvent.click(loveOption)

    await waitFor(() => {
      expect(postsApi.setCommentReaction).toHaveBeenCalledWith('root-1', 'love')
      expect(onCommentsChange).toHaveBeenCalled()
      // Check that onCommentsChange received updated reactions
      const latestCall = onCommentsChange.mock.calls[onCommentsChange.mock.calls.length - 1]
      const updatedComments: PostCommentThread[] = latestCall[0]
      const target = updatedComments.find((c) => c.id === 'root-1')
      expect(target?.reactions.viewerReaction).toBe('love')
      expect(target?.reactions.totalCount).toBe(3)
    })
  })

  it('redirects unauthenticated user to /login?redirect=... on attempting to comment or react (Req 4.8)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      user: null,
      accessToken: null,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <PostCommentsSection
          postId="post-1"
          comments={sampleComments}
        />
      </MemoryRouter>
    )

    const input = screen.getByPlaceholderText(/viết bình luận của bạn/i)
    fireEvent.change(input, { target: { value: 'Bình luận thử' } })

    const submitBtn = screen.getByTestId('submit-root-comment')
    fireEvent.click(submitBtn)

    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/login?redirect='))
  })
})
