// Contracts: API-ADMIN-REVIEWS@1 (verifier); API-PUBLIC-REVIEWS@1 (verifier); DB-REVIEW-REPLIES@1 (verifier)
// _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5_
import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import {
  ADMIN_BASE_URL,
  API_BASE_URL,
  ADMIN_EMAIL,
  CUSTOMER_EMAIL,
  CUSTOMER_PASSWORD,
  ensureReviewFixtures,
  loginAdminViaUi,
} from './fixtures/auth'
import { AdminReviewsPage } from './pages/AdminReviewsPage'
import { ProductDetailReviewsPage } from './pages/ProductDetailReviewsPage'

const FEATURE_SPEC_DIR = path.resolve(process.cwd(), '../.dream/specs/admin-review-reply')
const IMGS_DIR = path.join(FEATURE_SPEC_DIR, 'imgs')

test.describe('Admin Review Reply E2E Verification [Req 1.1–1.5, 2.1–2.7, 3.1–3.5]', () => {
  test.beforeAll(() => {
    fs.mkdirSync(IMGS_DIR, { recursive: true })
  })

  test('1.5 & 2.7: rejects unauthenticated and non-admin access to /reviews UI and /api/v1/admin/reviews* endpoints', async ({
    page,
    request,
  }) => {
    const fixtures = await ensureReviewFixtures(request)
    const reviewId = fixtures.targetReview.id
    const customerToken = fixtures.customerSession.accessToken

    // 1. Unauthenticated API calls -> 401 Unauthorized
    const unauthGet = await request.get(`${API_BASE_URL}/admin/reviews`)
    expect(unauthGet.status()).toBe(401)
    const unauthGetBody = await unauthGet.json()
    expect(unauthGetBody.success).toBe(false)

    const unauthPut = await request.put(`${API_BASE_URL}/admin/reviews/${reviewId}/reply`, {
      data: { reply: 'Unauthorized attempt' },
    })
    expect(unauthPut.status()).toBe(401)

    const unauthDel = await request.delete(`${API_BASE_URL}/admin/reviews/${reviewId}/reply`)
    expect(unauthDel.status()).toBe(401)

    // 2. Customer role API calls -> 403 Forbidden
    const custGet = await request.get(`${API_BASE_URL}/admin/reviews`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    })
    expect(custGet.status()).toBe(403)
    const custGetBody = await custGet.json()
    expect(custGetBody.success).toBe(false)
    expect(custGetBody.error.code).toBe('forbidden')

    const custPut = await request.put(`${API_BASE_URL}/admin/reviews/${reviewId}/reply`, {
      headers: { Authorization: `Bearer ${customerToken}` },
      data: { reply: 'Customer attempt' },
    })
    expect(custPut.status()).toBe(403)

    const custDel = await request.delete(`${API_BASE_URL}/admin/reviews/${reviewId}/reply`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    })
    expect(custDel.status()).toBe(403)

    // 3. Unauthenticated UI navigation to /reviews redirects to /login
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${ADMIN_BASE_URL}/reviews`)
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Đăng nhập quản trị viên' })).toBeVisible()

    // 4. Customer attempting to log into Admin Portal is rejected with Vietnamese error alert
    await page.locator('#email').fill(CUSTOMER_EMAIL)
    await page.locator('#password').fill(CUSTOMER_PASSWORD)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(page.getByRole('alert')).toContainText(
      'Tài khoản không có quyền truy cập trang quản trị'
    )
    await expect(page).toHaveURL(/\/login$/)

    await page.screenshot({
      path: path.join(IMGS_DIR, '01-unauthenticated-redirect-login.png'),
      fullPage: true,
    })
  })

  test('1.1–1.4, 2.1–2.6, 3.1–3.5: full Admin Review Reply lifecycle across Admin Portal (:15174) and Storefront (:15173)', async ({
    browser,
    request,
  }) => {
    const fixtures = await ensureReviewFixtures(request)
    const { adminSession, targetReview } = fixtures
    const productId = targetReview.product.id

    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const storefrontContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })

    const adminPage = await adminContext.newPage()
    const storefrontPage = await storefrontContext.newPage()

    const alertMessages: string[] = []
    adminPage.on('dialog', async (dialog) => {
      alertMessages.push(dialog.message())
      await dialog.accept()
    })

    const adminReviewsPage = new AdminReviewsPage(adminPage)
    const storefrontReviewsPage = new ProductDetailReviewsPage(storefrontPage)

    try {
      // =========================================================================
      // STEP 1: Admin real login & view review list with newest-first ordering
      // & pagination (Req 1.1, 1.2, 1.3)
      // =========================================================================
      await loginAdminViaUi(adminPage)

      const initialListRespPromise = adminPage.waitForResponse(
        (resp) =>
          resp.url().includes('/api/v1/admin/reviews') && resp.request().method() === 'GET'
      )
      await adminPage.goto(`${ADMIN_BASE_URL}/reviews`)
      const initialListResp = await initialListRespPromise
      expect(initialListResp.status()).toBe(200)
      const initialListBody = await initialListResp.json()

      // Verify Full Status Envelope & newest-first ordering (Req 1.1)
      expect(initialListBody.success).toBe(true)
      expect(initialListBody.meta.pagination).toBeDefined()
      expect(initialListBody.meta.pagination.total).toBeGreaterThanOrEqual(11)
      expect(initialListBody.meta.pagination.totalPages).toBeGreaterThanOrEqual(2)

      const listData: Array<{ id: string; createdAt: string }> = initialListBody.data
      expect(listData.length).toBe(10)
      for (let i = 1; i < listData.length; i++) {
        const prevTime = new Date(listData[i - 1].createdAt).getTime()
        const currTime = new Date(listData[i].createdAt).getTime()
        expect(prevTime).toBeGreaterThanOrEqual(currTime)
      }

      // Verify required columns in table (Req 1.2): reviewer email, rating, comment, timestamp, reply status
      await expect(adminReviewsPage.heading).toBeVisible()
      const targetRow = adminReviewsPage.rowByComment(targetReview.comment)
      await expect(targetRow).toBeVisible()
      await expect(targetRow).toContainText(targetReview.reviewerEmail || CUSTOMER_EMAIL)
      await expect(targetRow).toContainText(String(targetReview.rating))
      await expect(targetRow).toContainText(targetReview.comment)
      await expect(targetRow).toContainText('Chưa phản hồi')

      // Verify pagination controls (Req 1.3)
      await expect(adminReviewsPage.prevPageButton).toBeDisabled()
      await expect(adminReviewsPage.nextPageButton).toBeEnabled()

      await adminPage.screenshot({
        path: path.join(IMGS_DIR, '02-admin-reviews-list-desktop.png'),
        fullPage: true,
      })

      // Test navigating to page 2 and back to page 1 (Req 1.3)
      const page2RespPromise = adminPage.waitForResponse(
        (resp) =>
          resp.url().includes('/api/v1/admin/reviews') &&
          resp.url().includes('page=2') &&
          resp.request().method() === 'GET'
      )
      await adminReviewsPage.nextPageButton.click()
      const page2Resp = await page2RespPromise
      expect(page2Resp.status()).toBe(200)
      await expect(adminReviewsPage.prevPageButton).toBeEnabled()

      const page1RespPromise = adminPage.waitForResponse(
        (resp) =>
          resp.url().includes('/api/v1/admin/reviews') &&
          resp.url().includes('page=1') &&
          resp.request().method() === 'GET'
      )
      await adminReviewsPage.prevPageButton.click()
      await page1RespPromise

      // =========================================================================
      // STEP 2: Filter reviews by star rating and reply status (Req 1.4)
      // =========================================================================
      await adminReviewsPage.filterByRating(5)
      await adminReviewsPage.filterByReplyStatus('no')

      await expect(adminReviewsPage.rowByComment(targetReview.comment)).toBeVisible()
      await adminPage.screenshot({
        path: path.join(IMGS_DIR, '03-admin-reviews-filtered.png'),
        fullPage: true,
      })

      // Reset filters back to all
      await adminReviewsPage.filterByRating(0)
      await adminReviewsPage.filterByReplyStatus('')

      // =========================================================================
      // STEP 3: Verify Storefront BEFORE admin reply has no reply block (Req 3.3)
      // =========================================================================
      const beforePublicBody = await storefrontReviewsPage.gotoProduct(productId)
      expect(beforePublicBody.success).toBe(true)
      const beforeTargetBlock = storefrontReviewsPage.reviewBlockByComment(targetReview.comment)
      await expect(beforeTargetBlock).toBeVisible()
      await expect(beforeTargetBlock.getByText('Phản hồi từ người bán')).toHaveCount(0)

      // =========================================================================
      // STEP 4: Open reply dialog, verify validation (Req 2.1, 2.3), and submit
      // a valid reply (Req 2.2)
      // =========================================================================
      const rowToReply = adminReviewsPage.rowByComment(targetReview.comment)
      await adminReviewsPage.openReplyDialogForRow(rowToReply)
      await expect(adminReviewsPage.dialog.getByText('Viết phản hồi')).toBeVisible()
      await expect(adminReviewsPage.dialog.getByText('0/1000')).toBeVisible()

      // Empty / whitespace-only submission in UI -> blocked with validation alert (Req 2.3)
      await adminReviewsPage.replyTextarea.fill('   ')
      await adminReviewsPage.saveReplyButton.click()
      await expect(adminReviewsPage.dialog.getByRole('alert')).toContainText(
        'Nội dung phản hồi không được để trống'
      )
      expect(alertMessages).toContain('Nội dung phản hồi không được để trống')

      await adminPage.screenshot({
        path: path.join(IMGS_DIR, '04-admin-reply-dialog-validation.png'),
      })

      // Also verify backend API validation for empty/whitespace and >1000 chars (Req 2.1, 2.3)
      const emptyApiResp = await request.put(
        `${API_BASE_URL}/admin/reviews/${targetReview.id}/reply`,
        {
          headers: { Authorization: `Bearer ${adminSession.accessToken}` },
          data: { reply: '    ' },
        }
      )
      expect(emptyApiResp.status()).toBe(400)
      const emptyApiBody = await emptyApiResp.json()
      expect(emptyApiBody.success).toBe(false)
      expect(emptyApiBody.error.code).toBe('validation_error')
      expect(emptyApiBody.error.fields.reply).toBe('Nội dung phản hồi không hợp lệ')

      const tooLongApiResp = await request.put(
        `${API_BASE_URL}/admin/reviews/${targetReview.id}/reply`,
        {
          headers: { Authorization: `Bearer ${adminSession.accessToken}` },
          data: { reply: 'A'.repeat(1001) },
        }
      )
      expect(tooLongApiResp.status()).toBe(400)
      const tooLongApiBody = await tooLongApiResp.json()
      expect(tooLongApiBody.error.code).toBe('validation_error')

      // Submit valid reply via UI (Req 2.2)
      const initialReplyText =
        'Cảm ơn quý khách đã tin tưởng lựa chọn AuraPhone! Cửa hàng rất vui vì quý khách hài lòng với chất lượng sản phẩm.'
      await adminReviewsPage.replyTextarea.fill(initialReplyText)

      const putReplyRespPromise = adminPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/v1/admin/reviews/${targetReview.id}/reply`) &&
          resp.request().method() === 'PUT'
      )
      const refreshListPromise = adminPage.waitForResponse(
        (resp) =>
          resp.url().includes('/api/v1/admin/reviews') && resp.request().method() === 'GET'
      )
      await adminReviewsPage.saveReplyButton.click()

      const putReplyResp = await putReplyRespPromise
      expect(putReplyResp.status()).toBe(200)
      const putReplyBody = await putReplyResp.json()
      expect(putReplyBody.success).toBe(true)
      expect(putReplyBody.message).toBe('Cập nhật phản hồi thành công')
      expect(putReplyBody.data.adminReply).toBe(initialReplyText)
      expect(putReplyBody.data.adminRepliedAt).toBeTruthy()
      await refreshListPromise

      // Table row badge updated to "Đã phản hồi" and button updated to "Sửa"
      const updatedRow = adminReviewsPage.rowByComment(targetReview.comment)
      await expect(updatedRow.getByText('Đã phản hồi')).toBeVisible()
      await expect(updatedRow.getByRole('button', { name: 'Sửa' })).toBeVisible()

      await adminPage.screenshot({
        path: path.join(IMGS_DIR, '05-admin-reply-created-table.png'),
        fullPage: true,
      })

      // Also verify filtering by "Đã phản hồi" (has_reply=yes) returns the replied review (Req 1.4)
      await adminReviewsPage.filterByReplyStatus('yes')
      await expect(adminReviewsPage.rowByComment(targetReview.comment)).toBeVisible()
      await adminReviewsPage.filterByReplyStatus('')

      // =========================================================================
      // STEP 5: Verify Storefront displays admin reply beneath customer review
      // at Desktop (1440x900) and Mobile (375x812) without admin PII (Req 3.1, 3.2, 3.3, 3.4)
      // =========================================================================
      await storefrontPage.setViewportSize({ width: 1440, height: 900 })
      const afterReplyPublicBody = (await storefrontReviewsPage.reloadAndWaitForReviews(
        productId
      )) as {
        data: {
          reviews: Array<Record<string, unknown>>
        }
      }

      const publicReviewJson = afterReplyPublicBody.data.reviews.find(
        (r) => r.id === targetReview.id
      )
      expect(publicReviewJson).toBeDefined()
      expect(publicReviewJson?.adminReply).toBe(initialReplyText)
      expect(publicReviewJson?.adminRepliedAt).toBeTruthy()
      // Req 3.4: Public API payload must never expose adminId or adminEmail
      expect(publicReviewJson?.adminId).toBeUndefined()
      expect(publicReviewJson?.adminEmail).toBeUndefined()
      expect(JSON.stringify(publicReviewJson)).not.toContain(ADMIN_EMAIL)
      expect(JSON.stringify(publicReviewJson)).not.toContain(adminSession.user.id)

      const repliedReviewBlock = storefrontReviewsPage.reviewBlockByComment(targetReview.comment)
      await expect(repliedReviewBlock).toBeVisible()
      await expect(repliedReviewBlock.getByText('Phản hồi từ người bán')).toBeVisible()
      await expect(repliedReviewBlock.getByText(initialReplyText)).toBeVisible()
      await expect(repliedReviewBlock).not.toContainText(ADMIN_EMAIL)

      // Req 3.3: Unreplied sibling review on the same product page must NOT show reply block
      const unrepliedSibling = afterReplyPublicBody.data.reviews.find(
        (r) => r.id !== targetReview.id && !r.adminReply
      )
      if (unrepliedSibling && typeof unrepliedSibling.comment === 'string') {
        const siblingBlock = storefrontReviewsPage.reviewBlockByComment(unrepliedSibling.comment)
        await expect(siblingBlock).toBeVisible()
        await expect(siblingBlock.getByText('Phản hồi từ người bán')).toHaveCount(0)
      }

      await storefrontReviewsPage.reviewsSection.scrollIntoViewIfNeeded()
      await storefrontPage.evaluate(() => window.scrollBy(0, 60))
      await storefrontPage.screenshot({
        path: path.join(IMGS_DIR, '06-storefront-reply-desktop.png'),
      })

      // Mobile viewport check (375x812)
      await storefrontPage.setViewportSize({ width: 375, height: 812 })
      await repliedReviewBlock.scrollIntoViewIfNeeded()
      await storefrontPage.evaluate(() => window.scrollBy(0, -80))
      await expect(repliedReviewBlock.getByText('Phản hồi từ người bán')).toBeVisible()
      await expect(repliedReviewBlock.getByText(initialReplyText)).toBeVisible()
      await storefrontPage.screenshot({
        path: path.join(IMGS_DIR, '07-storefront-reply-mobile.png'),
      })
      await storefrontPage.setViewportSize({ width: 1440, height: 900 })

      // =========================================================================
      // STEP 6: Admin edits the reply (Req 2.4, 2.6) and Storefront reflects the
      // updated reply on reload (Req 3.5)
      // =========================================================================
      const rowToEdit = adminReviewsPage.rowByComment(targetReview.comment)
      await adminReviewsPage.openReplyDialogForRow(rowToEdit)
      await expect(adminReviewsPage.dialog.getByText('Chỉnh sửa phản hồi')).toBeVisible()
      await expect(adminReviewsPage.replyTextarea).toHaveValue(initialReplyText)

      const editedReplyText =
        'Cập nhật từ AuraPhone: Sản phẩm của quý khách đã được kích hoạt gói bảo hành mở rộng 24 tháng. Xin chân thành cảm ơn!'
      await adminReviewsPage.replyTextarea.fill(editedReplyText)

      const editRespPromise = adminPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/v1/admin/reviews/${targetReview.id}/reply`) &&
          resp.request().method() === 'PUT'
      )
      const refreshAfterEditPromise = adminPage.waitForResponse(
        (resp) =>
          resp.url().includes('/api/v1/admin/reviews') && resp.request().method() === 'GET'
      )
      await adminReviewsPage.saveReplyButton.click()

      const editResp = await editRespPromise
      expect(editResp.status()).toBe(200)
      const editBody = await editResp.json()
      expect(editBody.data.adminReply).toBe(editedReplyText)
      await refreshAfterEditPromise

      // Reload Storefront and verify updated reply is displayed (Req 3.5)
      await storefrontReviewsPage.reloadAndWaitForReviews(productId)
      const editedBlock = storefrontReviewsPage.reviewBlockByComment(targetReview.comment)
      await expect(editedBlock.getByText('Phản hồi từ người bán')).toBeVisible()
      await expect(editedBlock.getByText(editedReplyText)).toBeVisible()
      await expect(editedBlock.getByText(initialReplyText)).toHaveCount(0)

      await storefrontReviewsPage.reviewsSection.scrollIntoViewIfNeeded()
      await storefrontPage.evaluate(() => window.scrollBy(0, 60))
      await storefrontPage.screenshot({
        path: path.join(IMGS_DIR, '08-storefront-reply-edited-desktop.png'),
      })

      // =========================================================================
      // STEP 7: Admin deletes the reply (Req 2.5) and Storefront removes the
      // reply block upon reload (Req 3.3, 3.5)
      // =========================================================================
      const rowToDelete = adminReviewsPage.rowByComment(targetReview.comment)
      await adminReviewsPage.openDeleteDialogForRow(rowToDelete)
      await expect(
        adminReviewsPage.dialog.getByText(
          'Bạn có chắc chắn muốn xóa phản hồi này? Đánh giá sẽ trở về trạng thái chưa phản hồi.'
        )
      ).toBeVisible()

      await adminPage.screenshot({
        path: path.join(IMGS_DIR, '09-admin-delete-reply-confirm.png'),
      })

      const deleteRespPromise = adminPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/v1/admin/reviews/${targetReview.id}/reply`) &&
          resp.request().method() === 'DELETE'
      )
      const refreshAfterDeletePromise = adminPage.waitForResponse(
        (resp) =>
          resp.url().includes('/api/v1/admin/reviews') && resp.request().method() === 'GET'
      )
      await adminReviewsPage.dialog.getByRole('button', { name: 'Xóa phản hồi' }).click()

      const deleteResp = await deleteRespPromise
      expect(deleteResp.status()).toBe(200)
      const deleteBody = await deleteResp.json()
      expect(deleteBody.success).toBe(true)
      expect(deleteBody.message).toBe('Xóa phản hồi thành công')
      expect(deleteBody.data.adminReply).toBeUndefined()
      await refreshAfterDeletePromise

      // Admin table row returns to "Chưa phản hồi" (Req 2.5)
      const rowAfterDelete = adminReviewsPage.rowByComment(targetReview.comment)
      await expect(rowAfterDelete.getByText('Chưa phản hồi')).toBeVisible()
      await expect(rowAfterDelete.getByRole('button', { name: 'Phản hồi' })).toBeVisible()

      // Reload Storefront and verify reply block is removed (Req 3.3, 3.5)
      const afterDeletePublicBody = (await storefrontReviewsPage.reloadAndWaitForReviews(
        productId
      )) as {
        data: {
          reviews: Array<Record<string, unknown>>
        }
      }
      const deletedReviewJson = afterDeletePublicBody.data.reviews.find(
        (r) => r.id === targetReview.id
      )
      expect(deletedReviewJson?.adminReply).toBeUndefined()

      const blockAfterDelete = storefrontReviewsPage.reviewBlockByComment(targetReview.comment)
      await expect(blockAfterDelete).toBeVisible()
      await expect(blockAfterDelete.getByText('Phản hồi từ người bán')).toHaveCount(0)
      await expect(blockAfterDelete.getByText(editedReplyText)).toHaveCount(0)

      await storefrontReviewsPage.reviewsSection.scrollIntoViewIfNeeded()
      await storefrontPage.evaluate(() => window.scrollBy(0, -90))
      await storefrontPage.screenshot({
        path: path.join(IMGS_DIR, '10-storefront-reply-deleted-desktop.png'),
      })
    } finally {
      await adminContext.close()
      await storefrontContext.close()
    }
  })
})
