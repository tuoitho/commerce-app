import { apiClient, apiClientWithMeta, type ApiResponseWithMeta } from './client'

export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry'

export interface ReactionCounts {
  like: number
  love: number
  haha: number
  wow: number
  sad: number
  angry: number
}

export interface ReactionSummary {
  totalCount: number
  counts: ReactionCounts
  viewerReaction: ReactionType | null
}

export interface PostMediaAttachment {
  id: string
  fileUrl: string
  fileType: 'image' | 'video'
  fileName: string
  fileSize: number
  mimeType: string
  position: number
}

export interface ReferredProductCard {
  id: string
  name: string
  brand: string
  price: string
  currency: string
  imageUrl: string
  inStock: boolean
  active: boolean
}

export interface PostItem {
  id: string
  authorId: string
  authorName: string
  authorRole: 'admin' | 'customer'
  content: string
  media: PostMediaAttachment[]
  referredProducts: ReferredProductCard[]
  reactions: ReactionSummary
  commentCount: number
  createdAt: string
  updatedAt: string
}

export interface PostComment {
  id: string
  postId: string
  authorId: string
  authorName: string
  authorRole: 'admin' | 'customer'
  parentId: string | null
  replyToUserId: string | null
  replyToUserName: string | null
  content: string
  reactions: ReactionSummary
  createdAt: string
  updatedAt: string
}

export interface PostCommentThread extends PostComment {
  replies: PostComment[]
}

export interface PostDetail extends PostItem {
  comments: PostCommentThread[]
}

export type NotificationCategory = 'post' | string

export type PostNotificationType =
  | 'post_reaction'
  | 'post_comment'
  | 'comment_reaction'
  | 'comment_reply'

export interface NotificationActorSummary {
  id: string
  name: string
  role: 'admin' | 'customer'
}

export interface NotificationItem {
  id: string
  recipientId: string
  actorId: string | null
  actorName: string | null
  actorRole: 'admin' | 'customer' | null
  groupKey?: string
  actorCount?: number
  category: NotificationCategory
  notificationType: PostNotificationType | string
  postId: string | null
  commentId: string | null
  reactionType: ReactionType | null
  excerpt: string
  metadata: {
    recentActors?: NotificationActorSummary[]
    [key: string]: unknown
  }
  isRead: boolean
  createdAt: string
  updatedAt?: string
}

export type PostNotification = NotificationItem

export interface ListPostsParams {
  page?: number
  limit?: number
}

export interface CreatePostPayload {
  content: string
  mediaIds?: string[] | null
  referredProductIds?: string[] | null
}

export interface UpdatePostPayload {
  content?: string
  mediaIds?: string[] | null
  referredProductIds?: string[] | null
}

export interface CreatePostCommentPayload {
  content: string
  parentCommentId?: string | null
}

export interface DeleteCommentResult {
  deletedCommentId: string
  commentCount: number
}

export interface ListNotificationsParams {
  limit?: number
  offset?: number
}

export interface NotificationListResult {
  items: NotificationItem[]
  unreadCount: number
}

export interface MarkNotificationReadResult {
  id: string
  isRead: boolean
  unreadCount: number
}

export interface MarkAllNotificationsReadResult {
  unreadCount: number
}

export const postsApi = {
  async createAdminPost(payload: CreatePostPayload): Promise<PostDetail> {
    return apiClient<PostDetail>('/admin/posts', {
      method: 'POST',
      body: payload,
    })
  },

  async updateAdminPost(id: string, payload: UpdatePostPayload): Promise<PostDetail> {
    return apiClient<PostDetail>(`/admin/posts/${id}`, {
      method: 'PUT',
      body: payload,
    })
  },

  async deleteAdminPost(id: string): Promise<{ id: string }> {
    return apiClient<{ id: string }>(`/admin/posts/${id}`, {
      method: 'DELETE',
    })
  },

  async uploadPostMedia(file: File): Promise<PostMediaAttachment> {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient<PostMediaAttachment>('/admin/posts/media', {
      method: 'POST',
      body: formData,
    })
  },

  async listPosts(params: ListPostsParams = {}): Promise<ApiResponseWithMeta<PostItem[]>> {
    const searchParams = new URLSearchParams()
    if (params.page !== undefined) searchParams.set('page', String(params.page))
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
    const query = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return apiClientWithMeta<PostItem[]>(`/posts${query}`)
  },

  async getPostById(id: string): Promise<PostDetail> {
    return apiClient<PostDetail>(`/posts/${id}`)
  },

  async setPostReaction(id: string, reaction: ReactionType | null): Promise<ReactionSummary> {
    return apiClient<ReactionSummary>(`/posts/${id}/reactions`, {
      method: 'PUT',
      body: { reaction },
    })
  },

  async createComment(id: string, payload: CreatePostCommentPayload): Promise<PostComment> {
    return apiClient<PostComment>(`/posts/${id}/comments`, {
      method: 'POST',
      body: payload,
    })
  },

  async deleteComment(postId: string, commentId: string): Promise<DeleteCommentResult> {
    return apiClient<DeleteCommentResult>(`/posts/${postId}/comments/${commentId}`, {
      method: 'DELETE',
    })
  },

  async setCommentReaction(commentId: string, reaction: ReactionType | null): Promise<ReactionSummary> {
    return apiClient<ReactionSummary>(`/post-comments/${commentId}/reactions`, {
      method: 'PUT',
      body: { reaction },
    })
  },

  async listNotifications(params: ListNotificationsParams = {}): Promise<NotificationListResult> {
    const searchParams = new URLSearchParams()
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset))
    const query = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return apiClient<NotificationListResult>(`/notifications${query}`)
  },

  async markNotificationRead(id: string): Promise<MarkNotificationReadResult> {
    return apiClient<MarkNotificationReadResult>(`/notifications/${id}/read`, {
      method: 'POST',
    })
  },

  async markAllNotificationsRead(): Promise<MarkAllNotificationsReadResult> {
    return apiClient<MarkAllNotificationsReadResult>('/notifications/read-all', {
      method: 'POST',
    })
  },
}
