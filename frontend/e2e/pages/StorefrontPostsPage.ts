import { type Page, type Locator, expect } from '@playwright/test'

export class StorefrontPostsPage {
  readonly page: Page
  readonly feedHeading: Locator
  readonly feedLoading: Locator
  readonly postCards: Locator
  readonly notificationBellBtn: Locator
  readonly notificationUnreadBadge: Locator
  readonly notificationDropdown: Locator
  readonly markAllReadBtn: Locator
  readonly rootCommentTextarea: Locator
  readonly submitRootCommentBtn: Locator

  constructor(page: Page) {
    this.page = page
    this.feedHeading = page.locator('h1', { hasText: 'Bảng tin & Đánh giá Flagship' })
    this.feedLoading = page.locator('[data-testid="posts-feed-loading"]')
    this.postCards = page.locator('article[id^="post-article-"]')
    this.notificationBellBtn = page.locator('[data-testid="notification-bell-button"]')
    this.notificationUnreadBadge = page.locator('[data-testid="notification-unread-badge"]')
    this.notificationDropdown = page.locator('[data-testid="notifications-dropdown-panel"]')
    this.markAllReadBtn = page.locator('[data-testid="mark-all-read-button"]')
    this.rootCommentTextarea = page.locator('textarea[placeholder="Viết bình luận của bạn..."]')
    this.submitRootCommentBtn = page.locator('[data-testid="submit-root-comment"]')
  }

  async gotoFeed(): Promise<void> {
    await this.page.goto('/posts')
  }

  async expectFeedLoaded(): Promise<void> {
    await expect(this.feedHeading).toBeVisible()
    await expect(this.feedLoading).not.toBeVisible()
  }

  async getPostCard(postId: string): Promise<Locator> {
    return this.page.locator(`#post-article-${postId}`)
  }

  async hoverReactionButton(postId: string): Promise<void> {
    const card = await this.getPostCard(postId)
    const trigger = card.locator('[data-testid="reaction-trigger-button"]')
    await trigger.hover()
    await expect(card.locator('[data-testid="emotion-picker"]')).toBeVisible()
  }

  async selectPostReaction(postId: string, reactionType: string): Promise<void> {
    await this.hoverReactionButton(postId)
    const card = await this.getPostCard(postId)
    const opt = card.locator(`[data-testid="reaction-option-${reactionType}"]`)
    await opt.click()
  }

  async clickPostReactionTrigger(postId: string): Promise<void> {
    const card = await this.getPostCard(postId)
    await card.locator('[data-testid="reaction-trigger-button"]').click()
  }

  async clickShare(postId: string): Promise<void> {
    const card = await this.getPostCard(postId)
    await card.locator('[data-testid="share-action-button"]').click()
  }

  async gotoPostDetail(postId: string, queryParams = ''): Promise<void> {
    const url = `/posts/${postId}${queryParams ? `?${queryParams}` : ''}`
    await this.page.goto(url)
  }

  async expectPostDetailLoaded(postId: string): Promise<void> {
    const article = this.page.locator(`#post-article-${postId}`)
    await expect(article).toBeVisible()
  }

  async expectPostHighlighted(postId: string): Promise<void> {
    const article = this.page.locator(`#post-article-${postId}`)
    await expect(article).toHaveClass(/ring-2 ring-emerald-500/)
  }

  async createRootComment(content: string): Promise<void> {
    await this.rootCommentTextarea.fill(content)
    await this.submitRootCommentBtn.click()
  }

  async replyToComment(targetCommentId: string, rootThreadId: string, content: string): Promise<void> {
    const replyBtn = this.page.locator(`[data-testid="reply-btn-${targetCommentId}"]`)
    await replyBtn.click()
    const replyTextarea = this.page.locator('textarea[placeholder*="Viết câu trả lời"]')
    await expect(replyTextarea).toBeVisible()
    await replyTextarea.fill(content)
    await this.page.locator(`[data-testid="submit-reply-${rootThreadId}"]`).click()
  }

  async toggleReplies(threadId: string): Promise<void> {
    const btn = this.page.locator(`[data-testid="toggle-replies-${threadId}"]`)
    await btn.click()
  }

  async selectCommentReaction(commentId: string, reactionType: string): Promise<void> {
    const trigger = this.page.locator(`[data-testid="comment-reaction-trigger-${commentId}"]`)
    await trigger.click()
    const opt = this.page.locator(`[data-testid="comment-reaction-btn-${commentId}-${reactionType}"]`)
    await expect(opt).toBeVisible()
    await opt.click()
  }

  async deleteComment(commentId: string): Promise<void> {
    const btn = this.page.locator(`[data-testid="delete-comment-${commentId}"]`)
    await btn.click()
  }

  async expectCommentHighlighted(commentId: string): Promise<void> {
    const el = this.page.locator(`#comment-${commentId}`)
    await expect(el).toHaveClass(/ring-2 ring-emerald-500/)
  }

  async expectCommentNotFoundAlert(): Promise<void> {
    const alert = this.page.getByText('Bình luận mục tiêu không còn tồn tại hoặc đã bị xóa.')
    await expect(alert).toBeVisible()
  }

  async clickNotificationBell(): Promise<void> {
    await this.notificationBellBtn.click()
  }

  async expectUnreadNotificationCount(count: number): Promise<void> {
    if (count > 0) {
      await expect(this.notificationUnreadBadge).toBeVisible()
      await expect(this.notificationUnreadBadge).toHaveText(String(count))
    } else {
      await expect(this.notificationUnreadBadge).not.toBeVisible()
    }
  }

  async clickNotificationItem(notificationId: string): Promise<void> {
    const item = this.page.locator(`[data-testid="notification-item-${notificationId}"]`)
    await item.click()
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.markAllReadBtn.click()
  }
}
