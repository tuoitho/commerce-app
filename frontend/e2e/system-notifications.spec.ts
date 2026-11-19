// Contracts: API-NOTIFICATIONS@3 (verifier); WS-NOTIFICATIONS@3 (verifier); TYPE-NOTIFICATION-METADATA@1 (verifier)
// _Requirements: 1.4, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4_

import * as fs from 'node:fs'
import * as path from 'node:path'
import { test, expect, type Page, type WebSocketRoute } from '@playwright/test'
import {
  assertMatchesContractShape,
  loadContractSnapshots,
  mountContractRoutes,
  type ContractRoute,
} from './fixtures/contract'

const snapshots = loadContractSnapshots('system-notifications', {
  nullable: ['actorId', 'actorName', 'actorRole', 'postId', 'commentId', 'reactionType'],
})

const imgsDir = fs.existsSync(path.resolve(process.cwd(), '.dream'))
  ? path.resolve(process.cwd(), '.dream', 'specs', 'system-notifications', 'imgs')
  : path.resolve(process.cwd(), '..', '.dream', 'specs', 'system-notifications', 'imgs')

const ADMIN_BASE = process.env.ADMIN_BASE_URL || 'http://localhost:15174'
const VALID_CATEGORIES = new Set(['post', 'order', 'return', 'review', 'live'])

interface NotificationSnapshotItem {
  id: string
  recipientId: string
  actorId: string | null
  actorName: string | null
  actorRole: string | null
  groupKey: string
  actorCount: number
  category: string
  notificationType: string
  postId: string | null
  commentId: string | null
  reactionType: string | null
  excerpt: string
  metadata: Record<string, unknown>
  isRead: boolean
  createdAt: string
  updatedAt: string
}

function goldenItems(): NotificationSnapshotItem[] {
  const data = snapshots.snapshots.list_notifications_200.responseBody.data as {
    items: NotificationSnapshotItem[]
  }
  return structuredClone(data.items)
}

function cloneGoldenItem(index: number, overrides: Partial<NotificationSnapshotItem> = {}): NotificationSnapshotItem {
  const items = goldenItems()
  const base = structuredClone(items[index])
  return { ...base, ...overrides }
}

function envelope(message: string, data: unknown, metaExtra: Record<string, unknown> = {}) {
  return {
    success: true,
    message,
    data,
    error: null,
    meta: { timestamp: '2026-11-16T07:00:00Z', ...metaExtra },
  }
}

async function assertLayoutInvariants(page: Page): Promise<void> {
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  )
  expect(noOverflow, 'Horizontal overflow detected').toBe(true)

  const brokenImages = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img'))
      .filter((img) => {
        const style = window.getComputedStyle(img)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.src)
  )
  expect(brokenImages).toEqual([])
}

interface NotificationMockState {
  notifications: NotificationSnapshotItem[]
  sockets: WebSocketRoute[]
}

function createNotificationRoutes(state: NotificationMockState): ContractRoute[] {
  return [
    {
      method: 'GET',
      path: '/api/v1/notifications',
      auth: 'bearer',
      handle: ({ url }) => {
        const category = (url.searchParams.get('category') || '').trim()
        if (category && !VALID_CATEGORIES.has(category)) {
          return { snapshot: 'list_notifications_invalid_filter_400' }
        }
        const filtered = category
          ? state.notifications.filter((item) => item.category === category)
          : state.notifications
        const unreadCount = state.notifications.filter((item) => !item.isRead).length
        const replyBody = structuredClone(snapshots.snapshots.list_notifications_200.responseBody) as {
          data: { items: NotificationSnapshotItem[]; unreadCount: number }
        }
        replyBody.data = {
          items: structuredClone(filtered),
          unreadCount,
        }
        return {
          snapshot: 'list_notifications_200',
          body: replyBody as unknown as Record<string, unknown>,
        }
      },
    },
    {
      method: 'POST',
      path: /^\/api\/v1\/notifications\/[^/]+\/read$/,
      auth: 'bearer',
      handle: ({ url }) => {
        const parts = url.pathname.split('/')
        const id = parts[parts.length - 2] || ''
        state.notifications = state.notifications.map((item) =>
          item.id === id ? { ...item, isRead: true } : item
        )
        const unreadCount = state.notifications.filter((item) => !item.isRead).length
        const replyBody = structuredClone(snapshots.snapshots.mark_notification_read_200.responseBody) as {
          data: { id: string; isRead: boolean; unreadCount: number }
        }
        replyBody.data = { id, isRead: true, unreadCount }
        return {
          snapshot: 'mark_notification_read_200',
          body: replyBody as unknown as Record<string, unknown>,
        }
      },
    },
    {
      method: 'POST',
      path: '/api/v1/notifications/read-all',
      auth: 'bearer',
      handle: () => {
        state.notifications = state.notifications.map((item) => ({ ...item, isRead: true }))
        const replyBody = structuredClone(snapshots.snapshots.mark_all_notifications_read_200.responseBody)
        return {
          snapshot: 'mark_all_notifications_read_200',
          body: replyBody as unknown as Record<string, unknown>,
        }
      },
    },
  ]
}

