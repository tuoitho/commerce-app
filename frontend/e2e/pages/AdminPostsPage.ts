import { type Page, type Locator, expect } from '@playwright/test'

export class AdminPostsPage {
  readonly page: Page
  readonly heading: Locator
  readonly createPostBtn: Locator
  readonly postCards: Locator
  readonly modal: Locator
  readonly modalHeading: Locator
  readonly contentTextarea: Locator
  readonly productSearchInput: Locator
  readonly submitModalBtn: Locator
  readonly deleteDialog: Locator
  readonly confirmDeleteBtn: Locator
  readonly notificationBellBtn: Locator
  readonly notificationUnreadBadge: Locator
  readonly notificationDropdown: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.locator('h2', { hasText: 'Quản lý bài viết giới thiệu' })
    this.createPostBtn = page.getByRole('button', { name: 'Tạo bài viết', exact: true })
    this.postCards = page.locator('article')
    this.modal = page.locator('div[role="dialog"]')
    this.modalHeading = this.modal.locator('h3')
    this.contentTextarea = page.locator('#post-content')
    this.productSearchInput = page.locator('input[placeholder*="Tìm kiếm sản phẩm"]')
    this.submitModalBtn = this.modal.locator('button[type="submit"]')
    this.deleteDialog = page.locator('[role="alertdialog"]')
    this.confirmDeleteBtn = page.getByRole('button', { name: 'Xác nhận xóa' })
    this.notificationBellBtn = page.locator('[data-testid="notification-bell-button"]')
    this.notificationUnreadBadge = page.locator('[data-testid="notification-unread-badge"]')
    this.notificationDropdown = page.locator('[data-testid="notifications-dropdown-panel"]')
  }

  async gotoAdminPosts(adminBaseUrl: string): Promise<void> {
    await this.page.goto(`${adminBaseUrl}/posts`)
  }

  async expectPostsListLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible()
  }

  async openCreatePostModal(): Promise<void> {
    await this.createPostBtn.click()
    await expect(this.modal).toBeVisible()
    await expect(this.modalHeading).toHaveText('Tạo bài viết mới')
  }

  async fillPostContent(content: string): Promise<void> {
    await this.contentTextarea.fill(content)
  }

  async uploadMediaAttachment(filePath: string): Promise<void> {
    const fileChooserPromise = this.page.waitForEvent('filechooser')
    await this.modal.locator('label', { hasText: 'Tải lên ảnh hoặc video' }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(filePath)
  }

  async searchAndSelectProduct(query: string, productName: string): Promise<void> {
    await this.productSearchInput.fill(query)
    const productRow = this.modal.locator('div', { hasText: productName }).first()
    await expect(productRow).toBeVisible()
    const selectBtn = productRow.locator('button', { hasText: 'Chọn sản phẩm' })
    await selectBtn.click()
  }

  async submitPostForm(): Promise<void> {
    await this.submitModalBtn.click()
    await expect(this.modal).not.toBeVisible()
  }

  async openEditPostModal(postContentSnippet: string): Promise<void> {
    const article = this.postCards.filter({ hasText: postContentSnippet }).first()
    await expect(article).toBeVisible()
    const editBtn = article.locator('button', { hasText: 'Chỉnh sửa' })
    await editBtn.click()
    await expect(this.modal).toBeVisible()
    await expect(this.modalHeading).toHaveText('Chỉnh sửa bài viết')
  }

  async confirmDeletePost(postContentSnippet: string): Promise<void> {
    const article = this.postCards.filter({ hasText: postContentSnippet }).first()
    await expect(article).toBeVisible()
    const delBtn = article.locator('button', { hasText: 'Xóa' })
    await delBtn.click()
    await expect(this.deleteDialog).toBeVisible()
    await this.confirmDeleteBtn.click()
    await expect(this.deleteDialog).not.toBeVisible()
  }

  async gotoAdminPostDetail(adminBaseUrl: string, postId: string, queryParams = ''): Promise<void> {
    const url = `${adminBaseUrl}/posts/${postId}${queryParams ? `?${queryParams}` : ''}`
    await this.page.goto(url)
  }

  async expectAdminPostDetailLoaded(postId: string): Promise<void> {
    const article = this.page.locator(`#post-article-${postId}`)
    await expect(article).toBeVisible()
  }

  async expectAdminPostHighlighted(postId: string): Promise<void> {
    const article = this.page.locator(`#post-article-${postId}`)
    await expect(article).toHaveClass(/ring-2 ring-emerald-500/)
  }

  async expectAdminCommentHighlighted(commentId: string): Promise<void> {
    const commentEl = this.page.locator(`#comment-${commentId}`)
    await expect(commentEl).toHaveClass(/ring-2 ring-emerald-500/)
  }

  async clickAdminNotificationBell(): Promise<void> {
    await this.notificationBellBtn.click()
  }

  async expectAdminUnreadNotificationCount(count: number): Promise<void> {
    if (count > 0) {
      await expect(this.notificationUnreadBadge).toBeVisible()
      await expect(this.notificationUnreadBadge).toHaveText(String(count))
    } else {
      await expect(this.notificationUnreadBadge).not.toBeVisible()
    }
  }

  async clickAdminNotificationItem(notificationId: string): Promise<void> {
    const item = this.page.locator(`[data-testid="notification-item-${notificationId}"]`)
    await item.click()
  }
}
