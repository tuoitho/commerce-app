import { describe, it, expect, vi, beforeEach } from 'vitest'
import { postsApi } from './posts'
import { apiClient, apiClientWithMeta } from './client'

vi.mock('./client', () => ({
  apiClient: vi.fn(),
  apiClientWithMeta: vi.fn(),
}))

describe('postsApi client module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listPosts calls apiClientWithMeta with pagination and retryWithoutAuthOnRefreshFailure', async () => {
    const mockEnvelope = {
      data: [{ id: 'post-1', content: 'Test post' }],
      meta: {
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        timestamp: '2026-10-21T00:00:00Z',
      },
      message: 'OK',
    }
    vi.mocked(apiClientWithMeta).mockResolvedValue(mockEnvelope as any)

    const res = await postsApi.listPosts({ page: 1, limit: 10 })

    expect(apiClientWithMeta).toHaveBeenCalledWith('/posts?page=1&limit=10', {
      retryWithoutAuthOnRefreshFailure: true,
    })
    expect(res).toEqual(mockEnvelope)
  })

  it('getPostById calls apiClient with retryWithoutAuthOnRefreshFailure', async () => {
    const mockDetail = { id: 'post-1', content: 'Post detail', comments: [] }
    vi.mocked(apiClient).mockResolvedValue(mockDetail)

    const res = await postsApi.getPostById('post-1')

    expect(apiClient).toHaveBeenCalledWith('/posts/post-1', {
      retryWithoutAuthOnRefreshFailure: true,
    })
    expect(res).toEqual(mockDetail)
  })

  it('setPostReaction calls PUT /posts/:id/reactions with reaction payload', async () => {
    const mockSummary = {
      totalCount: 1,
      counts: { like: 0, love: 1, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'love',
    }
    vi.mocked(apiClient).mockResolvedValue(mockSummary)

    const res = await postsApi.setPostReaction('post-1', 'love')

    expect(apiClient).toHaveBeenCalledWith('/posts/post-1/reactions', {
      method: 'PUT',
      body: { reaction: 'love' },
    })
    expect(res).toEqual(mockSummary)
  })

  it('setPostReaction with null unsets user reaction', async () => {
    const mockSummary = {
      totalCount: 0,
      counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: null,
    }
    vi.mocked(apiClient).mockResolvedValue(mockSummary)

    const res = await postsApi.setPostReaction('post-1', null)

    expect(apiClient).toHaveBeenCalledWith('/posts/post-1/reactions', {
      method: 'PUT',
      body: { reaction: null },
    })
    expect(res).toEqual(mockSummary)
  })

  it('createComment calls POST /posts/:id/comments', async () => {
    const mockComment = { id: 'comment-1', content: 'Great review' }
    vi.mocked(apiClient).mockResolvedValue(mockComment)

    const res = await postsApi.createComment('post-1', {
      content: 'Great review',
      parentCommentId: 'parent-1',
    })

    expect(apiClient).toHaveBeenCalledWith('/posts/post-1/comments', {
      method: 'POST',
      body: { content: 'Great review', parentCommentId: 'parent-1' },
    })
    expect(res).toEqual(mockComment)
  })

  it('deleteComment calls DELETE /posts/:id/comments/:commentId', async () => {
    const mockResult = { deletedCommentId: 'comment-1', commentCount: 0 }
    vi.mocked(apiClient).mockResolvedValue(mockResult)

    const res = await postsApi.deleteComment('post-1', 'comment-1')

    expect(apiClient).toHaveBeenCalledWith('/posts/post-1/comments/comment-1', {
      method: 'DELETE',
    })
    expect(res).toEqual(mockResult)
  })

  it('setCommentReaction calls PUT /post-comments/:commentId/reactions', async () => {
    const mockSummary = {
      totalCount: 1,
      counts: { like: 1, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'like',
    }
    vi.mocked(apiClient).mockResolvedValue(mockSummary)

    const res = await postsApi.setCommentReaction('comment-1', 'like')

    expect(apiClient).toHaveBeenCalledWith('/post-comments/comment-1/reactions', {
      method: 'PUT',
      body: { reaction: 'like' },
    })
    expect(res).toEqual(mockSummary)
  })

  it('notification client endpoints call appropriate routes', async () => {
    vi.mocked(apiClient).mockResolvedValue({ items: [], unreadCount: 0 })
    await postsApi.listNotifications({ limit: 20, offset: 0 })
    expect(apiClient).toHaveBeenCalledWith('/notifications?limit=20&offset=0')

    vi.mocked(apiClient).mockResolvedValue({ id: 'notif-1', isRead: true, unreadCount: 0 })
    await postsApi.markNotificationRead('notif-1')
    expect(apiClient).toHaveBeenCalledWith('/notifications/notif-1/read', { method: 'POST' })

    vi.mocked(apiClient).mockResolvedValue({ unreadCount: 0 })
    await postsApi.markAllNotificationsRead()
    expect(apiClient).toHaveBeenCalledWith('/notifications/read-all', { method: 'POST' })
  })
})
