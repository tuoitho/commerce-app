import { execFileSync } from 'node:child_process'
import { type APIRequestContext, type Page, expect } from '@playwright/test'

export const STOREFRONT_BASE_URL = process.env.BASE_URL || 'http://localhost:15173'
export const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || 'http://localhost:15174'
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:18080/api/v1'
const DB_URL =
  process.env.DB_URL ||
  'postgres://ecommerce:change-me-local-only@localhost:5432/commercesdd?sslmode=disable'

export const ADMIN_EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@example.com'
export const ADMIN_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'Admin123456@'

export const CUSTOMER_EMAIL = process.env.E2E_CUSTOMER_EMAIL || 'e2e.reviewer@auraphone.vn'
export const CUSTOMER_PASSWORD = process.env.E2E_CUSTOMER_PASSWORD || 'Customer123456@'

export const SECOND_CUSTOMER_EMAIL = 'e2e.reviewer2@auraphone.vn'

export interface AuthSession {
  accessToken: string
  user: {
    id: string
    email: string
    role: string
  }
}

export interface AdminReviewItem {
  id: string
  orderItemId: string
  rating: number
  comment: string
  adminReply?: string
  adminRepliedAt?: string
  reviewerEmail?: string
  createdAt: string
  product: {
    id: string
    name: string
    brandName: string
    model: string
    imageUrl: string
  }
}

export async function authenticateViaApi(
  request: APIRequestContext,
  role: 'admin' | 'customer',
  customEmail?: string
): Promise<AuthSession> {
  const email = customEmail || (role === 'admin' ? ADMIN_EMAIL : CUSTOMER_EMAIL)
  const password = role === 'admin' ? ADMIN_PASSWORD : CUSTOMER_PASSWORD

  let resp = await request.post(`${API_BASE_URL}/auth/login`, {
    data: { email, password },
  })

  if (resp.status() === 401 && role === 'customer') {
    resp = await request.post(`${API_BASE_URL}/auth/register`, {
      data: { email, password },
    })
  }

  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  expect(body.success).toBe(true)
  return body.data as AuthSession
}

export async function loginAdminViaUi(page: Page): Promise<void> {
  await page.goto(`${ADMIN_BASE_URL}/login`)
  await expect(page.getByRole('heading', { name: 'Đăng nhập quản trị viên' })).toBeVisible()

  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(ADMIN_PASSWORD)

  const loginRespPromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/v1/auth/login') && resp.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  const loginResp = await loginRespPromise
  expect(loginResp.status()).toBe(200)

  await expect(page).not.toHaveURL(/\/login$/)
}

async function ensureCustomerAddress(request: APIRequestContext, token: string): Promise<string> {
  const listResp = await request.get(`${API_BASE_URL}/addresses`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(listResp.ok()).toBeTruthy()
  const listBody = await listResp.json()
  if (Array.isArray(listBody.data) && listBody.data.length > 0) {
    return listBody.data[0].id as string
  }

  const provResp = await request.get(`${API_BASE_URL}/provinces`)
  expect(provResp.ok()).toBeTruthy()
  const provBody = await provResp.json()
  const provinceCode = provBody.data[0].code as number

  const wardResp = await request.get(`${API_BASE_URL}/provinces/${provinceCode}/wards`)
  expect(wardResp.ok()).toBeTruthy()
  const wardBody = await wardResp.json()
  const wardCode = wardBody.data[0].code as number

  const createResp = await request.post(`${API_BASE_URL}/addresses`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      recipientName: 'Nguyễn Văn Đánh Giá',
      phone: '0901234567',
      provinceCode,
      wardCode,
      detailAddress: '123 Nguyễn Huệ, Quận 1',
      isDefault: true,
    },
  })
  expect(createResp.status()).toBe(201)
  const createBody = await createResp.json()
  return createBody.data.id as string
}

