import * as fs from 'node:fs'
import * as path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import {
  loadContractSnapshots,
  mountContractRoutes,
  assertMatchesContractShape,
  type ContractRoute,
} from './fixtures/contract'
import { ReviewHistoryPage } from './pages/ReviewHistoryPage'

const snapshots = loadContractSnapshots('review-history')
const imgsDir = path.resolve(process.cwd(), '..', '.dream', 'specs', 'review-history', 'imgs')

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <rect width="240" height="240" rx="24" fill="#ecfdf5"/>
  <rect x="68" y="36" width="104" height="168" rx="18" fill="#059669"/>
  <rect x="78" y="52" width="84" height="128" rx="10" fill="#ffffff"/>
  <circle cx="120" cy="192" r="6" fill="#a7f3d0"/>
</svg>`

interface MockUserReview {
  id: string
  orderItemId: string
  rating: number
  comment: string
  editCount: number
  canEdit: boolean
  edited: boolean
  adminReply?: string
  adminRepliedAt?: string
  media: Array<{
    id: string
    type: string
    mimeType: string
    url: string
    position: number
    createdAt: string
  }>
  createdAt: string
  updatedAt: string
  product: {
    id: string
    name: string
    brandName: string
    model: string
    imageUrl: string
    options: Array<{ groupLabel: string; valueLabel: string }>
  }
  order: {
    id: string
    createdAt: string
  }
}

function parseMultipartField(postData: string, fieldName: string): string | null {
  const regex = new RegExp(`name="${fieldName}"\\r?\\n\\r?\\n([\\s\\S]*?)\\r?\\n--`)
  const match = postData.match(regex)
  return match ? match[1].trim() : null
}

async function assertVisualQualityInvariants(page: Page): Promise<void> {
  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth
  })
  expect(hasHorizontalOverflow, 'Horizontal overflow detected on viewport').toBe(false)

  const brokenImages = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'))
    return imgs
      .filter((img) => {
        const style = window.getComputedStyle(img)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.src)
  })
  expect(brokenImages, `Broken visible images found: ${brokenImages.join(', ')}`).toEqual([])
}

const MOCK_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'khachhang@auraphone.vn',
  role: 'customer',
  createdAt: '2026-10-01T00:00:00Z',
}

function envelope(message: string, data: unknown, pagination?: Record<string, unknown>) {
  return {
    success: true,
    message,
    data,
    error: null,
    meta: { timestamp: '2026-10-20T10:00:00Z', ...(pagination ? { pagination } : {}) },
  }
}

function singlePage(total: number, limit: number) {
  return { total, page: 1, limit, totalPages: total > 0 ? 1 : 0, hasNext: false, hasPrev: false }
}

// Background calls from the shared storefront layout, outside this feature's contracts.
function layoutRoutes(isAuthenticated: boolean): ContractRoute[] {
  const unauthenticated = snapshots.snapshots.unauthenticated_401
  return [
    {
      method: 'GET',
      path: '/api/v1/auth/me',
      stub: ({ request }) =>
        isAuthenticated && /^Bearer .+/.test(request.headers()['authorization'] ?? '')
          ? { status: 200, body: envelope('Lấy thông tin người dùng thành công', MOCK_USER) }
          : { status: unauthenticated.status, body: unauthenticated.responseBody },
    },
    {
      method: 'GET',
      path: '/api/v1/categories',
      stub: {
        status: 200,
        body: envelope('Lấy danh mục thành công', [
          {
            id: 'cat-apple',
            name: 'Apple iPhone',
            slug: 'apple-iphone',
            description: 'Điện thoại iPhone chính hãng',
          },
        ]),
      },
    },
    {
      method: 'GET',
      path: '/api/v1/cart',
      stub: {
        status: 200,
        body: envelope('Lấy giỏ hàng thành công', {
          id: 'cart-1',
          items: [],
          totalUnits: 2,
          selectedTotal: '0',
        }),
      },
    },
    {
      method: 'GET',
      path: '/api/v1/favorites',
      stub: {
        status: 200,
        body: envelope('Lấy danh sách yêu thích thành công', [], singlePage(0, 10)),
      },
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/chat\//,
      stub: { status: 200, body: envelope('OK', null) },
    },
    {
      method: 'GET',
      path: '/api/v1/notifications',
      stub: {
        status: 200,
        body: envelope('Lấy danh sách thông báo thành công', { items: [], unreadCount: 0 }),
      },
    },
  ]
}

// Static assets outside /api/v1, which the route-mounting helper does not cover.
async function setupAssetRoutes(page: Page): Promise<void> {
  // Intercept chat WebSocket in Mode 2 so Vite does not proxy to offline backend
  await page.routeWebSocket('**/api/v1/chat/ws*', () => {})

  await page.route('https://images.unsplash.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: PLACEHOLDER_SVG,
    })
  })

  await page.route('**/media/reviews/**', async (route) => {
    const url = route.request().url()
    if (url.includes('broken-media') || url.includes('broken-video')) {
      await route.fulfill({ status: 404, body: 'Not found' })
      return
    }
    if (url.includes('media-102')) {
      // Keep video metadata stream open in mock mode so <video controls> stays rendered without firing onError
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: PLACEHOLDER_SVG,
    })
  })
}

function createInitialReviewsState(): MockUserReview[] {
  const raw = structuredClone(snapshots.snapshots.get_user_reviews_200.responseBody) as {
    data: { reviews: MockUserReview[] }
  }
  return raw.data.reviews
}

interface ReviewRouteOptions {
  initialReviews?: MockUserReview[]
  totalOverride?: number
  delayMs?: number
  forceInvalidMultipartRatingOnce?: boolean
}

interface ReviewRouteState {
  reviewsState: MockUserReview[]
  requestedReviewQueries: string[]
  capturedPutRequests: Array<{ contentType: string; rating: number; comment: string }>
}

function reviewRoutes(options: ReviewRouteOptions, state: ReviewRouteState): ContractRoute[] {
  const { reviewsState, requestedReviewQueries, capturedPutRequests } = state
  let forceInvalidOnce = options.forceInvalidMultipartRatingOnce ?? false

  return [
    {
      method: 'GET',
      path: '/api/v1/reviews/me',
      auth: 'bearer',
      handle: async ({ url }) => {
        if (options.delayMs) {
          await new Promise((r) => setTimeout(r, options.delayMs))
        }

        requestedReviewQueries.push(url.search)
        const ratingParam = url.searchParams.get('rating')
        const pageNum = Number(url.searchParams.get('page') || '1')
        const limitNum = Number(url.searchParams.get('limit') || '10')

        // Inbound query validation of the backend handler: rating must be 0..5
        if (ratingParam !== null) {
          const ratingVal = Number(ratingParam)
          if (!Number.isInteger(ratingVal) || ratingVal < 0 || ratingVal > 5) {
            return { snapshot: 'get_user_reviews_validation_400' }
          }
        }

        const activeRating = ratingParam ? Number(ratingParam) : 0
        const filtered =
          activeRating > 0 ? reviewsState.filter((r) => r.rating === activeRating) : reviewsState

        if (filtered.length === 0) {
          return { snapshot: 'get_user_reviews_empty_200' }
        }

        const total =
          options.totalOverride && activeRating === 0 ? options.totalOverride : filtered.length
        const totalPages = Math.max(1, Math.ceil(total / limitNum))
        const body = structuredClone(snapshots.snapshots.get_user_reviews_200.responseBody) as {
          data: { reviews: MockUserReview[] }
          meta: { pagination: Record<string, unknown> }
        }
        body.data.reviews = structuredClone(filtered)
        body.meta.pagination = {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        }

        return {
          snapshot: 'get_user_reviews_200',
          body: body as unknown as Record<string, unknown>,
        }
      },
    },
    {
      method: 'PUT',
      path: /^\/api\/v1\/orders\/[^/]+\/items\/[^/]+\/review$/,
      auth: 'bearer',
      handle: ({ request, url }) => {
        const urlParts = url.pathname.split('/')
        const itemId = urlParts[urlParts.indexOf('items') + 1]
        const contentType = request.headers()['content-type'] || ''
        const postData = request.postData() || ''

        expect(contentType).toContain('multipart/form-data')
        const rawRating = parseMultipartField(postData, 'rating')
        const rawComment = parseMultipartField(postData, 'comment') ?? ''
        const parsedRating = forceInvalidOnce ? 6 : Number(rawRating)
        forceInvalidOnce = false

        // Inbound multipart validation of the backend handler
        if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
          return { snapshot: 'update_review_validation_400' }
        }

        const target = reviewsState.find((r) => r.orderItemId === itemId)
        if (!target || target.editCount >= 1 || !target.canEdit) {
          return { snapshot: 'update_review_conflict_409' }
        }

        // The body is multipart, so the helper's JSON request check does not apply; compare the parsed fields instead.
        const requestPayload = { rating: parsedRating, comment: rawComment }
        assertMatchesContractShape(
          requestPayload,
          snapshots.snapshots.update_review_200.requestBody,
          'snapshot(update_review_200).requestBody'
        )
        capturedPutRequests.push({ contentType, rating: parsedRating, comment: rawComment })

        target.rating = parsedRating
        target.comment = rawComment
        target.editCount = 1
        target.canEdit = false
        target.edited = true
        target.updatedAt = '2026-10-20T10:30:00Z'

        const updateBody = structuredClone(snapshots.snapshots.update_review_200.responseBody) as {
          data: Record<string, unknown>
        }
        updateBody.data.id = target.id
        updateBody.data.orderItemId = target.orderItemId
        updateBody.data.rating = target.rating
        updateBody.data.comment = target.comment
        updateBody.data.editCount = target.editCount
        updateBody.data.canEdit = target.canEdit
        updateBody.data.edited = target.edited
        updateBody.data.updatedAt = target.updatedAt

        return {
          snapshot: 'update_review_200',
          body: updateBody as unknown as Record<string, unknown>,
        }
      },
    },
    // Req 3.5: the review DELETE route does not exist, so the router answers 404.
    {
      method: 'DELETE',
      path: /^\/api\/v1\/orders\/[^/]+\/items\/[^/]+\/review$/,
      stub: {
        status: 404,
        body: {
          success: false,
          message: 'Không tìm thấy đường dẫn',
          data: null,
          error: { code: 'not_found', message: 'Không tìm thấy đường dẫn' },
          meta: { timestamp: '2026-10-20T10:00:00Z' },
        },
      },
    },
    // Cross-page routes for /products, /products/:productId, /products/:productId/reviews and /orders/:orderId (Req 1.4, 1.5, 5.2)
    {
      method: 'GET',
      path: '/api/v1/products',
      stub: () => ({
        status: 200,
        body: envelope(
          'Lấy danh sách sản phẩm thành công',
          reviewsState.map((r) => ({
            id: r.product.id,
            categoryId: 'cat-apple',
            categoryName: 'Apple iPhone',
            brandName: r.product.brandName,
            name: r.product.name,
            slug: r.product.id,
            imageUrl: r.product.imageUrl,
            minPrice: '29990000',
            maxPrice: '29990000',
            inStock: true,
          })),
          { ...singlePage(reviewsState.length, 12), totalPages: 1 }
        ),
      }),
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/products\/[^/]+\/reviews$/,
      stub: ({ url }) => {
        const productId = url.pathname.split('/')[4]
        const prodReviews = reviewsState.filter((r) => r.product.id === productId)
        const avg =
          prodReviews.length > 0
            ? (prodReviews.reduce((acc, r) => acc + r.rating, 0) / prodReviews.length).toFixed(1)
            : '0.0'
        return {
          status: 200,
          body: envelope(
            'Lấy danh sách đánh giá thành công',
            {
              summary: {
                totalReviews: prodReviews.length,
                averageRating: avg,
                ratingCounts: {
                  '1': prodReviews.filter((r) => r.rating === 1).length,
                  '2': prodReviews.filter((r) => r.rating === 2).length,
                  '3': prodReviews.filter((r) => r.rating === 3).length,
                  '4': prodReviews.filter((r) => r.rating === 4).length,
                  '5': prodReviews.filter((r) => r.rating === 5).length,
                },
              },
              reviews: prodReviews.map((r) => ({
                id: r.id,
                rating: r.rating,
                comment: r.comment,
                edited: r.edited,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                reviewer: { maskedEmail: 'k***@auraphone.vn' },
                purchase: { model: r.product.model, options: r.product.options },
                media: r.media,
                helpfulness: { helpfulCount: 3, unhelpfulCount: 0, viewerVote: null },
                adminReply: r.adminReply,
                adminRepliedAt: r.adminRepliedAt,
              })),
            },
            { ...singlePage(prodReviews.length, 10), totalPages: 1 }
          ),
        }
      },
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/products\/[^/]+$/,
      stub: ({ url }) => {
        const productId = url.pathname.split('/').pop() || 'prod-101'
        const matched = reviewsState.find((r) => r.product.id === productId) ?? reviewsState[0]
        return {
          status: 200,
          body: envelope('Lấy chi tiết sản phẩm thành công', {
            id: matched.product.id,
            categoryId: 'cat-apple',
            categoryName: 'Apple iPhone',
            brandName: matched.product.brandName,
            name: matched.product.name,
            slug: matched.product.id,
            description: 'Điện thoại chính hãng VNA',
            images: [{ id: 'img-1', url: matched.product.imageUrl, isPrimary: true }],
            optionGroups: [],
            variants: [
              {
                id: 'var-1',
                model: matched.product.model,
                price: '29990000',
                stockQuantity: 10,
                isDefault: true,
                options: [],
              },
            ],
          }),
        }
      },
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/orders\/[^/]+$/,
      stub: ({ url }) => {
        const orderId = url.pathname.split('/').pop() || '22222222-2222-2222-2222-222222222222'
        const matched = reviewsState.find((r) => r.order.id === orderId) ?? reviewsState[0]
        return {
          status: 200,
          body: envelope('Lấy chi tiết đơn hàng thành công', {
            id: matched.order.id,
            userId: MOCK_USER.id,
            status: 'delivered',
            recipientName: 'Nguyễn Văn A',
            phone: '0901234567',
            provinceName: 'TP. Hồ Chí Minh',
            wardName: 'Phường Bến Nghé',
            detailAddress: '123 Nguyễn Huệ',
            paymentMethod: 'cod',
            subtotalVnd: '29990000',
            shippingFeeVnd: '0',
            totalVnd: '29990000',
            createdAt: matched.order.createdAt,
            updatedAt: matched.updatedAt,
            items: [
              {
                id: matched.orderItemId,
                variantId: 'var-1',
                productId: matched.product.id,
                brandName: matched.product.brandName,
                productName: matched.product.name,
                model: matched.product.model,
                imageUrl: matched.product.imageUrl,
                options: matched.product.options,
                unitPriceVnd: '29990000',
                quantity: 1,
                lineTotalVnd: '29990000',
                reviewStatus: 'reviewed',
                review: {
                  id: matched.id,
                  orderItemId: matched.orderItemId,
                  rating: matched.rating,
                  comment: matched.comment,
                  editCount: matched.editCount,
                  canEdit: matched.canEdit,
                  edited: matched.edited,
                  media: matched.media,
                  createdAt: matched.createdAt,
                  updatedAt: matched.updatedAt,
                },
              },
            ],
          }),
        }
      },
    },
  ]
}

async function setupReviewHistoryRoutes(
  page: Page,
  options: ReviewRouteOptions & { authenticated?: boolean } = {}
): Promise<ReviewRouteState> {
  const isAuthenticated = options.authenticated ?? true

  await page.addInitScript(
    ({ authenticated, user }) => {
      if (authenticated) {
        localStorage.setItem('accessToken', 'mock-jwt-customer-token')
        localStorage.setItem('authUser', JSON.stringify(user))
      } else {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('authUser')
      }
    },
    { authenticated: isAuthenticated, user: MOCK_USER }
  )

  const state: ReviewRouteState = {
    reviewsState: options.initialReviews ?? createInitialReviewsState(),
    requestedReviewQueries: [],
    capturedPutRequests: [],
  }

  await setupAssetRoutes(page)
  await mountContractRoutes(page, snapshots, [
    ...layoutRoutes(isAuthenticated),
    ...reviewRoutes(options, state),
  ])

  return state
}

test.describe('Review History E2E — Mode 2 (Contract-Verified Mock E2E)', () => {
  test.beforeAll(() => {
    fs.mkdirSync(imgsDir, { recursive: true })
  })

  test('Req 1.2–1.5, 4.2, 5.1, 6.1, 6.3, 6.4: Loading skeleton, Header navigation, descending review list, full product/order metadata, video controls without autoplay, and keyboard focus (API-USER-REVIEWS@1)', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message)
    })

    const { requestedReviewQueries } = await setupReviewHistoryRoutes(page, { delayMs: 250 })

    const reviewPage = new ReviewHistoryPage(page)

    // Req 5.1: Navigate from "/" via Desktop Header "Lịch sử đánh giá" link
    await page.goto('/')
    await expect(reviewPage.headerReviewsLink).toBeVisible()
    await reviewPage.headerReviewsLink.click()
    await expect(page).toHaveURL(/\/reviews$/)

    // Req 6.3: Loading skeleton appears while fetching reviews
    await expect(page.getByTestId('review-loading-skeleton')).toBeVisible()
    await expect(reviewPage.heading).toHaveText('Lịch sử đánh giá')
    await expect(reviewPage.reviewCards).toHaveCount(2)
    expect(requestedReviewQueries[0]).toContain('page=1')
    expect(requestedReviewQueries[0]).toContain('limit=10')

    // Req 1.2: Verify descending order by createdAt (rev-101 from Oct 18 first, rev-102 from Oct 12 second)
    await expect(reviewPage.reviewCards.nth(0)).toHaveAttribute('data-review-id', 'rev-101')
    await expect(reviewPage.reviewCards.nth(1)).toHaveAttribute('data-review-id', 'rev-102')

    // Req 1.3: Verify complete metadata on rev-101 (brand, model, options, order ID & date, review date, media, seller reply)
    const card1 = reviewPage.reviewCardById('rev-101')
    await expect(card1).toContainText('Apple')
    await expect(card1).toContainText('(A3106)')
    await expect(card1).toContainText('Màu sắc:')
    await expect(card1).toContainText('Titan Tự Nhiên')
    await expect(card1).toContainText('Dung lượng:')
    await expect(card1).toContainText('256GB')
    await expect(card1).toContainText('Ngày đặt: 16:00 16/10/2026')
    await expect(card1).toContainText('Đánh giá ngày: 16:00 18/10/2026')
    await expect(card1).toContainText('5/5 sao')
    await expect(reviewPage.productNameLink(card1)).toContainText(
      'iPhone 15 Pro Max 256GB Titan Tự Nhiên'
    )
    await expect(reviewPage.productNameLink(card1)).toHaveAttribute('href', '/products/prod-101')
    await expect(reviewPage.productImageLink(card1)).toHaveAttribute('href', '/products/prod-101')
    await expect(reviewPage.orderLink(card1)).toHaveAttribute(
      'href',
      '/orders/22222222-2222-2222-2222-222222222222'
    )
    await expect(reviewPage.imageThumbnails(card1)).toHaveCount(1)

    // Req 4.2: Video player has controls and does NOT autoplay audio
    const videoEl = reviewPage.videoPlayer(card1)
    await expect(videoEl).toBeVisible()
    await expect(videoEl).toHaveAttribute('controls', '')
    const videoState = await videoEl.evaluate((v: HTMLVideoElement) => ({
      autoplay: v.autoplay,
      paused: v.paused,
    }))
    expect(videoState.autoplay).toBe(false)
    expect(videoState.paused).toBe(true)

    await expect(reviewPage.editButton(card1)).toBeVisible()
    await expect(reviewPage.editedBadge(card1)).toHaveCount(0)
    await expect(reviewPage.adminReplyBlock(card1)).toBeVisible()
    await expect(reviewPage.adminReplyBlock(card1)).toContainText('Phản hồi từ người bán')

    // Req 1.3: Verify rev-102 (edited === true, editCount === 1) displays "Đã chỉnh sửa" + updatedAt, model & options
    const card2 = reviewPage.reviewCardById('rev-102')
    await expect(card2).toContainText('Samsung')
    await expect(card2).toContainText('(SM-S928B)')
    await expect(card2).toContainText('Xám Titan')
    await expect(card2).toContainText('512GB')
    await expect(reviewPage.editButton(card2)).toHaveCount(0)
    await expect(reviewPage.editedBadge(card2)).toHaveText('Đã chỉnh sửa')
    await expect(reviewPage.updatedAtLabel(card2)).toContainText('Cập nhật: 23:45 14/10/2026')
    await expect(reviewPage.adminReplyBlock(card2)).toHaveCount(0)

    // Req 3.5: Verify no delete action or button exists anywhere on review cards
    await expect(page.getByRole('button', { name: /xóa đánh giá/i })).toHaveCount(0)

    // Req 6.4: Keyboard focus ring on filter tab
    const tab0 = reviewPage.filterButton(0)
    await tab0.focus()
    await expect(tab0).toBeFocused()
    await expect(tab0).toHaveClass(/focus-visible:ring-2/)

    await page.evaluate(() => window.scrollTo(0, 0))
    await assertVisualQualityInvariants(page)

    await page.screenshot({
      path: path.join(imgsDir, '01-desktop-review-history-list.png'),
      fullPage: true,
    })

    // Req 1.4 & 1.5: Click product link to navigate to /products/prod-101, then back and click order link to /orders/:id
    await reviewPage.productNameLink(card1).click()
    await expect(page).toHaveURL(/\/products\/prod-101$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/reviews$/)

    await reviewPage.orderLink(card1).click()
    await expect(page).toHaveURL(/\/orders\/22222222-2222-2222-2222-222222222222$/)

    expect(consoleErrors).toEqual([])
  })

  test('Req 1.1 & Rule 2: Unauthenticated access redirects to /login?redirect=/reviews, hides Header link, and API rejects missing Bearer token with 401', async ({
    page,
  }) => {
    await setupReviewHistoryRoutes(page, { authenticated: false })

    const reviewPage = new ReviewHistoryPage(page)
    await reviewPage.goto()

    await expect(page).toHaveURL(/\/login\?redirect=(\/reviews|%2Freviews)/)
    await expect(reviewPage.headerReviewsLink).toHaveCount(0)

    // Rule 2: Direct unauthenticated GET to /api/v1/reviews/me returns 401 from golden snapshot
    const status = await page.evaluate(async () => {
      const res = await fetch('/api/v1/reviews/me')
      return res.status
    })
    expect(status).toBe(401)
  })

  test('Req 1.6: Renders empty review history state with CTA links to /orders?status=reviewable and /products when total is 0', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await setupReviewHistoryRoutes(page, { initialReviews: [] })

    const reviewPage = new ReviewHistoryPage(page)
    await reviewPage.goto()

    await expect(reviewPage.emptyStateHeading).toBeVisible()
    const ordersCta = page.getByRole('link', { name: /Xem đơn chờ đánh giá/i })
    await expect(ordersCta).toHaveAttribute('href', '/orders?status=reviewable')
    const productsCta = page.getByRole('link', { name: /Tiếp tục mua sắm/i })
    await expect(productsCta).toHaveAttribute('href', '/products')

    await assertVisualQualityInvariants(page)
    expect(consoleErrors).toEqual([])

    await page.screenshot({
      path: path.join(imgsDir, '07-empty-review-history.png'),
      fullPage: true,
    })
  })

  test('Req 2.1–2.5, 6.4 & Rule 2/4: All 6 rating filter tabs, pagination controls, page=1 reset on filter change, filter empty state, and inbound 400 validation on ?rating=9', async ({
    page,
  }) => {
    const unexpectedErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('status of 400')) {
        unexpectedErrors.push(msg.text())
      }
    })

    const { requestedReviewQueries } = await setupReviewHistoryRoutes(page, { totalOverride: 12 })

    const reviewPage = new ReviewHistoryPage(page)
    await reviewPage.goto()

    // Req 2.1: Verify all 6 rating filter tabs (Tất cả, 5 sao, 4 sao, 3 sao, 2 sao, 1 sao)
    for (const rating of [0, 5, 4, 3, 2, 1]) {
      await expect(reviewPage.filterButton(rating)).toBeVisible()
    }

    // Req 2.3 & 2.4: Pagination controls navigate to page 2
    await expect(reviewPage.pagination).toBeVisible()
    await expect(reviewPage.pagination).toContainText('Trang 1 / 2')
    await reviewPage.nextPageButton.click()
    await expect(reviewPage.pagination).toContainText('Trang 2 / 2')
    expect(requestedReviewQueries.some((q) => q.includes('page=2'))).toBe(true)

    // Req 2.2: Selecting a rating filter from page 2 resets page to 1 (omits page param -> page=1 in API call)
    await reviewPage.selectRatingFilter(5)
    await expect(reviewPage.reviewCards).toHaveCount(1)
    await expect(page).toHaveURL(/rating=5/)
    await expect(page).not.toHaveURL(/page=2/)
    expect(requestedReviewQueries.at(-1)).toContain('rating=5')
    expect(requestedReviewQueries.at(-1)).toContain('page=1')

    // Req 2.5: Selecting 1 sao with 0 matching reviews displays filter empty state and reset button
    await reviewPage.selectRatingFilter(1)
    await expect(page.getByRole('heading', { name: 'Chưa có đánh giá 1 sao nào' })).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      path: path.join(imgsDir, '02-filter-5-star-and-empty-filter.png'),
      fullPage: true,
    })

    await reviewPage.filterEmptyResetButton.click()
    await expect(reviewPage.reviewCards).toHaveCount(2)

    // Rule 2 & Rule 4: Navigating to /reviews?rating=9 triggers genuine inbound query validation 400
    await page.goto('/reviews?rating=9')
    await expect(page.getByRole('heading', { name: 'Lỗi tải dữ liệu' })).toBeVisible()
    expect(unexpectedErrors).toEqual([])
  })

  test('Req 3.1–3.5, 5.2 & Rule 2/3/4: Inline edit modal, 400 validation error, 200 stateful update with toast, 409 conflict on second edit, DELETE 404, and cross-page sync on /products/:id and /orders/:id (API-ORDER-ITEM-REVIEW@1)', async ({
    page,
  }) => {
    const unexpectedErrors: string[] = []
    page.on('console', (msg) => {
      if (
        msg.type() === 'error' &&
        !msg.text().includes('status of 400') &&
        !msg.text().includes('status of 409') &&
        !msg.text().includes('status of 404')
      ) {
        unexpectedErrors.push(msg.text())
      }
    })
    page.on('pageerror', (err) => {
      unexpectedErrors.push(err.message)
    })

    const { capturedPutRequests } = await setupReviewHistoryRoutes(page, {
      forceInvalidMultipartRatingOnce: true,
    })

    const reviewPage = new ReviewHistoryPage(page)
    await reviewPage.goto()

    // Req 3.1 & 3.2: Open edit modal on editable review rev-101 (editCount = 0)
    await reviewPage.openEditModalForReview('rev-101')
    await expect(reviewPage.editModal).toBeVisible()
    await expect(reviewPage.editCommentInput).toHaveValue(
      'Máy chính hãng VNA đóng gói rất kỹ, màn hình 120Hz siêu mượt và camera zoom 5x cực kỳ sắc nét.'
    )

    await page.screenshot({
      path: path.join(imgsDir, '04-edit-review-modal-open.png'),
      fullPage: false,
    })

    // Rule 4: First submit with invalid rating (6) returns 400 validation_error
    await reviewPage.submitEditReview(
      4,
      'Sau 2 tuần sử dụng pin vẫn rất ổn định, đáng tiền.'
    )
    await expect(reviewPage.editModal).toBeVisible()
    await expect(reviewPage.editModal).toContainText('Số sao đánh giá phải từ 1 đến 5')

    // Req 3.3 & Rule 3/4: Valid submit returns 200 OK, mutates state (editCount = 1, canEdit = false, edited = true), shows toast, and updates card in-place
    await reviewPage.editSaveButton.click()
    await expect(reviewPage.editModal).toHaveCount(0)
    await expect(page.getByText('Cập nhật đánh giá thành công!')).toBeVisible()

    expect(capturedPutRequests).toHaveLength(1)
    expect(capturedPutRequests[0].rating).toBe(4)
    expect(capturedPutRequests[0].comment).toBe(
      'Sau 2 tuần sử dụng pin vẫn rất ổn định, đáng tiền.'
    )

    const updatedCard = reviewPage.reviewCardById('rev-101')
    await expect(updatedCard).toContainText('4/5 sao')
    await expect(updatedCard).toContainText(
      'Sau 2 tuần sử dụng pin vẫn rất ổn định, đáng tiền.'
    )
    await expect(reviewPage.editedBadge(updatedCard)).toHaveText('Đã chỉnh sửa')
    await expect(reviewPage.updatedAtLabel(updatedCard)).toContainText('Cập nhật: 17:30 20/10/2026')
    await expect(reviewPage.editButton(updatedCard)).toHaveCount(0)

    // Scroll to top before full-page screenshot so sticky Header does not overlap card1
    await page.evaluate(() => window.scrollTo(0, 0))
    await assertVisualQualityInvariants(page)

    await page.screenshot({
      path: path.join(imgsDir, '06-edit-review-success-200.png'),
      fullPage: true,
    })

    // Req 3.4 & Rule 4: Verify that attempting to edit an already-edited item (editCount = 1) is rejected with 409 review_edit_limit_reached
    const secondEditResp = await page.evaluate(async () => {
      const fd = new FormData()
      fd.append('rating', '3')
      fd.append('comment', 'Sửa lần 2')
      const res = await fetch(
        '/api/v1/orders/22222222-2222-2222-2222-222222222222/items/33333333-3333-3333-3333-333333333333/review',
        {
          method: 'PUT',
          headers: { Authorization: 'Bearer mock-jwt-customer-token' },
          body: fd,
        }
      )
      return { status: res.status, body: await res.json() }
    })
    expect(secondEditResp.status).toBe(409)
    expect(secondEditResp.body.error.code).toBe('review_edit_limit_reached')
    expect(secondEditResp.body.message).toBe('Đánh giá chỉ được chỉnh sửa một lần')

    // Req 3.5: Verify DELETE route returns 404
    const deleteStatus = await page.evaluate(async () => {
      const res = await fetch(
        '/api/v1/orders/22222222-2222-2222-2222-222222222222/items/33333333-3333-3333-3333-333333333333/review',
        {
          method: 'DELETE',
          headers: { Authorization: 'Bearer mock-jwt-customer-token' },
        }
      )
      return res.status
    })
    expect(deleteStatus).toBe(404)

    // Req 5.2: Navigate to /products/prod-101 and verify updated review content is synced
    await reviewPage.productNameLink(updatedCard).click()
    await expect(page).toHaveURL(/\/products\/prod-101$/)
    await expect(
      page.getByText('Sau 2 tuần sử dụng pin vẫn rất ổn định, đáng tiền.')
    ).toBeVisible()
    await expect(page.getByText('4.0').first()).toBeVisible()

    // Req 5.2: Navigate back to /reviews, then click order link to /orders/:id and verify updated 4★ rating and hidden edit button
    await page.goBack()
    await expect(page).toHaveURL(/\/reviews$/)
    await reviewPage.orderLink(updatedCard).click()
    await expect(page).toHaveURL(/\/orders\/22222222-2222-2222-2222-222222222222$/)
    await expect(page.getByText('Đã đánh giá (4★)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sửa đánh giá' })).toHaveCount(0)

    expect(unexpectedErrors).toEqual([])
  })

  test('Req 3.4 & Rule 4: Displays 409 review_edit_limit_reached error message in modal when concurrent edit limit is reached', async ({
    page,
  }) => {
    const initial = createInitialReviewsState()
    const { reviewsState } = await setupReviewHistoryRoutes(page, { initialReviews: initial })

    const reviewPage = new ReviewHistoryPage(page)
    await reviewPage.goto()

    await reviewPage.openEditModalForReview('rev-101')
    await expect(reviewPage.editModal).toBeVisible()

    // Simulate concurrent edit having incremented editCount to 1 before user clicks Save
    reviewsState[0].editCount = 1
    reviewsState[0].canEdit = false

    await reviewPage.submitEditReview(3, 'Thử chỉnh sửa khi đã đạt giới hạn')
    await expect(reviewPage.editModal).toBeVisible()
    await expect(reviewPage.editModal).toContainText('Đánh giá chỉ được chỉnh sửa một lần')

    await page.screenshot({
      path: path.join(imgsDir, '05-edit-review-conflict-409.png'),
      fullPage: false,
    })
  })

  test('Req 4.1–4.3 & 6.4: Media thumbnails, Lightbox preview open/close via Escape and button, and broken media fallback placeholders', async ({
    page,
  }) => {
    const customReviews = createInitialReviewsState()
    customReviews[1].media = [
      {
        createdAt: '2026-10-12T08:00:00Z',
        id: 'media-broken-img',
        mimeType: 'image/jpeg',
        position: 0,
        type: 'image',
        url: '/media/reviews/broken-media',
      },
      {
        createdAt: '2026-10-12T08:00:00Z',
        id: 'media-broken-vid',
        mimeType: 'video/mp4',
        position: 1,
        type: 'video',
        url: '/media/reviews/broken-video',
      },
    ]
    await setupReviewHistoryRoutes(page, { initialReviews: customReviews })

    const reviewPage = new ReviewHistoryPage(page)
    await reviewPage.goto()

    const card1 = reviewPage.reviewCardById('rev-101')
    await expect(reviewPage.imageThumbnails(card1)).toHaveCount(1)

    // Req 4.3: Broken image and video render fallback placeholders without breaking card layout
    const card2 = reviewPage.reviewCardById('rev-102')
    await expect(reviewPage.mediaFallbacks(card2)).toHaveCount(2)
    await expect(card2).toContainText('Ảnh lỗi')
    await expect(card2).toContainText('Không thể tải video đính kèm')
    await card2.scrollIntoViewIfNeeded()
    await card2.screenshot({
      path: path.join(imgsDir, '03b-media-fallback-placeholder.png'),
    })

    // Req 4.1 & 6.4: Open Lightbox, verify single close button, close with Escape, reopen and capture screenshot
    await page.evaluate(() => window.scrollTo(0, 180))
    await reviewPage.imageThumbnails(card1).first().click({ force: true })
    await expect(reviewPage.lightbox).toBeVisible()
    await expect(reviewPage.lightboxImage).toBeVisible()
    await expect(reviewPage.lightbox.locator('button')).toHaveCount(1)

    await page.screenshot({
      path: path.join(imgsDir, '03-media-lightbox-and-fallback.png'),
      fullPage: false,
    })

    await page.keyboard.press('Escape')
    await expect(reviewPage.lightbox).toHaveCount(0)

    await reviewPage.imageThumbnails(card1).first().click()
    await expect(reviewPage.lightbox).toBeVisible()
    await reviewPage.lightboxCloseButton.click()
    await expect(reviewPage.lightbox).toHaveCount(0)
  })

  test('Req 5.1, 6.2: Mobile drawer navigation from / to /reviews (375x812) and compact viewport (320x720) without horizontal overflow', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await setupReviewHistoryRoutes(page)

    await page.setViewportSize({ width: 375, height: 812 })
    const reviewPage = new ReviewHistoryPage(page)

    // Req 5.1: Open mobile drawer on "/" and click "Lịch sử đánh giá" to navigate to "/reviews"
    await page.goto('/')
    await reviewPage.mobileMenuToggle.click()
    await expect(reviewPage.mobileReviewsLink).toBeVisible()
    await reviewPage.mobileReviewsLink.click()
    await expect(page).toHaveURL(/\/reviews$/)
    await expect(reviewPage.heading).toBeVisible()

    // Reopen drawer on /reviews to capture active mobile navigation state + responsive cards
    await reviewPage.mobileMenuToggle.click()
    await expect(reviewPage.mobileReviewsLink).toBeVisible()
    await assertVisualQualityInvariants(page)

    await page.screenshot({
      path: path.join(imgsDir, '08-mobile-375-and-320-responsive.png'),
      fullPage: true,
    })

    // Req 6.2: Verify 320px compact viewport has no horizontal overflow
    await page.setViewportSize({ width: 320, height: 720 })
    await assertVisualQualityInvariants(page)
    expect(consoleErrors).toEqual([])
  })
})