function pushRealtimeNotification(
  state: NotificationMockState,
  item: NotificationSnapshotItem
): void {
  state.notifications = [item, ...state.notifications.filter((existing) => existing.id !== item.id)]
  const frame = {
    type: 'notification:new',
    payload: structuredClone(item),
  }

  const wsTemplate = snapshots.snapshots.ws_notification_new.responseBody as {
    type: string
    payload: unknown
  }
  expect(Object.keys(frame).sort()).toEqual(Object.keys(wsTemplate).sort())
  const goldenList = (
    snapshots.snapshots.list_notifications_200.responseBody.data as { items: unknown[] }
  ).items
  assertMatchesContractShape([frame.payload], goldenList, 'ws(notification:new).payload', snapshots.nullable)

  const rawFrame = JSON.stringify(frame)
  for (const ws of state.sockets) {
    ws.send(rawFrame)
  }
}

async function setupStorefrontNotificationsE2E(
  page: Page,
  initialNotifications: NotificationSnapshotItem[]
): Promise<NotificationMockState> {
  const state: NotificationMockState = {
    notifications: structuredClone(initialNotifications),
    sockets: [],
  }

  const customerUser = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'khach@auraphone.vn',
    role: 'customer',
    displayName: 'Trần Minh Khuê',
    phone: '0912345678',
    avatarUrl: null,
    createdAt: '2026-11-01T08:00:00Z',
  }

  await page.addInitScript((user) => {
    localStorage.setItem('accessToken', 'mock-customer-jwt')
    localStorage.setItem('authUser', JSON.stringify(user))
  }, customerUser)

  await page.routeWebSocket(/\/api\/v1\/chat\/ws/, (ws) => {
    state.sockets.push(ws)
    ws.onMessage(() => {})
    ws.onClose(() => {
      state.sockets = state.sockets.filter((s) => s !== ws)
    })
  })
  await page.routeWebSocket(/\/api\/v1\/live\/sessions\//, () => {})

  const orderId = 'aaaa1111-2222-3333-4444-555566667777'
  const sessionId = 'dddd1111-2222-3333-4444-555566667777'
  const postId = '33333333-3333-3333-3333-333333333333'

  const routes: ContractRoute[] = [
    ...createNotificationRoutes(state),
    { method: 'GET', path: '/api/v1/auth/me', stub: { status: 200, body: envelope('OK', customerUser) } },
    { method: 'GET', path: '/api/v1/categories', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/products/featured', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/products', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/brands', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/live/current', stub: { status: 200, body: envelope('OK', null) } },
    { method: 'GET', path: '/api/v1/flash-sales/current', stub: { status: 200, body: envelope('OK', null) } },
    {
      method: 'GET',
      path: '/api/v1/cart',
      stub: {
        status: 200,
        body: envelope('OK', {
          items: [],
          totalUnits: 0,
          selectedLineCount: 0,
          selectedTotalVnd: '0',
          shippingFeeVnd: '0',
        }),
      },
    },
    { method: 'GET', path: '/api/v1/favorites', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: /^\/api\/v1\/chat\//, stub: { status: 200, body: envelope('OK', null) } },
    {
      method: 'GET',
      path: /^\/api\/v1\/orders\/[^/]+$/,
      stub: {
        status: 200,
        body: envelope('OK', {
          id: orderId,
          userId: customerUser.id,
          status: 'shipped',
          paymentMethod: 'cod',
          recipientName: 'Trần Minh Khuê',
          phone: '0912345678',
          provinceName: 'TP. Hồ Chí Minh',
          wardName: 'Phường Bến Nghé',
          detailAddress: '12 Lê Lợi',
          subtotalVnd: '29990000',
          shippingFeeVnd: '0',
          totalVnd: '29990000',
          items: [],
          createdAt: '2026-11-15T09:00:00Z',
          updatedAt: '2026-11-15T10:00:00Z',
          confirmedAt: '2026-11-15T09:10:00Z',
          cancelledAt: null,
          deliveredAt: null,
          cancellableUntil: null,
          returnEligibility: null,
          latestReturnRequest: null,
        }),
      },
    },
    {
      method: 'GET',
      path: '/api/v1/reviews/me',
      stub: {
        status: 200,
        body: envelope(
          'OK',
          { reviews: [] },
          { pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false } }
        ),
      },
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/live\/sessions\/[^/]+$/,
      stub: {
        status: 200,
        body: envelope('OK', {
          id: sessionId,
          title: 'Flash Sale Cuối Tuần',
          status: 'live',
          startedAt: '2026-11-15T10:00:00Z',
          endedAt: null,
          viewerCount: 25,
          heartCount: 12,
          signalOnline: false,
          pinnedProductId: null,
          products: [],
          comments: [],
          media: null,
        }),
      },
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/posts\/[^/]+$/,
      stub: {
        status: 200,
        body: envelope('OK', {
          id: postId,
          authorId: '11111111-1111-1111-1111-111111111111',
          authorName: 'Quản trị viên',
          authorRole: 'admin',
          content: 'Ưu đãi tháng 11 siêu hấp dẫn dành cho thành viên.',
          media: [],
          referredProducts: [],
          reactions: {
            totalCount: 1,
            counts: { like: 0, love: 1, haha: 0, wow: 0, sad: 0, angry: 0 },
            viewerReaction: 'love',
          },
          commentCount: 0,
          comments: [],
          createdAt: '2026-11-15T08:00:00Z',
          updatedAt: '2026-11-15T08:00:00Z',
        }),
      },
    },
  ]

  await mountContractRoutes(page, snapshots, routes)
  return state
}

