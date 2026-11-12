import { describe, it, expect, vi, beforeEach } from 'vitest'
import { postsApi } from './posts'
import * as clientModule from './client'

describe('postsApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('createAdminPost calls POST /admin/posts with body', async () => {
    const mockPost = { id: 'p1', content: 'Test post' }
    const apiClientSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockPost)

    const payload = {
      content: 'Test post',
      mediaIds: ['m1'],
      referredProductIds: ['prod-1'],
    }
    const result = await postsApi.createAdminPost(payload)

    expect(apiClientSpy).toHaveBeenCalledWith('/admin/posts', {
      method: 'POST',
      body: payload,
    })
    expect(result).toEqual(mockPost)
  })

  it('updateAdminPost calls PUT /admin/posts/:id with body', async () => {
    const mockPost = { id: 'p1', content: 'Updated' }
    const apiClientSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockPost)

    const payload = { content: 'Updated' }
    const result = await postsApi.updateAdminPost('p1', payload)

    expect(apiClientSpy).toHaveBeenCalledWith('/admin/posts/p1', {
      method: 'PUT',
      body: payload,
    })
    expect(result).toEqual(mockPost)
  })

  it('deleteAdminPost calls DELETE /admin/posts/:id', async () => {
    const mockRes = { id: 'p1' }
    const apiClientSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockRes)

    const result = await postsApi.deleteAdminPost('p1')

    expect(apiClientSpy).toHaveBeenCalledWith('/admin/posts/p1', {
      method: 'DELETE',
    })
    expect(result).toEqual(mockRes)
  })

  it('uploadPostMedia calls POST /admin/posts/media with FormData', async () => {
    const mockMedia = {
      id: 'm1',
      fileUrl: '/api/v1/posts/media/m1',
      fileType: 'image' as const,
      fileName: 'banner.png',
      fileSize: 1024,
      mimeType: 'image/png',
      position: 0,
    }
    const apiClientSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockMedia)

    const file = new File(['binary content'], 'banner.png', { type: 'image/png' })
    const result = await postsApi.uploadPostMedia(file)

    expect(apiClientSpy).toHaveBeenCalledTimes(1)
    const [path, options] = apiClientSpy.mock.calls[0]
    expect(path).toBe('/admin/posts/media')
    expect(options?.method).toBe('POST')
    const body = options?.body as FormData
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('file')).toEqual(file)
    expect(result).toEqual(mockMedia)
  })

  it('listPosts calls GET /posts with search parameters', async () => {
    const mockWithMeta = {
      data: [{ id: 'p1', content: 'hello' }],
      meta: {
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        timestamp: '2026-10-21T00:00:00Z',
      },
      message: 'OK',
    }
    const spy = vi.spyOn(clientModule, 'apiClientWithMeta').mockResolvedValue(mockWithMeta as any)

    const result = await postsApi.listPosts({ page: 2, limit: 20 })

    expect(spy).toHaveBeenCalledWith('/posts?page=2&limit=20')
    expect(result).toEqual(mockWithMeta)
  })

  it('getPostById calls GET /posts/:id', async () => {
    const mockPostDetail = { id: 'p1', content: 'Detail', comments: [] }
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockPostDetail)

    const result = await postsApi.getPostById('p1')

    expect(spy).toHaveBeenCalledWith('/posts/p1')
    expect(result).toEqual(mockPostDetail)
  })

  it('setPostReaction calls PUT /posts/:id/reactions', async () => {
    const mockSummary = {
      totalCount: 1,
      counts: { like: 1, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'like' as const,
    }
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockSummary)

    const result = await postsApi.setPostReaction('p1', 'like')

    expect(spy).toHaveBeenCalledWith('/posts/p1/reactions', {
      method: 'PUT',
      body: { reaction: 'like' },
    })
    expect(result).toEqual(mockSummary)
  })

  it('createComment calls POST /posts/:id/comments', async () => {
    const mockComment = { id: 'c1', postId: 'p1', content: 'Hello' }
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockComment)

    const payload = { content: 'Hello', parentCommentId: null }
    const result = await postsApi.createComment('p1', payload)

    expect(spy).toHaveBeenCalledWith('/posts/p1/comments', {
      method: 'POST',
      body: payload,
    })
    expect(result).toEqual(mockComment)
  })

  it('deleteComment calls DELETE /posts/:id/comments/:commentId', async () => {
    const mockRes = { deletedCommentId: 'c1', commentCount: 0 }
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockRes)

    const result = await postsApi.deleteComment('p1', 'c1')

    expect(spy).toHaveBeenCalledWith('/posts/p1/comments/c1', {
      method: 'DELETE',
    })
    expect(result).toEqual(mockRes)
  })

  it('setCommentReaction calls PUT /post-comments/:commentId/reactions', async () => {
    const mockSummary = {
      totalCount: 1,
      counts: { like: 0, love: 1, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'love' as const,
    }
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockSummary)

    const result = await postsApi.setCommentReaction('c1', 'love')

    expect(spy).toHaveBeenCalledWith('/post-comments/c1/reactions', {
      method: 'PUT',
      body: { reaction: 'love' },
    })
    expect(result).toEqual(mockSummary)
  })

  it('listNotifications calls GET /notifications with query params', async () => {
    const mockNotifs = { items: [], unreadCount: 0 }
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockNotifs)

    const result = await postsApi.listNotifications({ limit: 30, offset: 10 })

    expect(spy).toHaveBeenCalledWith('/notifications?limit=30&offset=10')
    expect(result).toEqual(mockNotifs)
  })

  it('markNotificationRead calls POST /notifications/:id/read', async () => {
    const mockRes = { id: 'n1', isRead: true, unreadCount: 0 }
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockRes)

    const result = await postsApi.markNotificationRead('n1')

    expect(spy).toHaveBeenCalledWith('/notifications/n1/read', {
      method: 'POST',
    })
    expect(result).toEqual(mockRes)
  })

  it('markAllNotificationsRead calls POST /notifications/read-all', async () => {
    const mockRes = { unreadCount: 0 }
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockRes)

    const result = await postsApi.markAllNotificationsRead()

    expect(spy).toHaveBeenCalledWith('/notifications/read-all', {
      method: 'POST',
    })
    expect(result).toEqual(mockRes)
  })
})
