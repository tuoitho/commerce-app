// Contracts: API-ADMIN-DASHBOARD@1 (verifier)
// _Requirements: 5.3, 6.2, 10.1, 10.2, 10.4_
import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import {
  loadContractSnapshots,
  mountContractRoutes,
  type ContractRoute,
  type StubReply,
} from './fixtures/contract'
import { AdminDashboardPage, AdminDestinationPages, type PendingWorkId } from './pages/AdminDashboardPage'

const ADMIN_BASE = process.env.ADMIN_BASE_URL || 'http://localhost:15174'
const ADMIN_EMAIL = 'quan.tri.vien.he.thong.auraphone@example.com'

const snapshots = loadContractSnapshots('admin-dashboard')
const imgsDir = path.resolve(process.cwd(), '..', '.dream', 'specs', 'admin-dashboard', 'imgs')

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="16" fill="#e0e7ff"/>
  <rect x="30" y="14" width="36" height="68" rx="8" fill="#4f46e5"/>
</svg>`

const ORDER_STATUSES = [
  'pending_confirmation',
  'confirmed',
  'preparing',
  'shipped',
  'delivered',
  'cancel_requested',
  'cancelled',
  'partially_returned',
  'returned',
] as const

function envelope(data: unknown, pagination?: Record<string, unknown>): StubReply {
  return {
    status: 200,
    body: {
      success: true,
      message: 'OK',
      data,
      error: null,
      meta: { timestamp: new Date().toISOString(), ...(pagination ? { pagination } : {}) },
    },
  }
}

function emptyPage(url: URL): StubReply {
  const page = Number(url.searchParams.get('page') || '1')
  const limit = Number(url.searchParams.get('limit') || '10')
  return envelope([], { page, limit, total: 0, totalPages: 1, hasNext: false, hasPrev: false })
}

// Revenue large enough to exceed one line at narrow widths and Number.MAX_SAFE_INTEGER.
function largeRevenueBody(): Record<string, unknown> {
  const body = structuredClone(snapshots.snapshots.get_dashboard_default_200.responseBody) as {
    data: {
      revenue: Record<string, unknown>
      dailyRevenue: Array<Record<string, unknown>>
    }
  }
  body.data.revenue.deliveredVnd = '12345678901234567'
  body.data.revenue.netVnd = '12345678875244567'
  body.data.revenue.averageOrderVnd = '2469135780246913'
  const last = body.data.dailyRevenue[body.data.dailyRevenue.length - 1]
  last.deliveredVnd = '12345678851234567'
  last.netVnd = '12345678851234567'
  return body as unknown as Record<string, unknown>
}

interface DestinationRequests {
  orders: string[]
  returns: string[]
  reviews: string[]
  conversations: string[]
}

async function setupAdminRoutes(
  page: Page,
  options: { dashboardBody?: Record<string, unknown> } = {}
): Promise<DestinationRequests> {
  const requests: DestinationRequests = { orders: [], returns: [], reviews: [], conversations: [] }

  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'mock-jwt-admin-token')
  })

  await page.route('https://example.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PLACEHOLDER_SVG })
  )
  await page.routeWebSocket(/\/api\/v1\/chat\/ws/, () => {})

  const routes: ContractRoute[] = [
    {
      method: 'GET',
      path: '/api/v1/auth/me',
      stub: envelope({ id: 'admin-1', email: ADMIN_EMAIL, role: 'admin' }),
    },
    {
      method: 'GET',
      path: '/api/v1/notifications',
      stub: envelope({ items: [], unreadCount: 0 }),
    },
    {
      method: 'GET',
      path: '/api/v1/admin/dashboard',
      auth: 'bearer',
      handle: ({ url }) => {
        const range = url.searchParams.get('range') ?? ''
        if (range === 'today') return { snapshot: 'get_dashboard_today_200' }
        if (range === '' || range === '7d' || range === '30d') {
          return { snapshot: 'get_dashboard_default_200', body: options.dashboardBody }
        }
        return { snapshot: 'invalid_filter_400' }
      },
    },
    {
      method: 'GET',
      path: '/api/v1/admin/orders',
      stub: ({ url }) => {
        requests.orders.push(url.searchParams.get('status') ?? '')
        return emptyPage(url)
      },
    },
    {
      method: 'GET',
      path: '/api/v1/admin/returns',
      stub: ({ url }) => {
        requests.returns.push(url.searchParams.get('status') ?? '')
        return emptyPage(url)
      },
    },
    {
      method: 'GET',
      path: '/api/v1/admin/reviews',
      stub: ({ url }) => {
        requests.reviews.push(url.searchParams.get('has_reply') ?? '')
        return emptyPage(url)
      },
    },
    {
      method: 'GET',
      path: '/api/v1/admin/chat/conversations',
      stub: ({ url }) => {
        requests.conversations.push(url.searchParams.get('filter') ?? '')
        return envelope([])
      },
    },
  ]

  await mountContractRoutes(page, snapshots, routes)
  return requests
}

test.describe('Admin dashboard E2E — Mode 2 (Shape-Locked Mock E2E)', () => {
  test.beforeAll(() => {
    fs.mkdirSync(imgsDir, { recursive: true })
  })

  test('Req 6.2: each pending-work item opens its destination list with the matching filter applied', async ({
    page,
  }) => {
    const requests = await setupAdminRoutes(page)
    const dashboard = new AdminDashboardPage(page)
    const destinations = new AdminDestinationPages(page)

    const cases: Array<{
      id: PendingWorkId
      url: RegExp
      verify: () => Promise<void>
    }> = [
      {
        id: 'pending-confirmation',
        url: /\/orders\?status=pending_confirmation$/,
        verify: async () => {
          await expect(destinations.ordersStatusSelect()).toHaveValue('pending_confirmation')
          await expect.poll(() => requests.orders.at(-1)).toBe('pending_confirmation')
        },
      },
      {
        id: 'cancel-requested',
        url: /\/orders\?status=cancel_requested$/,
        verify: async () => {
          await expect(destinations.ordersStatusSelect()).toHaveValue('cancel_requested')
          await expect.poll(() => requests.orders.at(-1)).toBe('cancel_requested')
        },
      },
      {
        id: 'pending-approval-returns',
        url: /\/returns\?status=pending_approval$/,
        verify: async () => {
          await expect(destinations.returnsStatusSelect()).toHaveValue('pending_approval')
          await expect.poll(() => requests.returns.at(-1)).toBe('pending_approval')
        },
      },
      {
        id: 'received-returns',
        url: /\/returns\?status=received$/,
        verify: async () => {
          await expect(destinations.returnsStatusSelect()).toHaveValue('received')
          await expect.poll(() => requests.returns.at(-1)).toBe('received')
        },
      },
      {
        id: 'unreplied-reviews',
        url: /\/reviews\?has_reply=no$/,
        verify: async () => {
          await expect(destinations.reviewsReplySelect()).toHaveValue('no')
          await expect.poll(() => requests.reviews.at(-1)).toBe('no')
        },
      },
      {
        id: 'unread-conversations',
        url: /\/chat\?filter=unread$/,
        verify: async () => {
          await expect(destinations.chatUnreadTab()).toHaveClass(/bg-white/)
          await expect(destinations.chatAllTab()).not.toHaveClass(/bg-white/)
          await expect.poll(() => requests.conversations.at(-1)).toBe('unread')
        },
      },
    ]

    for (const item of cases) {
      await dashboard.goto(ADMIN_BASE)
      await dashboard.pendingWorkItem(item.id).click()
      await expect(page).toHaveURL(item.url)
      await item.verify()
    }
  })

  test('Req 5.3: each order-status entry opens the orders list filtered by that status', async ({
    page,
  }) => {
    const requests = await setupAdminRoutes(page)
    const dashboard = new AdminDashboardPage(page)
    const destinations = new AdminDestinationPages(page)

    for (const status of ORDER_STATUSES) {
      await dashboard.goto(ADMIN_BASE)
      await dashboard.orderStatusItem(status).click()
      await expect(page).toHaveURL(new RegExp(`/orders\\?status=${status}$`))
      await expect(destinations.ordersStatusSelect()).toHaveValue(status)
      await expect.poll(() => requests.orders.at(-1)).toBe(status)
    }
  })

  test('Req 10.1: desktop layout keeps the fixed sidebar and shows money values unclipped', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await setupAdminRoutes(page, { dashboardBody: largeRevenueBody() })
    const dashboard = new AdminDashboardPage(page)
    await dashboard.goto(ADMIN_BASE)

    await expect(page.getByRole('navigation').first()).toBeVisible()
    await expect(dashboard.menuButton()).toBeHidden()
    expect(await dashboard.hasHorizontalScroll()).toBe(false)

    const delivered = page.getByText('12.345.678.901.234.567', { exact: false }).first()
    await expect(delivered).toBeVisible()
    const clipped = await delivered.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(clipped, 'delivered revenue value must not be clipped').toBe(false)

    await page.screenshot({ path: path.join(imgsDir, '01-dashboard-desktop-1440.png'), fullPage: true })
  })

  test('Req 10.1, 10.4: no horizontal scroll at 320px and 375px; navigation drawer opens, closes on Escape and returns focus', async ({
    page,
  }) => {
    await setupAdminRoutes(page, { dashboardBody: largeRevenueBody() })
    const dashboard = new AdminDashboardPage(page)

    await page.setViewportSize({ width: 320, height: 700 })
    await dashboard.goto(ADMIN_BASE)
    expect(await dashboard.hasHorizontalScroll(), 'no horizontal scroll at 320px').toBe(false)
    await expect(dashboard.menuButton()).toBeVisible()

    await page.setViewportSize({ width: 375, height: 812 })
    await dashboard.goto(ADMIN_BASE)
    expect(await dashboard.hasHorizontalScroll(), 'no horizontal scroll at 375px').toBe(false)
    expect(await dashboard.overflowPastViewport(page.locator('header').first())).toBe(0)
    await page.screenshot({ path: path.join(imgsDir, '02-dashboard-mobile-375.png'), fullPage: true })

    await dashboard.openNavigationDrawer()
    await expect(dashboard.menuButton()).toHaveAttribute('aria-expanded', 'true')
    const linkNames = (await dashboard.drawerLinkNames()).map((name) => name.trim())
    for (const label of ['Tổng quan', 'Bài viết', 'Sản phẩm', 'Đơn hàng', 'Tin nhắn hỗ trợ', 'Trả hàng', 'Đánh giá', 'Danh mục']) {
      expect(linkNames.some((name) => name.startsWith(label)), `drawer link "${label}"`).toBe(true)
    }
    await page.screenshot({ path: path.join(imgsDir, '03-navigation-drawer-open-375.png') })

    await page.keyboard.press('Escape')
    await expect(dashboard.navigationDrawer()).toBeHidden()
    await expect(dashboard.menuButton()).toBeFocused()
    await expect(dashboard.menuButton()).toHaveAttribute('aria-expanded', 'false')

    // Full-bleed pages offset the layout padding with negative margins; they must follow the narrower mobile padding.
    await page.goto(`${ADMIN_BASE}/chat?filter=unread`)
    const destinations = new AdminDestinationPages(page)
    await expect(destinations.chatUnreadTab()).toBeVisible()
    expect(await dashboard.hasHorizontalScroll(), 'no horizontal scroll on chat page at 375px').toBe(false)
    const offset = await destinations.chatPageOffsetFromContentArea()
    expect(offset.left, 'chat page must not extend left of the content area').toBeGreaterThanOrEqual(-0.5)
    expect(offset.top, 'chat page must not extend above the content area').toBeGreaterThanOrEqual(-0.5)
  })

  test('Req 10.2: keyboard focus is visible on dashboard controls and chart days show unclipped tooltips', async ({
    page,
  }) => {
    await setupAdminRoutes(page)
    const dashboard = new AdminDashboardPage(page)

    await page.setViewportSize({ width: 1440, height: 900 })
    await dashboard.goto(ADMIN_BASE)

    const thirtyDays = dashboard.rangeButton('30 ngày')
    const indicator = () =>
      thirtyDays.evaluate((el) => {
        const style = getComputedStyle(el)
        return `${style.outlineStyle}|${style.boxShadow}`
      })
    const unfocused = await indicator()
    await dashboard.rangeButton('7 ngày').focus()
    await page.keyboard.press('Tab')
    await expect(thirtyDays).toBeFocused()
    expect(await indicator(), 'keyboard focus must change the focus indicator').not.toBe(unfocused)
    await page.screenshot({ path: path.join(imgsDir, '04-keyboard-focus-range-control.png') })

    const days = await dashboard.chartDays().count()
    expect(days).toBe(7)
    for (const index of [0, days - 1]) {
      await dashboard.chartDay(index).focus()
      await expect(dashboard.chartTooltip()).toBeVisible()
      const chartBox = await dashboard.revenueChart().boundingBox()
      const tipBox = await dashboard.chartTooltip().boundingBox()
      expect(tipBox!.x).toBeGreaterThanOrEqual(chartBox!.x - 1)
      expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(chartBox!.x + chartBox!.width + 1)
    }
    await page.screenshot({ path: path.join(imgsDir, '05-chart-last-day-tooltip-focus.png') })

    await page.setViewportSize({ width: 375, height: 812 })
    await dashboard.goto(ADMIN_BASE)
    await dashboard.chartDay(days - 1).focus()
    await expect(dashboard.chartTooltip()).toBeVisible()
    expect(await dashboard.overflowPastViewport(dashboard.chartTooltip())).toBe(0)
    await dashboard.chartTooltip().scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(imgsDir, '06-chart-last-day-tooltip-mobile-375.png') })
  })
})