async function setupAdminNotificationsE2E(
  page: Page,
  initialNotifications: NotificationSnapshotItem[]
): Promise<NotificationMockState> {
  const state: NotificationMockState = {
    notifications: structuredClone(initialNotifications),
    sockets: [],
  }

  const adminUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'admin@auraphone.vn',
    role: 'admin',
    createdAt: '2026-11-01T08:00:00Z',
  }

  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'mock-admin-jwt')
  })

  await page.routeWebSocket(/\/api\/v1\/chat\/ws/, (ws) => {
    state.sockets.push(ws)
    ws.onMessage(() => {})
    ws.onClose(() => {
      state.sockets = state.sockets.filter((s) => s !== ws)
    })
  })

  const orderId = 'aaaa1111-2222-3333-4444-555566667777'
  const returnId = 'bbbb1111-2222-3333-4444-555566667777'
  const postId = '33333333-3333-3333-3333-333333333333'

  const routes: ContractRoute[] = [
    ...createNotificationRoutes(state),
    { method: 'GET', path: '/api/v1/auth/me', stub: { status: 200, body: envelope('OK', adminUser) } },
    { method: 'GET', path: /^\/api\/v1\/admin\/chat\//, stub: { status: 200, body: envelope('OK', []) } },
    {
      method: 'GET',
      path: '/api/v1/posts',
      stub: {
        status: 200,
        body: envelope(
          'OK',
          [
            {
              id: postId,
              authorId: adminUser.id,
              authorName: 'Quản trị viên',
              authorRole: 'admin',
              content: 'Bài viết ưu đãi tháng 11 tại AuraPhone.',
              media: [],
              referredProducts: [],
              reactions: {
                totalCount: 1,
                counts: { like: 0, love: 1, haha: 0, wow: 0, sad: 0, angry: 0 },
                viewerReaction: null,
              },
              commentCount: 0,
              createdAt: '2026-11-15T08:00:00Z',
              updatedAt: '2026-11-15T08:00:00Z',
            },
          ],
          { pagination: { page: 1, limit: 30, total: 1, totalPages: 1, hasNext: false, hasPrev: false } }
        ),
      },
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/posts\/[^/]+$/,
      stub: {
        status: 200,
        body: envelope('OK', {
          id: postId,
          authorId: adminUser.id,
          authorName: 'Quản trị viên',
          authorRole: 'admin',
          content: 'Bài viết ưu đãi tháng 11 tại AuraPhone.',
          media: [],
          referredProducts: [],
          reactions: {
            totalCount: 1,
            counts: { like: 0, love: 1, haha: 0, wow: 0, sad: 0, angry: 0 },
            viewerReaction: null,
          },
          commentCount: 0,
          comments: [],
          createdAt: '2026-11-15T08:00:00Z',
          updatedAt: '2026-11-15T08:00:00Z',
        }),
      },
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/admin\/orders\/[^/]+$/,
      stub: {
        status: 200,
        body: envelope('OK', {
          id: orderId,
          userId: '22222222-2222-2222-2222-222222222222',
          buyerEmail: 'khach@auraphone.vn',
          status: 'pending_confirmation',
          paymentMethod: 'cod',
          recipientName: 'Nguyễn Minh Anh',
          phone: '0912345678',
          provinceName: 'TP. Hồ Chí Minh',
          wardName: 'Phường Bến Nghé',
          detailAddress: '12 Lê Lợi',
          subtotalVnd: '29990000',
          shippingFeeVnd: '0',
          totalVnd: '29990000',
          items: [],
          createdAt: '2026-11-15T10:00:00Z',
          updatedAt: '2026-11-15T10:00:00Z',
          confirmedAt: null,
          cancelledAt: null,
          deliveredAt: null,
        }),
      },
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/admin\/returns\/[^/]+$/,
      stub: {
        status: 200,
        body: envelope('OK', {
          id: returnId,
          orderId,
          userId: '22222222-2222-2222-2222-222222222222',
          buyerEmail: 'khach@auraphone.vn',
          status: 'pending_approval',
          reasonCode: 'defective',
          description: 'Sản phẩm lỗi loa ngoài khi mới mở hộp.',
          rejectReason: '',
          expectedRefundVnd: '29990000',
          refundAmountVnd: null,
          refundedByUserId: null,
          items: [],
          createdAt: '2026-11-15T10:00:00Z',
          updatedAt: '2026-11-15T10:00:00Z',
          approvedAt: null,
          rejectedAt: null,
          receivedAt: null,
          refundedAt: null,
          cancelledAt: null,
        }),
      },
    },
  ]

  await mountContractRoutes(page, snapshots, routes)
  return state
}