async function createDeliveredOrderAndReviews(
  request: APIRequestContext,
  customerToken: string,
  adminToken: string,
  variantTargets: Array<{ variantId: string; rating: number; comment: string }>
): Promise<void> {
  const addressId = await ensureCustomerAddress(request, customerToken)

  let latestCartItems: Array<{
    variantId: string
    quantity: number
    productName: string
    unitPriceVnd: string
    selected: boolean
    availability: string
  }> = []

  for (const target of variantTargets) {
    const addResp = await request.post(`${API_BASE_URL}/cart/items`, {
      headers: { Authorization: `Bearer ${customerToken}` },
      data: { variantId: target.variantId },
    })
    expect(addResp.ok()).toBeTruthy()
    const addBody = await addResp.json()
    latestCartItems = addBody.data.items
  }

  const targetSet = new Set(variantTargets.map((t) => t.variantId))
  const lines = latestCartItems
    .filter((i) => targetSet.has(i.variantId))
    .map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
      productName: i.productName,
      unitPriceVnd: i.unitPriceVnd,
    }))

  expect(lines.length).toBeGreaterThan(0)

  const orderResp = await request.post(`${API_BASE_URL}/orders`, {
    headers: { Authorization: `Bearer ${customerToken}` },
    data: { addressId, lines },
  })
  expect(orderResp.status()).toBe(201)
  const orderBody = await orderResp.json()
  const orderId = orderBody.data.id as string

  // Fast-forward the 30-minute buyer auto-confirm window so admin can transition order immediately
  execFileSync('psql', [
    DB_URL,
    '-c',
    `UPDATE orders SET status = 'confirmed', confirmed_at = now() WHERE id = '${orderId}';`,
  ])

  // Admin transitions order: confirm-preparing -> ship -> deliver
  const confirmResp = await request.post(
    `${API_BASE_URL}/admin/orders/${orderId}/confirm-preparing`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  )
  expect(confirmResp.status()).toBe(200)

  const shipResp = await request.post(`${API_BASE_URL}/admin/orders/${orderId}/ship`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  expect(shipResp.status()).toBe(200)

  const deliverResp = await request.post(`${API_BASE_URL}/admin/orders/${orderId}/deliver`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  expect(deliverResp.status()).toBe(200)
  const deliverBody = await deliverResp.json()
  const orderItems: Array<{ id: string; variantId: string }> = deliverBody.data.items

  // Customer submits review for each item
  for (const item of orderItems) {
    const spec = variantTargets.find((t) => t.variantId === item.variantId)
    if (!spec) continue
    const revResp = await request.post(
      `${API_BASE_URL}/orders/${orderId}/items/${item.id}/review`,
      {
        headers: { Authorization: `Bearer ${customerToken}` },
        multipart: {
          rating: String(spec.rating),
          comment: spec.comment,
        },
      }
    )
    expect(revResp.status()).toBe(201)
  }
}

export async function ensureReviewFixtures(request: APIRequestContext): Promise<{
  adminSession: AuthSession
  customerSession: AuthSession
  targetReview: AdminReviewItem
  lowRatingReview: AdminReviewItem
}> {
  const adminSession = await authenticateViaApi(request, 'admin')
  const customerSession = await authenticateViaApi(request, 'customer', CUSTOMER_EMAIL)
  const secondCustomerSession = await authenticateViaApi(request, 'customer', SECOND_CUSTOMER_EMAIL)

  // Check existing reviews
  const existingResp = await request.get(`${API_BASE_URL}/admin/reviews?page=1&limit=50`, {
    headers: { Authorization: `Bearer ${adminSession.accessToken}` },
  })
  expect(existingResp.status()).toBe(200)
  const existingBody = await existingResp.json()
  let reviews: AdminReviewItem[] = existingBody.data || []

  if (reviews.length < 11) {
    // Fetch catalog products and collect available variants across distinct products
    const prodsResp = await request.get(`${API_BASE_URL}/products?limit=20`)
    expect(prodsResp.status()).toBe(200)
    const prodsBody = await prodsResp.json()
    const productSummaries: Array<{ id: string; name: string }> = prodsBody.data || []

    const availableVariants: Array<{ productId: string; productName: string; variantId: string }> = []
    for (const p of productSummaries) {
      if (availableVariants.length >= 11) break
      const detailResp = await request.get(`${API_BASE_URL}/products/${p.id}`)
      if (!detailResp.ok()) continue
      const detailBody = await detailResp.json()
      const activeVariant = (detailBody.data.variants || []).find(
        (v: { stockQuantity: number }) => v.stockQuantity >= 5
      )
      if (activeVariant) {
        availableVariants.push({
          productId: p.id,
          productName: p.name,
          variantId: activeVariant.id,
        })
      }
    }

    const needed = 11 - reviews.length
    const selected = availableVariants.slice(0, Math.max(needed, 3))

    const comments = [
      { rating: 5, comment: 'Máy chính hãng nguyên seal, màn hình sắc nét và hiệu năng cực kỳ mượt mà!' },
      { rating: 3, comment: 'Giao hàng hơi trễ 1 ngày nhưng đóng gói cẩn thận, máy hoạt động ổn định.' },
      { rating: 4, comment: 'Thiết kế đẹp, cầm chắc tay, camera chụp đêm rất ấn tượng.' },
      { rating: 5, comment: 'Pin trâu, sạc nhanh, nhân viên tư vấn nhiệt tình chu đáo.' },
      { rating: 5, comment: 'Chất lượng tuyệt vời trong tầm giá, rất đáng mua tại AuraPhone.' },
      { rating: 4, comment: 'Màu sắc ngoài đời đẹp hơn trong ảnh, loa nghe nhạc hay.' },
      { rating: 5, comment: 'Đóng gói chống sốc kỹ lưỡng, kích hoạt bảo hành chính hãng đầy đủ.' },
      { rating: 2, comment: 'Hộp hơi móp nhẹ ở góc do vận chuyển nhưng máy bên trong hoàn toàn tốt.' },
      { rating: 5, comment: 'Trải nghiệm mua sắm hài lòng, sẽ tiếp tục ủng hộ cửa hàng lần sau.' },
      { rating: 4, comment: 'Hiệu năng chơi game mượt, tản nhiệt tốt khi dùng liên tục.' },
      { rating: 5, comment: 'Sản phẩm xuất sắc, màn hình 120Hz vuốt chạm cực nhạy!' },
    ]

    const batchTargets = selected.map((v, idx) => ({
      variantId: v.variantId,
      rating: comments[idx % comments.length].rating,
      comment: comments[idx % comments.length].comment,
    }))

    await createDeliveredOrderAndReviews(
      request,
      customerSession.accessToken,
      adminSession.accessToken,
      batchTargets
    )

    // Also create a second unreplied review on the latest product by a second customer
    // so the product detail page has both a replied review and an unreplied review (Req 3.3)
    const primaryVariant = selected[selected.length - 1]
    await createDeliveredOrderAndReviews(
      request,
      secondCustomerSession.accessToken,
      adminSession.accessToken,
      [
        {
          variantId: primaryVariant.variantId,
          rating: 4,
          comment: 'Mua tặng người thân, máy dùng rất êm và pin bền bỉ cả ngày.',
        },
      ]
    )

    const refreshedResp = await request.get(`${API_BASE_URL}/admin/reviews?page=1&limit=50`, {
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    })
    expect(refreshedResp.status()).toBe(200)
    const refreshedBody = await refreshedResp.json()
    reviews = refreshedBody.data || []
  }

  // Pick a 5-star review on a product that also has a sibling review (if available) as the primary target review
  const productReviewCounts = new Map<string, number>()
  for (const r of reviews) {
    productReviewCounts.set(r.product.id, (productReviewCounts.get(r.product.id) || 0) + 1)
  }

  const targetReview =
    reviews.find(
      (r) =>
        r.rating === 5 &&
        r.reviewerEmail === CUSTOMER_EMAIL &&
        (productReviewCounts.get(r.product.id) || 0) >= 2
    ) ||
    reviews.find((r) => r.rating === 5 && r.reviewerEmail === CUSTOMER_EMAIL) ||
    reviews[0]
  const lowRatingReview = reviews.find((r) => r.rating === 3 || r.rating === 2) || reviews[1]

  // Ensure targetReview starts with NO adminReply so the lifecycle test is clean & repeatable
  if (targetReview.adminReply) {
    const delResp = await request.delete(
      `${API_BASE_URL}/admin/reviews/${targetReview.id}/reply`,
      { headers: { Authorization: `Bearer ${adminSession.accessToken}` } }
    )
    expect(delResp.status()).toBe(200)
    targetReview.adminReply = undefined
    targetReview.adminRepliedAt = undefined
  }

  // Ensure any sibling review by SECOND_CUSTOMER_EMAIL on the same product has no reply (Req 3.3)
  for (const r of reviews) {
    if (
      r.product.id === targetReview.product.id &&
      r.id !== targetReview.id &&
      r.adminReply
    ) {
      await request.delete(`${API_BASE_URL}/admin/reviews/${r.id}/reply`, {
        headers: { Authorization: `Bearer ${adminSession.accessToken}` },
      })
    }
  }

  return {
    adminSession,
    customerSession,
    targetReview,
    lowRatingReview,
  }
}
