// Contracts: API-AUTH-RECOVERY@1 (verifier); API-CATALOG-MEDIA-SPECS@1 (verifier); API-FLASH-SALES@1 (verifier); API-VOUCHERS-CHECKOUT-FULFILLMENT@1 (verifier); TYPE-STOREFRONT-ADMIN-SHARED@1 (verifier)
// _Requirements: 1.3, 1.4, 2.4, 2.5, 3.5, 4.3, 4.5, 5.2, 5.4, 5.5, 5.6, 6.5, 6.6, 7.1, 7.3, 7.5, 7.6_
import { test, expect, type Page, type WebSocketRoute } from '@playwright/test'
import {
  assertMatchesContractShape,
  loadContractSnapshots,
  mountContractRoutes,
  type ContractRoute,
} from './fixtures/contract'
import {
  AdminEnhancementsPage,
  StorefrontEnhancementsPage,
  assertLayoutInvariants,
  dismissActiveToasts,
  screenshotPath,
  scrollLocatorBelowHeader,
} from './pages/CommerceEnhancementsPage'

const snapshots = loadContractSnapshots('commerce-platform-enhancements', {
  nullable: ['maxDiscountVnd', 'usageLimit', 'voucherCode', 'voucherType', 'flashSale'],
})

const notificationSnapshots = loadContractSnapshots('system-notifications', {
  nullable: ['actorId', 'actorName', 'actorRole', 'postId', 'commentId', 'reactionType'],
})

const TS = '2026-11-18T15:00:00Z'

function envelope<T>(message: string, data: T, metaExtra: Record<string, unknown> = {}) {
  return {
    success: true,
    message,
    data,
    error: null,
    meta: { timestamp: TS, ...metaExtra },
  }
}

function cloneSnapshotBody(snapshotKey: string): Record<string, unknown> {
  const entry = snapshots.snapshots[snapshotKey]
  if (!entry) {
    throw new Error(`Missing contract snapshot: ${snapshotKey}`)
  }
  return structuredClone(entry.responseBody) as Record<string, unknown>
}

function buildValidatedOrderNotificationFrame(opts: {
  id: string
  notificationType: string
  recipientId: string
  actorId: string | null
  actorName: string | null
  actorRole: 'customer' | 'admin' | null
  orderId: string
  orderShortCode: string
  status: string
  excerpt: string
  totalVnd: string
  createdAt: string
}): Record<string, unknown> {
  const wsTemplate = structuredClone(
    notificationSnapshots.snapshots.ws_notification_new.responseBody
  ) as {
    type: string
    payload: Record<string, unknown> & {
      metadata: Record<string, unknown>
    }
  }

  const frame = structuredClone(wsTemplate)
  frame.type = 'notification:new'
  frame.payload.id = opts.id
  frame.payload.notificationType = opts.notificationType
  frame.payload.recipientId = opts.recipientId
  frame.payload.actorId = opts.actorId
  frame.payload.actorName = opts.actorName
  frame.payload.actorRole = opts.actorRole
  frame.payload.category = 'order'
  frame.payload.excerpt = opts.excerpt
  frame.payload.isRead = false
  frame.payload.createdAt = opts.createdAt
  frame.payload.updatedAt = opts.createdAt
  frame.payload.metadata = {
    orderId: opts.orderId,
    orderShortCode: opts.orderShortCode,
    recentActors:
      opts.actorId && opts.actorName && opts.actorRole
        ? [{ id: opts.actorId, name: opts.actorName, role: opts.actorRole }]
        : [],
    status: opts.status,
    targetPath: `/orders/${opts.orderId}`,
    totalVnd: opts.totalVnd,
  }

  assertMatchesContractShape(
    frame,
    wsTemplate,
    'ws(notification:new)',
    notificationSnapshots.nullable
  )
  return frame
}