test.describe('System-Wide Notifications Mode 2 E2E', () => {
  test.beforeAll(() => {
    fs.mkdirSync(imgsDir, { recursive: true })
  })

  test('Storefront Desktop: receives realtime WS notifications, filters 6 tabs while preserving global badge, and deep-links destinations', async ({
    page,
  }) => {
    const orderNotif = cloneGoldenItem(0, { isRead: false })
    const reviewNotif = cloneGoldenItem(2, { isRead: true })
    const postNotif = cloneGoldenItem(4, { isRead: true })
    const returnNotif = cloneGoldenItem(1, { isRead: false })
    const liveNotif = cloneGoldenItem(3, { isRead: false })

    const state = await setupStorefrontNotificationsE2E(page, [orderNotif, reviewNotif, postNotif])
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    await expect(page.getByTestId('notification-unread-badge')).toHaveText('1')
    await expect.poll(() => state.sockets.length).toBeGreaterThan(0)

    pushRealtimeNotification(state, returnNotif)
    await expect(page.getByTestId('notification-unread-badge')).toHaveText('2')

    pushRealtimeNotification(state, liveNotif)
    await expect(page.getByTestId('notification-unread-badge')).toHaveText('3')

    await page.getByTestId('notification-bell-button').click()
    const panel = page.getByTestId('notifications-dropdown-panel')
    await expect(panel).toBeVisible()

    await expect(page.getByTestId('notification-tab-all')).toHaveText('Tất cả')
    await expect(page.getByTestId('notification-tab-order')).toHaveText('Đơn hàng')
    await expect(page.getByTestId('notification-tab-return')).toHaveText('Đổi trả')
    await expect(page.getByTestId('notification-tab-review')).toHaveText('Đánh giá')
    await expect(page.getByTestId('notification-tab-live')).toHaveText('Live')
    await expect(page.getByTestId('notification-tab-post')).toHaveText('Bài viết')
    await expect(page.getByTestId(`notification-item-${orderNotif.id}`)).toContainText('Cửa hàng')

    const panelBox = await panel.boundingBox()
    expect(panelBox).not.toBeNull()
    expect(panelBox!.x).toBeGreaterThanOrEqual(0)
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(1440)
    await assertLayoutInvariants(page)

    await page.screenshot({
      path: path.join(imgsDir, 'storefront-notifications-desktop.png'),
    })

    // Filter across tabs while preserving global unreadCount = 3
    await page.getByTestId('notification-tab-return').click()
    await expect(page.getByTestId(`notification-item-${returnNotif.id}`)).toBeVisible()
    await expect(page.getByTestId(`notification-item-${orderNotif.id}`)).toHaveCount(0)
    await expect(page.getByTestId('notification-unread-badge')).toHaveText('3')

    await page.getByTestId('notification-tab-order').click()
    await expect(page.getByTestId(`notification-item-${orderNotif.id}`)).toBeVisible()
    await expect(page.getByTestId('notification-unread-badge')).toHaveText('3')

    // Click order notification -> marks read (3 -> 2) & navigates to /orders/:id
    await page.getByTestId(`notification-item-${orderNotif.id}`).click()
    await expect(page).toHaveURL(/\/orders\/aaaa1111-2222-3333-4444-555566667777$/)
    await expect(page.getByTestId('notification-unread-badge')).toHaveText('2')

    // Review notification -> /reviews
    await page.getByTestId('notification-bell-button').click()
    await page.getByTestId('notification-tab-review').click()
    await page.getByTestId(`notification-item-${reviewNotif.id}`).click()
    await expect(page).toHaveURL(/\/reviews$/)

    // Live notification -> marks read (2 -> 1) & /live/:sessionId
    await page.getByTestId('notification-bell-button').click()
    await page.getByTestId('notification-tab-live').click()
    await page.getByTestId(`notification-item-${liveNotif.id}`).click()
    await expect(page).toHaveURL(/\/live\/dddd1111-2222-3333-4444-555566667777$/)
    await expect(page.getByTestId('notification-unread-badge')).toHaveText('1')

    // Post notification -> /posts/:id
    await page.getByTestId('notification-bell-button').click()
    await page.getByTestId('notification-tab-post').click()
    await page.getByTestId(`notification-item-${postNotif.id}`).click()
    await expect(page).toHaveURL(/\/posts\/33333333-3333-3333-3333-333333333333\?/)
  })

  test('Storefront Mobile (375x812): dropdown and 6 category tabs stay within viewport without horizontal overflow', async ({
    page,
  }) => {
    const items = [
      cloneGoldenItem(0, { isRead: false }),
      cloneGoldenItem(1, { isRead: false }),
      cloneGoldenItem(2, { isRead: true }),
      cloneGoldenItem(3, { isRead: false }),
      cloneGoldenItem(4, { isRead: true }),
    ]

    await setupStorefrontNotificationsE2E(page, items)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')

    await expect(page.getByTestId('notification-unread-badge')).toHaveText('3')
    await page.getByTestId('notification-bell-button').click()

    const panel = page.getByTestId('notifications-dropdown-panel')
    await expect(panel).toBeVisible()

    const panelBox = await panel.boundingBox()
    expect(panelBox).not.toBeNull()
    expect(panelBox!.x).toBeGreaterThanOrEqual(0)
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(375)

    await assertLayoutInvariants(page)

    await page.screenshot({
      path: path.join(imgsDir, 'storefront-notifications-mobile.png'),
    })

    // Last tab can be scrolled into view cleanly inside the horizontal tab bar
    await page.getByTestId('notification-tab-post').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('notification-tab-post')).toBeVisible()
  })

  test('Admin Portal Desktop (1440x900): receives realtime order/return alerts, filters 4 tabs, and deep-links destinations', async ({
    browser,
  }) => {
    const adminContext = await browser.newContext({
      baseURL: ADMIN_BASE,
      viewport: { width: 1440, height: 900 },
    })

    try {
      const adminPage = await adminContext.newPage()
      const adminPostNotif = cloneGoldenItem(4, {
        isRead: true,
        recipientId: '11111111-1111-1111-1111-111111111111',
      })
      const adminOrderNotif = cloneGoldenItem(5, { isRead: false })
      const adminReturnNotif = cloneGoldenItem(6, { isRead: false })

      const state = await setupAdminNotificationsE2E(adminPage, [adminPostNotif])
      await adminPage.goto('/posts')

      await expect(adminPage.getByTestId('notification-bell-button')).toBeVisible()
      await expect(adminPage.getByTestId('notification-unread-badge')).toHaveCount(0)
      await expect.poll(() => state.sockets.length).toBeGreaterThan(0)

      pushRealtimeNotification(state, adminOrderNotif)
      await expect(adminPage.getByTestId('notification-unread-badge')).toHaveText('1')

      pushRealtimeNotification(state, adminReturnNotif)
      await expect(adminPage.getByTestId('notification-unread-badge')).toHaveText('2')

      await adminPage.getByTestId('notification-bell-button').click()
      const panel = adminPage.getByTestId('notifications-dropdown-panel')
      await expect(panel).toBeVisible()

      await expect(adminPage.getByTestId('notification-tab-all')).toHaveText('Tất cả')
      await expect(adminPage.getByTestId('notification-tab-order')).toHaveText('Đơn hàng')
      await expect(adminPage.getByTestId('notification-tab-return')).toHaveText('Trả hàng')
      await expect(adminPage.getByTestId('notification-tab-post')).toHaveText('Bài viết')

      const orderItem = adminPage.getByTestId(`notification-item-${adminOrderNotif.id}`)
      await expect(orderItem).toContainText('Nguyễn Minh Anh')
      await expect(orderItem).toContainText('#AAAA1111')

      const panelBox = await panel.boundingBox()
      expect(panelBox).not.toBeNull()
      expect(panelBox!.x).toBeGreaterThanOrEqual(0)
      expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(1440)
      await assertLayoutInvariants(adminPage)

      await adminPage.screenshot({
        path: path.join(imgsDir, 'admin-notifications-desktop.png'),
      })

      // Tab filtering preserves global unreadCount = 2
      await adminPage.getByTestId('notification-tab-return').click()
      await expect(adminPage.getByTestId(`notification-item-${adminReturnNotif.id}`)).toBeVisible()
      await expect(adminPage.getByTestId(`notification-item-${adminOrderNotif.id}`)).toHaveCount(0)
      await expect(adminPage.getByTestId('notification-unread-badge')).toHaveText('2')

      await adminPage.getByTestId('notification-tab-order').click()
      await expect(adminPage.getByTestId(`notification-item-${adminOrderNotif.id}`)).toBeVisible()
      await expect(adminPage.getByTestId('notification-unread-badge')).toHaveText('2')

      // Click order notification -> marks read (2 -> 1) & navigates to /orders/:id
      await adminPage.getByTestId(`notification-item-${adminOrderNotif.id}`).click()
      await expect(adminPage).toHaveURL(/\/orders\/aaaa1111-2222-3333-4444-555566667777$/)
      await expect(adminPage.getByTestId('notification-unread-badge')).toHaveText('1')

      // Click return notification -> marks read (1 -> 0) & navigates to /returns/:id
      await adminPage.getByTestId('notification-bell-button').click()
      await adminPage.getByTestId('notification-tab-return').click()
      await adminPage.getByTestId(`notification-item-${adminReturnNotif.id}`).click()
      await expect(adminPage).toHaveURL(/\/returns\/bbbb1111-2222-3333-4444-555566667777$/)
      await expect(adminPage.getByTestId('notification-unread-badge')).toHaveCount(0)

      // Click post notification -> navigates to /posts/:id
      await adminPage.getByTestId('notification-bell-button').click()
      await adminPage.getByTestId('notification-tab-post').click()
      await adminPage.getByTestId(`notification-item-${adminPostNotif.id}`).click()
      await expect(adminPage).toHaveURL(/\/posts\/33333333-3333-3333-3333-333333333333\?/)
    } finally {
      await adminContext.close()
    }
  })
})
