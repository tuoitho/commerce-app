// Contracts: API-ADMIN-USERS@1 (verifier)
// _Requirements: 8.2_
import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import {
  loadContractSnapshots,
  mountContractRoutes,
  type ContractRoute,
  type StubReply,
} from './fixtures/contract'
import { AdminUsersPage } from './pages/AdminUsersPage'

const ADMIN_BASE = process.env.ADMIN_BASE_URL || 'http://localhost:15174'
const ADMIN_EMAIL = 'quan.tri@example.com'

const snapshots = loadContractSnapshots('admin-user-management')
const imgsDir = path.resolve(process.cwd(), '..', '.dream', 'specs', 'admin-user-management', 'imgs')

const detailBody = snapshots.snapshots.get_user_200.responseBody as { data: { id: string } }
const DETAIL_ID = detailBody.data.id

function envelope(data: unknown): StubReply {
  return {
    status: 200,
    body: { success: true, message: 'OK', data, error: null, meta: { timestamp: new Date().toISOString() } },
  }
}

async function setupAdminRoutes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'mock-jwt-admin-token')
  })
  await page.routeWebSocket(/\/api\/v1\/chat\/ws/, () => {})

  const routes: ContractRoute[] = [
    { method: 'GET', path: '/api/v1/auth/me', stub: envelope({ id: 'admin-1', email: ADMIN_EMAIL, role: 'admin' }) },
    { method: 'GET', path: '/api/v1/notifications', stub: envelope({ items: [], unreadCount: 0 }) },
    { method: 'GET', path: '/api/v1/admin/chat/conversations', stub: envelope([]) },
    {
      method: 'GET',
      path: '/api/v1/admin/users',
      auth: 'bearer',
      handle: () => ({ snapshot: 'list_users_200' }),
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/admin\/users\/[^/]+$/,
      auth: 'bearer',
      handle: ({ url }) =>
        url.pathname.endsWith(`/${DETAIL_ID}`) ? { snapshot: 'get_user_200' } : { snapshot: 'user_not_found_404' },
    },
  ]
  await mountContractRoutes(page, snapshots, routes)
}

test.describe('Admin user management E2E — Mode 2 (Shape-Locked Mock E2E)', () => {
  test.beforeAll(() => {
    fs.mkdirSync(imgsDir, { recursive: true })
  })

  test('Req 8.2: list and detail pages have no page-level horizontal scroll at 375px', async ({ page }) => {
    await setupAdminRoutes(page)
    const users = new AdminUsersPage(page)

    await users.gotoList(ADMIN_BASE)
    await expect(users.userRows()).toHaveCount(2)
    await page.screenshot({ path: path.join(imgsDir, '01-users-list-desktop-1440.png'), fullPage: true })

    await users.gotoDetail(ADMIN_BASE, DETAIL_ID)
    await page.screenshot({ path: path.join(imgsDir, '02-user-detail-desktop-1440.png'), fullPage: true })

    await page.setViewportSize({ width: 375, height: 812 })

    await users.gotoList(ADMIN_BASE)
    expect(await users.hasHorizontalScroll(), 'no horizontal scroll on the users list at 375px').toBe(false)
    await page.screenshot({ path: path.join(imgsDir, '03-users-list-mobile-375.png'), fullPage: true })

    await users.gotoDetail(ADMIN_BASE, DETAIL_ID)
    expect(await users.hasHorizontalScroll(), 'no horizontal scroll on the user detail at 375px').toBe(false)
    await page.screenshot({ path: path.join(imgsDir, '04-user-detail-mobile-375.png'), fullPage: true })
  })
})