function relativeWindow(offsetStartMin: number, offsetEndMin: number): {
  startsAt: string
  endsAt: string
} {
  const now = Date.now()
  return {
    startsAt: new Date(now + offsetStartMin * 60_000).toISOString(),
    endsAt: new Date(now + offsetEndMin * 60_000).toISOString(),
  }
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const PHONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <rect width="400" height="400" rx="28" fill="#F8FAFC"/>
  <rect x="116" y="42" width="168" height="316" rx="26" fill="#0F172A"/>
  <rect x="124" y="52" width="152" height="296" rx="20" fill="#1E293B"/>
  <rect x="172" y="64" width="56" height="10" rx="5" fill="#0F172A"/>
  <circle cx="200" cy="204" r="44" fill="#334155"/>
  <text x="200" y="210" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="#F8FAFC">AURA</text>
</svg>`

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

const CUSTOMER_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'buyer@auraphone.vn',
  role: 'customer',
  displayName: 'Nguyễn Minh Anh',
  phone: '0987654321',
  avatarUrl: null,
  createdAt: '2026-11-01T08:00:00Z',
}

const ADMIN_USER = {
  id: '99999999-9999-9999-9999-999999999999',
  email: 'admin@auraphone.vn',
  role: 'admin',
  displayName: 'Quản trị viên AuraPhone',
  phone: '0900000001',
  avatarUrl: null,
  createdAt: '2026-11-01T08:00:00Z',
}

const CATEGORIES = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Điện thoại', productCount: 4 },
  { id: '11111111-1111-1111-1111-111111111112', name: 'Phụ kiện', productCount: 2 },
]

const PRODUCT_IDS = {
  iphone16Pro: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  galaxyS25: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  xiaomi15: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  oppoFindX8: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
}

const VARIANT_IDS = {
  iphone256: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  iphone512: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  galaxy256: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
  xiaomi256: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
  oppo256: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5',
}

const ADDRESS_HN = {
  id: '22222222-2222-2222-2222-222222222222',
  userId: CUSTOMER_USER.id,
  recipientName: 'Nguyễn Minh Anh',
  phone: '0987654321',
  provinceCode: 1,
  provinceName: 'Thành phố Hà Nội',
  wardCode: 101,
  wardName: 'Phường Tràng Tiền',
  detailAddress: '123 Cầu Giấy',
  isDefault: true,
  createdAt: TS,
  updatedAt: TS,
}

const ADDRESS_DN = {
  id: '22222222-2222-2222-2222-222222222223',
  userId: CUSTOMER_USER.id,
  recipientName: 'Nguyễn Minh Anh',
  phone: '0987654321',
  provinceCode: 48,
  provinceName: 'Thành phố Đà Nẵng',
  wardCode: 4801,
  wardName: 'Phường Hải Châu I',
  detailAddress: '45 Bạch Đằng',
  isDefault: false,
  createdAt: TS,
  updatedAt: TS,
}

async function mountMediaFixtures(page: Page): Promise<void> {
  const fulfillSvg = async (route: Parameters<Page['route']>[1] extends (r: infer R) => unknown ? R : never) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: PHONE_SVG,
    })
  }
  await page.route(/\/media\/products\//, fulfillSvg)
  await page.route(/^https:\/\/example\.com\//, fulfillSvg)
}

async function seedAuthToken(page: Page, user: typeof CUSTOMER_USER | typeof ADMIN_USER, token: string): Promise<void> {
  await page.addInitScript(
    ({ u, t }) => {
      localStorage.setItem('accessToken', t)
      localStorage.setItem('authUser', JSON.stringify(u))
    },
    { u: user, t: token }
  )
}

function buildCatalogSummaries() {
  return [
    {
      averageRating: 4.8,
      brand: 'Apple',
      category: { id: CATEGORIES[0].id, name: 'Điện thoại' },
      currency: 'VND',
      id: PRODUCT_IDS.iphone16Pro,
      inStock: true,
      maxPriceVnd: '34990000',
      minPriceVnd: '28990000',
      model: 'A3294',
      name: 'iPhone 16 Pro',
      price: '28990000',
      primaryImageUrl: '/media/products/iphone-16-pro.webp',
      reviewCount: 34,
      soldCount: 120,
    },
    {
      averageRating: 4.9,
      brand: 'Samsung',
      category: { id: CATEGORIES[0].id, name: 'Điện thoại' },
      currency: 'VND',
      id: PRODUCT_IDS.galaxyS25,
      inStock: true,
      maxPriceVnd: '24990000',
      minPriceVnd: '21990000',
      model: 'SM-S931B',
      name: 'Samsung Galaxy S25 Đặc Biệt',
      price: '21990000',
      primaryImageUrl: '/media/products/galaxy-s25.webp',
      reviewCount: 18,
      soldCount: 210,
    },
    {
      averageRating: 4.6,
      brand: 'Xiaomi',
      category: { id: CATEGORIES[0].id, name: 'Điện thoại' },
      currency: 'VND',
      id: PRODUCT_IDS.xiaomi15,
      inStock: true,
      maxPriceVnd: '20990000',
      minPriceVnd: '18990000',
      model: '24129PN74G',
      name: 'Xiaomi 15',
      price: '18990000',
      primaryImageUrl: '/media/products/xiaomi-15.webp',
      reviewCount: 25,
      soldCount: 95,
    },
    {
      averageRating: 4.5,
      brand: 'OPPO',
      category: { id: CATEGORIES[0].id, name: 'Điện thoại' },
      currency: 'VND',
      id: PRODUCT_IDS.oppoFindX8,
      inStock: true,
      maxPriceVnd: '22990000',
      minPriceVnd: '22990000',
      model: 'CPH2651',
      name: 'OPPO Find X8 Pro',
      price: '22990000',
      primaryImageUrl: '/media/products/oppo-x8.webp',
      reviewCount: 12,
      soldCount: 64,
    },
  ]
}

function buildProductDetails(endsAtIso: string): Record<string, Record<string, unknown>> {
  const baseDetail = cloneSnapshotBody('product_detail_200').data as Record<string, unknown>

  const iphone = structuredClone(baseDetail)
  iphone.specs = [
    {
      group: 'Màn hình',
      items: [
        { label: 'Kích thước & Tấm nền', value: '6.3 inch, LTPO Super Retina XDR OLED, 120Hz' },
        { label: 'Tần số quét', value: '120Hz' },
      ],
    },
    {
      group: 'Hiệu năng & Chipset',
      items: [{ label: 'Chipset', value: 'Apple A18 Pro' }],
    },
  ]
  ;(iphone.variants as Array<Record<string, unknown>>)[0].flashSale = {
    campaignName: 'Flash Sale Giờ Vàng',
    endsAt: endsAtIso,
    flashPriceVnd: '25990000',
    flashSaleId: 'cccccccc-cccc-cccc-cccc-ccccccccccc1',
    quota: 20,
    soldQuantity: 12,
  }

  const galaxy = structuredClone(baseDetail)
  galaxy.id = PRODUCT_IDS.galaxyS25
  galaxy.name = 'Samsung Galaxy S25 Đặc Biệt'
  galaxy.brand = 'Samsung'
  galaxy.model = 'SM-S931B'
  galaxy.averageRating = 4.9
  galaxy.reviewCount = 18
  galaxy.soldCount = 210
  galaxy.imageUrls = ['/media/products/galaxy-s25.webp']
  galaxy.description = 'Snapdragon 8 Elite tối ưu AI thế hệ mới.'
  galaxy.specs = [
    {
      group: 'Màn hình',
      items: [
        { label: 'Kích thước & Tấm nền', value: '6.2 inch, Dynamic AMOLED 2X, 120Hz' },
        { label: 'Tần số quét', value: '120Hz' },
      ],
    },
    { group: 'Hiệu năng & Chipset', items: [{ label: 'Chipset', value: 'Snapdragon 8 Elite for Galaxy' }] },
  ]
  galaxy.variants = [
    {
      active: true,
      flashSale: null,
      id: VARIANT_IDS.galaxy256,
      livePriceVnd: null,
      liveRemaining: null,
      optionValueIds: { 'grp-storage-1': 'val-256' },
      priceVnd: '21990000',
      stockQuantity: 14,
    },
    {
      active: true,
      flashSale: null,
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb32',
      livePriceVnd: null,
      liveRemaining: null,
      optionValueIds: { 'grp-storage-1': 'val-512' },
      priceVnd: '24990000',
      stockQuantity: 6,
    },
  ]

  const xiaomi = structuredClone(baseDetail)
  xiaomi.id = PRODUCT_IDS.xiaomi15
  xiaomi.name = 'Xiaomi 15'
  xiaomi.brand = 'Xiaomi'
  xiaomi.model = '24129PN74G'
  xiaomi.averageRating = 4.6
  xiaomi.reviewCount = 25
  xiaomi.soldCount = 95
  xiaomi.imageUrls = ['/media/products/xiaomi-15.webp']
  xiaomi.description = 'Camera Leica Summilux gọn nhẹ hiệu năng cao.'
  xiaomi.specs = [
    {
      group: 'Màn hình',
      items: [
        { label: 'Kích thước & Tấm nền', value: '6.36 inch, LTPO AMOLED, 120Hz' },
        { label: 'Tần số quét', value: '120Hz' },
      ],
    },
    { group: 'Hiệu năng & Chipset', items: [{ label: 'Chipset', value: 'Snapdragon 8 Elite' }] },
  ]
  xiaomi.variants = [
    {
      active: true,
      flashSale: null,
      id: VARIANT_IDS.xiaomi256,
      livePriceVnd: null,
      liveRemaining: null,
      optionValueIds: { 'grp-storage-1': 'val-256' },
      priceVnd: '18990000',
      stockQuantity: 8,
    },
    {
      active: true,
      flashSale: null,
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb42',
      livePriceVnd: null,
      liveRemaining: null,
      optionValueIds: { 'grp-storage-1': 'val-512' },
      priceVnd: '20990000',
      stockQuantity: 4,
    },
  ]

  const oppo = structuredClone(baseDetail)
  oppo.id = PRODUCT_IDS.oppoFindX8
  oppo.name = 'OPPO Find X8 Pro'
  oppo.brand = 'OPPO'
  oppo.model = 'CPH2651'
  oppo.averageRating = 4.5
  oppo.reviewCount = 12
  oppo.soldCount = 64
  oppo.imageUrls = ['/media/products/oppo-x8.webp']
  oppo.variants = [
    {
      active: true,
      flashSale: null,
      id: VARIANT_IDS.oppo256,
      livePriceVnd: null,
      liveRemaining: null,
      optionValueIds: { 'grp-storage-1': 'val-256' },
      priceVnd: '22990000',
      stockQuantity: 7,
    },
  ]

  return {
    [PRODUCT_IDS.iphone16Pro]: iphone,
    [PRODUCT_IDS.galaxyS25]: galaxy,
    [PRODUCT_IDS.xiaomi15]: xiaomi,
    [PRODUCT_IDS.oppoFindX8]: oppo,
  }
}

function buildFlashSaleCurrentPayload(startsAt: string, endsAt: string) {
  const body = cloneSnapshotBody('flash_sales_current_200')
  const data = body.data as Record<string, unknown>
  data.startsAt = startsAt
  data.endsAt = endsAt
  return body
}

function createCommonStorefrontStubs(): ContractRoute[] {
  return [
    { method: 'GET', path: '/api/v1/auth/me', stub: { status: 200, body: envelope('OK', CUSTOMER_USER) } },
    { method: 'GET', path: '/api/v1/categories', stub: { status: 200, body: envelope('OK', CATEGORIES) } },
    {
      method: 'GET',
      path: '/api/v1/brands',
      stub: { status: 200, body: envelope('OK', ['Apple', 'Samsung', 'Xiaomi', 'OPPO']) },
    },
    { method: 'GET', path: '/api/v1/live/current', stub: { status: 200, body: envelope('OK', null) } },
    { method: 'GET', path: '/api/v1/favorites', stub: { status: 200, body: envelope('OK', []) } },
    {
      method: 'GET',
      path: '/api/v1/notifications',
      stub: {
        status: 200,
        body: envelope('OK', { items: [], unreadCount: 0 }, {
          pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
        }),
      },
    },
    {
      method: 'GET',
      path: '/api/v1/chat/conversation',
      stub: {
        status: 200,
        body: envelope('OK', {
          id: 'conv-1',
          customerId: CUSTOMER_USER.id,
          unreadCount: 0,
          isOnline: true,
          lastMessage: null,
          updatedAt: TS,
        }),
      },
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/products\/[^/]+\/reviews$/,
      stub: {
        status: 200,
        body: envelope('OK', [], {
          pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
        }),
      },
    },
  ]
}

test.describe('Commerce Platform Enhancements — Mode 2 E2E', () => {
  test('S1: Keyboard search autocomplete, URL filter/sort sync, CompareTray + ChatWidget non-overlap, ComparePage', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await seedAuthToken(page, CUSTOMER_USER, 'mock-customer-jwt')
    await mountMediaFixtures(page)
    await page.routeWebSocket(/\/api\/v1\/chat\/ws/, () => {})

    const win = relativeWindow(-60, 180)
    const catalog = buildCatalogSummaries()
    const detailsMap = buildProductDetails(win.endsAt)
    const cartState = cloneSnapshotBody('cart_flash_sale_200')
    let addCartCalled = false

    await mountContractRoutes(page, snapshots, [
      ...createCommonStorefrontStubs(),
      {
        method: 'GET',
        path: '/api/v1/flash-sales/current',
        handle: () => ({
          snapshot: 'flash_sales_current_200',
          body: buildFlashSaleCurrentPayload(win.startsAt, win.endsAt),
        }),
      },
      {
        method: 'GET',
        path: '/api/v1/products/featured',
        handle: () => {
          const body = cloneSnapshotBody('products_featured_200')
          body.data = catalog.slice(0, 2)
          return { snapshot: 'products_featured_200', body }
        },
      },
      {
        method: 'GET',
        path: '/api/v1/products',
        handle: ({ url }) => {
          const q = (url.searchParams.get('q') || '').trim().toLowerCase()
          const brand = (url.searchParams.get('brand') || '').trim()
          const minRating = Number(
            url.searchParams.get('min_rating') || url.searchParams.get('minRating') || '0'
          )
          const sort = url.searchParams.get('sort') || ''
          const limit = Number(url.searchParams.get('limit') || '6') || 6

          let items = catalog.filter((item) => {
            if (q && !item.name.toLowerCase().includes(q) && !item.brand.toLowerCase().includes(q)) {
              return false
            }
            if (brand && item.brand !== brand) return false
            if (minRating > 0 && item.averageRating < minRating) return false
            return true
          })

          if (sort === 'price_desc') {
            items = [...items].sort((a, b) => Number(b.minPriceVnd) - Number(a.minPriceVnd))
          } else if (sort === 'price_asc') {
            items = [...items].sort((a, b) => Number(a.minPriceVnd) - Number(b.minPriceVnd))
          } else if (sort === 'bestselling') {
            items = [...items].sort((a, b) => b.soldCount - a.soldCount)
          } else if (sort === 'rating_desc') {
            items = [...items].sort((a, b) => b.averageRating - a.averageRating)
          }

          const sliced = items.slice(0, limit)
          const body = cloneSnapshotBody('products_list_200')
          body.data = sliced
          ;(body.meta as Record<string, unknown>).pagination = {
            page: 1,
            limit,
            total: items.length,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          }
          return { snapshot: 'products_list_200', body }
        },
      },
      {
        method: 'GET',
        path: /^\/api\/v1\/products\/[^/]+$/,
        handle: ({ url }) => {
          const id = url.pathname.split('/').pop() || PRODUCT_IDS.iphone16Pro
          const body = cloneSnapshotBody('product_detail_200')
          body.data = structuredClone(detailsMap[id] ?? detailsMap[PRODUCT_IDS.iphone16Pro])
          return { snapshot: 'product_detail_200', body }
        },
      },
      {
        method: 'GET',
        path: '/api/v1/cart',
        handle: () => ({ snapshot: 'cart_flash_sale_200', body: structuredClone(cartState) }),
      },
      {
        method: 'POST',
        path: '/api/v1/cart/items',
        auth: 'bearer',
        handle: () => {
          addCartCalled = true
          return { snapshot: 'cart_flash_sale_200', body: structuredClone(cartState) }
        },
      },
    ])

    const storefront = new StorefrontEnhancementsPage(page)
    await storefront.openHome()
    await assertLayoutInvariants(page, 'S1 home desktop')

    // Keyboard autocomplete search on Header (ArrowDown, ArrowUp, Escape, Enter)
    await storefront.headerSearchInput.click()
    await storefront.headerSearchInput.fill('Pro')
    await expect(storefront.searchListbox).toBeVisible()
    await expect(storefront.searchListbox.getByText('iPhone 16 Pro')).toBeVisible()
    await expect(storefront.searchListbox.getByText('OPPO Find X8 Pro')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(storefront.searchListbox.locator('[role="option"]').first()).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await page.keyboard.press('Escape')
    await expect(storefront.searchListbox).toBeHidden()

    // Keyboard ArrowDown re-opens, ArrowDown/ArrowUp move selection, Enter opens selected product directly
    await page.keyboard.press('ArrowDown')
    await expect(storefront.searchListbox).toBeVisible()
    await expect(storefront.searchListbox.locator('[role="option"]').first()).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await page.keyboard.press('ArrowDown')
    await expect(storefront.searchListbox.locator('[role="option"]').nth(1)).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await page.keyboard.press('ArrowUp')
    await expect(storefront.searchListbox.locator('[role="option"]').first()).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/products/${PRODUCT_IDS.iphone16Pro}`))

    // Re-type to open autocomplete suggestions and click "Xem tất cả kết quả"
    await storefront.headerSearchInput.fill('Samsung')
    await expect(storefront.searchListbox).toBeVisible()
    await storefront.searchListbox.getByRole('link', { name: /Xem tất cả kết quả cho/i }).click()
    await expect(page).toHaveURL(/\/products\?q=Samsung/)

    // Clear search and test two-way URL filter & sort sync on desktop & mobile
    await storefront.openCatalog('')
    await page.getByRole('button', { name: 'Từ 4 sao' }).click()
    await expect(page).toHaveURL(/min_rating=4/)
    await expect(page.getByRole('button', { name: 'Từ 4 sao' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('desktop-sort-select').selectOption('price_desc')
    await expect(page).toHaveURL(/min_rating=4/)
    await expect(page).toHaveURL(/sort=price_desc/)

    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: 'Từ 4 sao' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('desktop-sort-select')).toHaveValue('price_desc')
    await expect(page.getByText('Đã bán 120')).toBeVisible()

    // Pin 3 phones and check 4th triggers limit toast & banner without covering CompareTray
    await storefront.compareToggleFor('iPhone 16 Pro').click()
    await storefront.compareToggleFor('Samsung Galaxy S25 Đặc Biệt').click()
    await storefront.compareToggleFor('Xiaomi 15').click()
    await expect(storefront.compareTray).toBeVisible()
    await expect(storefront.compareTray).toContainText('Đã chọn 3/3')

    await storefront.compareToggleFor('OPPO Find X8 Pro').click()
    await expect(storefront.compareTray).toContainText('Đã chọn 3/3')
    await expect(page.getByText(/tối đa 3 sản phẩm/i).first()).toBeVisible()

    // Verify ChatWidget floating button does not overlap CompareTray "So sánh ngay" on desktop
    await page.evaluate(() => window.scrollTo(0, 0))
    await storefront.assertChatAndCompareNoOverlap('S1 desktop compare tray vs chat')
    await assertLayoutInvariants(page, 'S1 catalog desktop with tray')
    await page.screenshot({
      path: screenshotPath('02-catalog-compare-tray-desktop.png'),
      animations: 'disabled',
    })

    // Switch to mobile 375x812: verify mobile sort URL sync, non-overlap, and zero overflow
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(page.getByTestId('mobile-sort-select')).toHaveValue('price_desc')
    await page.getByTestId('mobile-sort-select').selectOption('bestselling')
    await expect(page).toHaveURL(/sort=bestselling/)
    await page.evaluate(() => window.scrollTo(0, 0))
    await storefront.assertChatAndCompareNoOverlap('S1 mobile compare tray vs chat')
    await assertLayoutInvariants(page, 'S1 catalog mobile with tray')
    await page.screenshot({
      path: screenshotPath('09-catalog-compare-tray-mobile.png'),
      animations: 'disabled',
    })

    // Return to desktop 1440x900 and navigate to /compare
    await page.setViewportSize({ width: 1440, height: 900 })
    await storefront.compareNowLink.click()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/compare\?ids=/)

    const diffToggle = page.getByLabel('Chỉ hiện điểm khác biệt')
    await expect(diffToggle).toBeVisible()
    await expect(page.getByText('Tần số quét')).toBeVisible()
    await diffToggle.check()
    await expect(diffToggle).toBeChecked()
    await expect(page.getByText('Tần số quét')).toBeHidden()
    await expect(page.getByText('Kích thước & Tấm nền')).toBeVisible()
    await diffToggle.uncheck()
    await expect(page.getByText('Tần số quét')).toBeVisible()

    // Switch variant on column 0 (iPhone 16 Pro 256GB -> 512GB) and add to cart
    const iphoneSelect = page.getByLabel('Phiên bản iPhone 16 Pro')
    await iphoneSelect.selectOption(VARIANT_IDS.iphone512)
    await expect(page.getByText('34.990.000 ₫').first()).toBeVisible()
    await page.getByRole('button', { name: 'Thêm vào giỏ' }).first().click()
    await expect.poll(() => addCartCalled).toBe(true)

    await dismissActiveToasts(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await assertLayoutInvariants(page, 'S1 compare desktop')
    await page.screenshot({
      path: screenshotPath('03-compare-page-desktop.png'),
      fullPage: true,
      animations: 'disabled',
    })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await assertLayoutInvariants(page, 'S1 compare mobile')
    await page.screenshot({
      path: screenshotPath('10-compare-page-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    })
  })

  test('S2: Flash Sale countdown + Đã bán X/Y + PDP variant/specs on desktop & mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mountMediaFixtures(page)

    const win = relativeWindow(-60, 180)
    const catalog = buildCatalogSummaries()
    const detailsMap = buildProductDetails(win.endsAt)

    await mountContractRoutes(page, snapshots, [
      ...createCommonStorefrontStubs(),
      {
        method: 'GET',
        path: '/api/v1/flash-sales/current',
        handle: () => ({
          snapshot: 'flash_sales_current_200',
          body: buildFlashSaleCurrentPayload(win.startsAt, win.endsAt),
        }),
      },
      {
        method: 'GET',
        path: '/api/v1/products/featured',
        handle: () => {
          const body = cloneSnapshotBody('products_featured_200')
          body.data = catalog.slice(0, 2)
          return { snapshot: 'products_featured_200', body }
        },
      },
      {
        method: 'GET',
        path: '/api/v1/products',
        handle: () => {
          const body = cloneSnapshotBody('products_list_200')
          body.data = catalog.slice(0, 2)
          return { snapshot: 'products_list_200', body }
        },
      },
      {
        method: 'GET',
        path: /^\/api\/v1\/products\/[^/]+$/,
        handle: () => {
          const body = cloneSnapshotBody('product_detail_200')
          body.data = structuredClone(detailsMap[PRODUCT_IDS.iphone16Pro])
          return { snapshot: 'product_detail_200', body }
        },
      },
    ])

    const storefront = new StorefrontEnhancementsPage(page)
    await storefront.openHome()
    await expect(storefront.flashSaleSection).toBeVisible()
    await expect(page.getByTestId('flash-sale-countdown')).toBeVisible()
    await expect(storefront.flashSaleSection).toContainText('Đã bán 12/20')
    await expect(storefront.flashSaleSection).toContainText('25.990.000 ₫')

    await assertLayoutInvariants(page, 'S2 home flash sale desktop')
    await scrollLocatorBelowHeader(page, storefront.flashSaleSection, 164)
    await page.screenshot({
      path: screenshotPath('01-home-flash-sale-desktop.png'),
      animations: 'disabled',
    })

    await page.setViewportSize({ width: 375, height: 812 })
    await scrollLocatorBelowHeader(page, storefront.flashSaleSection, 84)
    await assertLayoutInvariants(page, 'S2 home flash sale mobile')
    await page.screenshot({
      path: screenshotPath('08-home-flash-sale-mobile.png'),
      animations: 'disabled',
    })

    // Navigate to Product Detail Page on desktop
    await page.setViewportSize({ width: 1440, height: 900 })
    await storefront.openProductDetail(PRODUCT_IDS.iphone16Pro)
    await expect(page.getByTestId('pdp-flash-sale-box')).toBeVisible()
    await expect(page.getByTestId('pdp-flash-sale-countdown')).toBeVisible()
    await expect(page.getByTestId('pdp-regular-price')).toContainText('28.990.000 ₫')
    await expect(page.getByTestId('pdp-flash-sale-box')).toContainText('Đã bán 12/20')

    // Structured specs rendered cleanly
    await expect(page.getByText('6.3 inch, LTPO Super Retina XDR OLED, 120Hz')).toBeVisible()
    await expect(page.getByText('Apple A18 Pro')).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, 0))
    await assertLayoutInvariants(page, 'S2 PDP flash sale desktop')
    await page.screenshot({
      path: screenshotPath('04-product-detail-flash-sale-desktop.png'),
      fullPage: true,
      animations: 'disabled',
    })

    // Switch from 256GB (Flash Sale) to 512GB (no Flash Sale)
    await page.getByRole('button', { name: '512GB' }).click()
    await expect(page.getByTestId('pdp-flash-sale-box')).toBeHidden()
    await expect(page.getByText('34.990.000 ₫').first()).toBeVisible()
  })

  test('S3: Password recovery flow /login -> /forgot-password -> /reset-password -> /login', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mountMediaFixtures(page)

    await mountContractRoutes(page, snapshots, [
      ...createCommonStorefrontStubs(),
      {
        method: 'POST',
        path: '/api/v1/auth/forgot-password',
        requestSnapshot: 'auth_forgot_password_200',
        handle: () => ({ snapshot: 'auth_forgot_password_200' }),
      },
      {
        method: 'POST',
        path: '/api/v1/auth/reset-password',
        requestSnapshot: 'auth_reset_password_200',
        handle: ({ body }) => {
          const payload = (body ?? {}) as { otp?: string }
          if (payload.otp === '000000') {
            return { snapshot: 'auth_reset_password_invalid_otp_400' }
          }
          return { snapshot: 'auth_reset_password_200' }
        },
      },
    ])

    const storefront = new StorefrontEnhancementsPage(page)
    await storefront.openLogin()
    await page.getByRole('link', { name: 'Quên mật khẩu?' }).click()
    await expect(page).toHaveURL(/\/forgot-password/)

    await page.locator('#forgot-email').fill('recovery@example.com')
    await page.getByRole('button', { name: 'Gửi mã xác thực' }).click()
    await expect(page).toHaveURL(/\/reset-password/)

    await expect(page.locator('#reset-email')).toHaveValue('recovery@example.com')
    await expect(page.getByRole('button', { name: /Gửi lại mã/i })).toBeDisabled()

    // Invalid OTP first -> displays server Vietnamese error
    await page.locator('#reset-otp').fill('000000')
    await page.locator('#reset-new-password').fill('NewPassword123@')
    await page.locator('#reset-confirm-password').fill('NewPassword123@')
    await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click()
    await expect(page.locator('div[role="alert"]')).toContainText(
      'Mã xác thực không chính xác hoặc đã hết hạn'
    )

    await assertLayoutInvariants(page, 'S3 reset password desktop')
    await page.screenshot({
      path: screenshotPath('07-reset-password-desktop.png'),
    })

    // Valid OTP -> redirects to /login with reset success banner
    await page.locator('#reset-otp').fill('025431')
    await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('status')).toContainText(
      'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.'
    )
  })

  test('S4: Checkout Express 2h vs disabled province, vouchers quote, realtime WS OrderDetail & Buy Again', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await seedAuthToken(page, CUSTOMER_USER, 'mock-customer-jwt')
    await mountMediaFixtures(page)

    let sockets: WebSocketRoute[] = []
    await page.routeWebSocket(/\/api\/v1\/chat\/ws/, (ws) => {
      sockets.push(ws)
      ws.onMessage(() => {})
      ws.onClose(() => {
        sockets = sockets.filter((s) => s !== ws)
      })
    })

    const win = relativeWindow(-60, 1440)
    const orderId = '44444444-4444-4444-4444-444444444444'
    let currentOrder = cloneSnapshotBody('order_detail_timeline_200')
    const buyAgainCart = cloneSnapshotBody('cart_flash_sale_200')
    let boughtAgain = false

    await mountContractRoutes(page, snapshots, [
      ...createCommonStorefrontStubs(),
      {
        method: 'GET',
        path: '/api/v1/addresses',
        stub: { status: 200, body: envelope('OK', [ADDRESS_HN, ADDRESS_DN]) },
      },
      {
        method: 'GET',
        path: '/api/v1/provinces',
        stub: {
          status: 200,
          body: envelope('OK', [
            { code: 1, name: 'Thành phố Hà Nội' },
            { code: 48, name: 'Thành phố Đà Nẵng' },
          ]),
        },
      },
      {
        method: 'GET',
        path: '/api/v1/cart',
        handle: () => {
          const body = cloneSnapshotBody('cart_flash_sale_200')
          const data = body.data as {
            items: Array<Record<string, unknown>>
            selectedTotalVnd: string
            totalUnits: number
          }
          data.items[0].imageUrl = '/media/products/iphone-16-pro.webp'
          data.items[0].productName = 'iPhone 16 Pro'
          if (!boughtAgain) {
            data.items[0].quantity = 1
            data.items[0].unitPriceVnd = '28990000'
            data.items[0].lineTotalVnd = '28990000'
            data.items[0].isFlashSalePrice = false
            data.selectedTotalVnd = '28990000'
            data.totalUnits = 1
          }
          return { snapshot: 'cart_flash_sale_200', body }
        },
      },
      {
        method: 'GET',
        path: '/api/v1/vouchers/available',
        handle: () => {
          const body = cloneSnapshotBody('vouchers_available_200')
          for (const v of body.data as Array<Record<string, unknown>>) {
            v.startsAt = win.startsAt
            v.endsAt = win.endsAt
          }
          return { snapshot: 'vouchers_available_200', body }
        },
      },
      {
        method: 'POST',
        path: '/api/v1/checkout/quote',
        requestSnapshot: 'checkout_quote_200',
        handle: ({ body }) => {
          const req = (body ?? {}) as {
            addressId?: string
            deliveryMethod?: string
            voucherCode?: string
          }
          if (req.voucherCode === 'BADCODE') {
            return { snapshot: 'checkout_quote_voucher_not_found_404' }
          }
          const isExpressAvailable = req.addressId === ADDRESS_HN.id
          if (req.voucherCode === 'AURA10') {
            const reply = cloneSnapshotBody('checkout_quote_200')
            const data = reply.data as Record<string, unknown>
            data.expressAvailable = isExpressAvailable
            data.deliveryMethod = isExpressAvailable && req.deliveryMethod === 'express_2h' ? 'express_2h' : 'standard'
            data.shippingFeeVnd = data.deliveryMethod === 'express_2h' ? '60000' : '0'
            data.totalVnd = data.deliveryMethod === 'express_2h' ? '28050000' : '27990000'
            return { snapshot: 'checkout_quote_200', body: reply }
          }
          const reply = cloneSnapshotBody('checkout_quote_no_voucher_200')
          const data = reply.data as Record<string, unknown>
          data.expressAvailable = isExpressAvailable
          data.deliveryMethod = isExpressAvailable && req.deliveryMethod === 'express_2h' ? 'express_2h' : 'standard'
          data.shippingFeeVnd = data.deliveryMethod === 'express_2h' ? '60000' : '0'
          data.totalVnd = data.deliveryMethod === 'express_2h' ? '29050000' : '28990000'
          return { snapshot: 'checkout_quote_no_voucher_200', body: reply }
        },
      },
      {
        method: 'POST',
        path: '/api/v1/orders',
        auth: 'bearer',
        requestSnapshot: 'checkout_order_create_201',
        handle: () => {
          const reply = cloneSnapshotBody('checkout_order_create_201')
          ;(reply.data as Record<string, unknown>).id = orderId
          return { snapshot: 'checkout_order_create_201', body: reply }
        },
      },
      {
        method: 'GET',
        path: /^\/api\/v1\/orders\/[^/]+$/,
        auth: 'bearer',
        handle: () => ({
          snapshot: 'order_detail_timeline_200',
          body: structuredClone(currentOrder),
        }),
      },
      {
        method: 'POST',
        path: /^\/api\/v1\/orders\/[^/]+\/buy-again$/,
        auth: 'bearer',
        handle: () => {
          boughtAgain = true
          const reply = cloneSnapshotBody('order_buy_again_200')
          const cartData = (buyAgainCart as { data: Record<string, unknown> }).data
          ;(cartData.items as Array<Record<string, unknown>>)[0].imageUrl =
            '/media/products/iphone-16-pro.webp'
          ;(cartData.items as Array<Record<string, unknown>>)[0].productName = 'iPhone 16 Pro'
          ;(reply.data as { cart: Record<string, unknown> }).cart = structuredClone(cartData)
          return { snapshot: 'order_buy_again_200', body: reply }
        },
      },
    ])

    const storefront = new StorefrontEnhancementsPage(page)
    await storefront.openCheckout()

    // HN opens Express 2h
    const expressRadio = page.locator('#delivery-express-2h')
    await expect(expressRadio).toBeEnabled()
    await expressRadio.click()
    await expect(expressRadio).toBeChecked()

    // Switching to Da Nang disables Express 2h and resets to Standard
    await page.getByText('45 Bạch Đằng').click()
    await expect(expressRadio).toBeDisabled()
    await expect(page.locator('#delivery-standard')).toBeChecked()

    // Switch back to HN and select Express 2h again
    await page.getByText('123 Cầu Giấy').click()
    await expect(expressRadio).toBeEnabled()
    await expressRadio.click()

    // Manual invalid voucher -> error banner
    await page.locator('#voucher-code-input').fill('BADCODE')
    await page.getByRole('button', { name: 'Áp dụng' }).click()
    await expect(page.locator('p[role="alert"]')).toContainText('Mã giảm giá không tồn tại')

    // Quick-pick voucher AURA10 -> applies quote
    await page.getByTestId('apply-voucher-AURA10').click()
    await expect(page.getByRole('button', { name: 'Gỡ mã' })).toBeVisible()
    await expect(page.getByText('-1.000.000 ₫')).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, 0))
    await assertLayoutInvariants(page, 'S4 checkout desktop')
    await page.screenshot({
      path: screenshotPath('05-checkout-express-voucher-desktop.png'),
      fullPage: true,
      animations: 'disabled',
    })

    await page.getByRole('button', { name: /Đặt hàng/i }).click()
    await expect(page).toHaveURL(new RegExp(`/orders/${orderId}`))
    await page.waitForLoadState('networkidle')

    // Verify OrderStepper & OrderTimeline + Copy Tracking Code
    await expect(page.locator('section[aria-label="Tiến trình đơn hàng"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Hành trình đơn hàng' })).toBeVisible()
    await expect(page.getByText('AHA-20261118', { exact: true })).toBeVisible()

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.getByRole('button', { name: 'Sao chép mã vận đơn' }).click()
    await expect(page.getByText('Đã chép')).toBeVisible()

    // Push realtime WebSocket notification -> upgrades order to delivered without page reload
    const orderData = currentOrder.data as Record<string, unknown>
    orderData.status = 'delivered'
    orderData.timeline = [
      ...(orderData.timeline as Array<Record<string, unknown>>),
      {
        actorType: 'admin',
        createdAt: '2026-11-18T12:30:00Z',
        id: 'evt-5',
        note: 'Giao hàng thành công đến người nhận',
        status: 'delivered',
      },
    ]

    await expect.poll(() => sockets.length).toBeGreaterThan(0)
    const customerWsPayload = JSON.stringify(
      buildValidatedOrderNotificationFrame({
        id: 'notif-order-delivered',
        notificationType: 'order_delivered',
        recipientId: CUSTOMER_USER.id,
        actorId: ADMIN_USER.id,
        actorName: 'AuraPhone',
        actorRole: 'admin',
        orderId,
        orderShortCode: '#44444444',
        status: 'delivered',
        excerpt: 'Đơn hàng đã được giao đến bạn.',
        totalVnd: '28050000',
        createdAt: '2026-11-18T12:30:00Z',
      })
    )
    for (const ws of sockets) {
      try {
        ws.send(customerWsPayload)
      } catch {
        // Ignore sockets closed during client route transitions
      }
    }

    await expect(page.getByText('Giao hàng thành công đến người nhận')).toBeVisible()
    await expect(page.getByTestId('notification-unread-badge')).toContainText('1')
    await expect(page.getByRole('button', { name: /Mua lại/i })).toBeVisible()

    await dismissActiveToasts(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await assertLayoutInvariants(page, 'S4 order detail desktop')
    await page.screenshot({
      path: screenshotPath('06-order-detail-timeline-realtime-desktop.png'),
      fullPage: true,
      animations: 'disabled',
    })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await assertLayoutInvariants(page, 'S4 order detail mobile')
    await page.screenshot({
      path: screenshotPath('11-order-detail-timeline-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    })

    // Buy Again -> /cart with Flash Sale item
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: /Mua lại/i }).click()
    await expect(page).toHaveURL(/\/cart/)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Giá Flash Sale').first()).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))
    await assertLayoutInvariants(page, 'S4 cart buy again desktop')
    await page.screenshot({
      path: screenshotPath('16-cart-buy-again-desktop.png'),
      animations: 'disabled',
    })
  })

  test('S5: Admin Portal multi-image + specs preset, Voucher CRUD, Flash Sale CRUD, Ship modal + WS', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await seedAuthToken(page, ADMIN_USER, 'mock-admin-jwt')
    await mountMediaFixtures(page)

    let adminSockets: WebSocketRoute[] = []
    await page.routeWebSocket(/\/api\/v1\/chat\/ws/, (ws) => {
      adminSockets.push(ws)
      ws.onMessage(() => {})
      ws.onClose(() => {
        adminSockets = adminSockets.filter((s) => s !== ws)
      })
    })

    const win = relativeWindow(-60, 180)
    let uploadSeq = 0
    const adminProductsBody = cloneSnapshotBody('admin_products_list_200')
    for (const p of adminProductsBody.data as Array<Record<string, unknown>>) {
      p.primaryImageUrl = '/media/products/phone-admin.webp'
    }

    const vouchersBody = cloneSnapshotBody('admin_vouchers_list_200')
    let vouchersList = (vouchersBody.data as Array<Record<string, unknown>>).map((v) => ({
      ...v,
      startsAt: win.startsAt,
      endsAt: win.endsAt,
    }))

    const flashSalesBody = cloneSnapshotBody('admin_flash_sales_list_200')
    let flashSalesList = (flashSalesBody.data as Array<Record<string, unknown>>).map((fs) => ({
      ...fs,
      startsAt: win.startsAt,
      endsAt: win.endsAt,
    }))

    const adminOrderId = '22222222-2222-2222-2222-222222222222'
    const adminOrderState = cloneSnapshotBody('admin_order_ship_200')
    const adminOrderData = adminOrderState.data as Record<string, unknown>
    adminOrderData.status = 'preparing'
    adminOrderData.carrier = ''
    adminOrderData.trackingCode = ''
    adminOrderData.shippedAt = ''
    adminOrderData.timeline = (adminOrderData.timeline as Array<Record<string, unknown>>).slice(0, 2)
    ;(adminOrderData.items as Array<Record<string, unknown>>)[0].imageUrl =
      '/media/products/iphone-16-pro.webp'

    await mountContractRoutes(page, snapshots, [
      { method: 'GET', path: '/api/v1/auth/me', stub: { status: 200, body: envelope('OK', ADMIN_USER) } },
      { method: 'GET', path: '/api/v1/admin/categories', stub: { status: 200, body: envelope('OK', CATEGORIES) } },
      {
        method: 'GET',
        path: '/api/v1/notifications',
        stub: {
          status: 200,
          body: envelope('OK', { items: [], unreadCount: 0 }, {
            pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
          }),
        },
      },
      {
        method: 'GET',
        path: '/api/v1/admin/chat/conversations',
        stub: { status: 200, body: envelope('OK', []) },
      },
      {
        method: 'POST',
        path: '/api/v1/admin/products/images',
        auth: 'bearer',
        handle: () => {
          uploadSeq += 1
          const reply = cloneSnapshotBody('admin_product_image_upload_201')
          const data = reply.data as Record<string, unknown>
          const uuid = `97b918af-45cb-4d3f-8baa-e1e7ce505a3${uploadSeq}`
          data.key = `${uuid}.webp`
          data.url = `/media/products/${uuid}.webp`
          return { snapshot: 'admin_product_image_upload_201', body: reply }
        },
      },
      {
        method: 'POST',
        path: '/api/v1/admin/products',
        auth: 'bearer',
        requestSnapshot: 'admin_product_create_201',
        handle: () => ({ snapshot: 'admin_product_create_201' }),
      },
      {
        method: 'GET',
        path: '/api/v1/admin/products',
        auth: 'bearer',
        handle: () => ({ snapshot: 'admin_products_list_200', body: structuredClone(adminProductsBody) }),
      },
      {
        method: 'GET',
        path: /^\/api\/v1\/admin\/products\/[^/]+$/,
        auth: 'bearer',
        handle: () => ({ snapshot: 'admin_product_detail_200' }),
      },
      {
        method: 'GET',
        path: '/api/v1/admin/vouchers',
        auth: 'bearer',
        handle: () => {
          const body = cloneSnapshotBody('admin_vouchers_list_200')
          body.data = structuredClone(vouchersList)
          return { snapshot: 'admin_vouchers_list_200', body }
        },
      },
      {
        method: 'POST',
        path: '/api/v1/admin/vouchers',
        auth: 'bearer',
        requestSnapshot: 'admin_voucher_create_201',
        handle: ({ body }) => {
          const req = (body ?? {}) as Record<string, unknown>
          const created = cloneSnapshotBody('admin_voucher_create_201')
          const data = created.data as Record<string, unknown>
          data.id = 'dddddddd-dddd-dddd-dddd-dddddddddd99'
          data.code = String(req.code || 'NEWCODE').toUpperCase()
          data.title = String(req.title || 'Mã mới')
          data.startsAt = String(req.startsAt || win.startsAt)
          data.endsAt = String(req.endsAt || win.endsAt)
          vouchersList = [data, ...vouchersList]
          return { snapshot: 'admin_voucher_create_201', body: created }
        },
      },
      {
        method: 'PUT',
        path: /^\/api\/v1\/admin\/vouchers\/[^/]+$/,
        auth: 'bearer',
        requestSnapshot: 'admin_voucher_update_200',
        handle: ({ url, body }) => {
          const id = url.pathname.split('/').pop() || ''
          const req = (body ?? {}) as Record<string, unknown>
          const reply = cloneSnapshotBody('admin_voucher_update_200')
          const data = reply.data as Record<string, unknown>
          const existing = vouchersList.find((v) => v.id === id)
          Object.assign(data, existing ?? {}, {
            id,
            active: Boolean(req.active),
            title: String(req.title || data.title),
          })
          vouchersList = vouchersList.map((v) => (v.id === id ? data : v))
          return { snapshot: 'admin_voucher_update_200', body: reply }
        },
      },
      {
        method: 'DELETE',
        path: /^\/api\/v1\/admin\/vouchers\/[^/]+$/,
        auth: 'bearer',
        handle: ({ url }) => {
          const id = url.pathname.split('/').pop() || ''
          vouchersList = vouchersList.filter((v) => v.id !== id)
          return { snapshot: 'admin_voucher_delete_204' }
        },
      },
      {
        method: 'GET',
        path: '/api/v1/admin/flash-sales',
        auth: 'bearer',
        handle: () => {
          const body = cloneSnapshotBody('admin_flash_sales_list_200')
          body.data = structuredClone(flashSalesList)
          return { snapshot: 'admin_flash_sales_list_200', body }
        },
      },
      {
        method: 'GET',
        path: /^\/api\/v1\/admin\/flash-sales\/[^/]+$/,
        auth: 'bearer',
        handle: () => {
          const body = cloneSnapshotBody('admin_flash_sale_detail_200')
          const data = body.data as Record<string, unknown>
          data.startsAt = win.startsAt
          data.endsAt = win.endsAt
          return { snapshot: 'admin_flash_sale_detail_200', body }
        },
      },
      {
        method: 'POST',
        path: '/api/v1/admin/flash-sales',
        auth: 'bearer',
        requestSnapshot: 'admin_flash_sale_create_201',
        handle: ({ body }) => {
          const req = (body ?? {}) as Record<string, unknown>
          const reply = cloneSnapshotBody('admin_flash_sale_create_201')
          const data = reply.data as Record<string, unknown>
          data.id = 'cccccccc-cccc-cccc-cccc-cccccccccc99'
          data.name = String(req.name || 'Flash Sale Cuối Tuần')
          data.startsAt = String(req.startsAt || win.startsAt)
          data.endsAt = String(req.endsAt || win.endsAt)
          flashSalesList = [
            {
              active: true,
              createdAt: TS,
              endsAt: data.endsAt,
              id: data.id,
              name: data.name,
              startsAt: data.startsAt,
              status: 'scheduled',
              totalQuota: 20,
              totalSold: 0,
              updatedAt: TS,
              variantCount: 1,
            },
            ...flashSalesList,
          ]
          return { snapshot: 'admin_flash_sale_create_201', body: reply }
        },
      },
      {
        method: 'PUT',
        path: /^\/api\/v1\/admin\/flash-sales\/[^/]+$/,
        auth: 'bearer',
        requestSnapshot: 'admin_flash_sale_update_200',
        handle: ({ url, body }) => {
          const id = url.pathname.split('/').pop() || ''
          const req = (body ?? {}) as Record<string, unknown>
          const reply = cloneSnapshotBody('admin_flash_sale_update_200')
          const data = reply.data as Record<string, unknown>
          data.id = id
          data.name = String(req.name || 'Chiến dịch đã cập nhật')
          data.startsAt = String(req.startsAt || win.startsAt)
          data.endsAt = String(req.endsAt || win.endsAt)
          flashSalesList = flashSalesList.map((fs) =>
            fs.id === id ? { ...fs, name: data.name } : fs
          )
          return { snapshot: 'admin_flash_sale_update_200', body: reply }
        },
      },
      {
        method: 'DELETE',
        path: /^\/api\/v1\/admin\/flash-sales\/[^/]+$/,
        auth: 'bearer',
        handle: ({ url }) => {
          const id = url.pathname.split('/').pop() || ''
          flashSalesList = flashSalesList.filter((fs) => fs.id !== id)
          return { snapshot: 'admin_flash_sale_delete_204' }
        },
      },
      {
        method: 'GET',
        path: /^\/api\/v1\/admin\/orders\/[^/]+$/,
        auth: 'bearer',
        handle: () => ({
          snapshot: 'admin_order_ship_200',
          body: structuredClone(adminOrderState),
        }),
      },
      {
        method: 'POST',
        path: /^\/api\/v1\/admin\/orders\/[^/]+\/ship$/,
        auth: 'bearer',
        requestSnapshot: 'admin_order_ship_200',
        handle: ({ body }) => {
          const req = (body ?? {}) as { carrier: string; trackingCode: string }
          const shipped = cloneSnapshotBody('admin_order_ship_200')
          const d = shipped.data as Record<string, unknown>
          d.carrier = req.carrier
          d.trackingCode = req.trackingCode
          ;(d.items as Array<Record<string, unknown>>)[0].imageUrl =
            '/media/products/iphone-16-pro.webp'
          Object.assign(adminOrderData, structuredClone(d))
          return { snapshot: 'admin_order_ship_200', body: shipped }
        },
      },
    ])

    const admin = new AdminEnhancementsPage(page)

    // 5a: Admin /products/new multi-image + specs preset
    await admin.openNewProduct()
    await page.locator('#product-name').fill('iPhone 16 Pro Max Demo')
    await page.locator('#product-model').fill('A3297')
    await page.locator('#product-brand').fill('Apple')
    await page.locator('#product-category').selectOption(CATEGORIES[0].id)
    await page.locator('#product-price').fill('34990000')
    await page.locator('#product-stock').fill('20')
    await page.locator('#product-description').fill('Thiết kế Titan đẳng cấp chuyên nghiệp.')

    await page.locator('#product-images-upload').setInputFiles([
      { name: 'front.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG },
      { name: 'side.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG },
    ])
    await expect(page.getByText('Ảnh đại diện', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Đặt ảnh 2 làm ảnh đại diện' }).click()

    await page.getByRole('button', { name: 'Áp dụng mẫu Điện thoại' }).click()
    const specValueInputs = page.locator('input[aria-label^="Giá trị thông số "]')
    const specCount = await specValueInputs.count()
    expect(specCount).toBeGreaterThan(0)
    for (let i = 0; i < specCount; i++) {
      await specValueInputs.nth(i).fill('Thông số tiêu chuẩn flagship')
    }

    await page.evaluate(() => window.scrollTo(0, 0))
    await assertLayoutInvariants(page, 'S5 admin new product')
    await page.screenshot({
      path: screenshotPath('12-admin-product-new-images-specs.png'),
      fullPage: true,
      animations: 'disabled',
    })

    await page.getByRole('button', { name: 'Tạo sản phẩm' }).click()
    await expect(page).toHaveURL(/\/products$/)

    // 5b: Admin /vouchers CRUD
    await admin.openVouchers()
    await page.getByRole('button', { name: 'Tạo mã giảm giá' }).click()
    await page.locator('#voucher-code').fill('TET2026')
    await page.locator('#voucher-title').fill('Ưu đãi đầu năm')
    await page.locator('#voucher-description').fill('Giảm ngay 10% toàn gian hàng')
    await page.locator('#voucher-discount-value').fill('10')
    await page.locator('#voucher-max-discount').fill('1000000')
    await page.locator('#voucher-min-order').fill('5000000')
    await page.locator('#voucher-usage-limit').fill('100')
    await page.locator('#voucher-per-user-limit').fill('2')
    await page.locator('#voucher-starts-at').fill(toDatetimeLocalValue(win.startsAt))
    await page.locator('#voucher-ends-at').fill(toDatetimeLocalValue(win.endsAt))
    await page.getByRole('button', { name: 'Lưu mã giảm giá' }).click()
    await expect(page.getByText('TET2026', { exact: true })).toBeVisible()

    // Toggle active on AURA10 and delete TET2026
    await page
      .locator('label')
      .filter({ has: page.getByRole('checkbox', { name: 'Bật/tắt mã AURA10' }) })
      .click()
    await page.getByRole('button', { name: 'Xóa TET2026' }).click()
    await page.getByRole('button', { name: 'Xóa', exact: true }).click()
    await expect(page.getByText('Đã xóa mã giảm giá TET2026.')).toBeVisible()

    await assertLayoutInvariants(page, 'S5 admin vouchers')
    await page.screenshot({
      path: screenshotPath('13-admin-vouchers.png'),
    })

    // 5c: Admin /flash-sales CRUD
    await admin.openFlashSales()
    await page.getByRole('button', { name: 'Tạo chiến dịch' }).click()
    await page.locator('#fs-name').fill('Flash Sale Cuối Tuần')
    await page.locator('#fs-starts-at').fill(toDatetimeLocalValue(win.startsAt))
    await page.locator('#fs-ends-at').fill(toDatetimeLocalValue(win.endsAt))
    await page.locator('#fs-product-search').fill('iPhone')
    await page.getByRole('button', { name: /Chọn biến thể/i }).first().click()
    await page.getByRole('button', { name: /Thêm biến thể/i }).first().click()
    await page.locator(`#fs-price-${VARIANT_IDS.iphone256}`).fill('25990000')
    await page.locator(`#fs-quota-${VARIANT_IDS.iphone256}`).fill('20')
    await page.getByRole('button', { name: 'Lưu chiến dịch' }).click()
    await expect(page.getByText('Flash Sale Cuối Tuần', { exact: true })).toBeVisible()

    // Edit existing campaign to verify PUT /api/v1/admin/flash-sales/:id
    await page.getByRole('button', { name: 'Sửa Deal Chớp Nhoáng 12H' }).click()
    await page.locator('#fs-name').fill('Deal Chớp Nhoáng 12H (Mở rộng)')
    await page.getByRole('button', { name: 'Lưu chiến dịch' }).click()
    await expect(page.getByText('Deal Chớp Nhoáng 12H (Mở rộng)', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Xóa Flash Sale Cuối Tuần' }).click()
    await page.getByRole('button', { name: 'Xóa', exact: true }).click()
    await expect(page.getByText('Đã xóa chiến dịch "Flash Sale Cuối Tuần".')).toBeVisible()

    await assertLayoutInvariants(page, 'S5 admin flash sales')
    await page.screenshot({
      path: screenshotPath('14-admin-flash-sales.png'),
    })

    // 5d: Admin /orders/:id ship modal + realtime WS update
    await admin.openOrderDetail(adminOrderId)
    await page.getByRole('button', { name: 'Bàn giao vận chuyển' }).click()

    // Submit empty to verify validation errors in Vietnamese
    await page.getByRole('button', { name: 'Xác nhận xuất kho' }).click()
    await expect(page.getByText(/Vui lòng nhập đơn vị vận chuyển/i)).toBeVisible()

    await page.getByRole('button', { name: 'GHN', exact: true }).click()
    await page.locator('#ship-tracking-code').fill('GHN-123456')
    await page.getByRole('button', { name: 'Xác nhận xuất kho' }).click()
    await expect(page.getByText('GHN-123456', { exact: true })).toBeVisible()

    // Push WS notification to verify realtime refresh in AdminOrderDetailPage
    adminOrderData.status = 'delivered'
    adminOrderData.timeline = [
      ...(adminOrderData.timeline as Array<Record<string, unknown>>),
      {
        actorType: 'system',
        createdAt: '2026-11-18T12:15:00Z',
        id: 'evt-4',
        note: 'Khách hàng đã nhận hàng nguyên vẹn',
        status: 'delivered',
      },
    ]

    await expect.poll(() => adminSockets.length).toBeGreaterThan(0)
    const wsFrame = JSON.stringify(
      buildValidatedOrderNotificationFrame({
        id: 'notif-admin-delivered',
        notificationType: 'order_delivered',
        recipientId: ADMIN_USER.id,
        actorId: CUSTOMER_USER.id,
        actorName: CUSTOMER_USER.displayName,
        actorRole: 'customer',
        orderId: adminOrderId,
        orderShortCode: '#22222222',
        status: 'delivered',
        excerpt: 'đã nhận đơn hàng #22222222 thành công.',
        totalVnd: '28550000',
        createdAt: '2026-11-18T12:15:00Z',
      })
    )
    for (const ws of adminSockets) {
      try {
        ws.send(wsFrame)
      } catch {
        // Ignore sockets closed during client route transitions
      }
    }
    await expect(page.getByText('Khách hàng đã nhận hàng nguyên vẹn')).toBeVisible()
    await expect(page.getByTestId('notification-unread-badge')).toContainText('1')

    await page.evaluate(() => window.scrollTo(0, 0))
    await assertLayoutInvariants(page, 'S5 admin order detail')
    await page.screenshot({
      path: screenshotPath('15-admin-order-detail-timeline.png'),
      fullPage: true,
      animations: 'disabled',
    })
  })
})
