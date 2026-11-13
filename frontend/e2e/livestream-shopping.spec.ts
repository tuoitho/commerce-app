// Livestream shopping — Mode 2: Shape-Locked Mock E2E.
// Contracts: API-LIVE-PUBLIC@1 (verifier); WS-LIVE-ROOM@1 (verifier); TYPE-LIVE@1 (verifier)
// _Requirements: 3.1, 3.2, 3.7, 4.1, 6.1, 6.2_
import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page, type WebSocketRoute } from '@playwright/test'
import { loadContractSnapshots, mountContractRoutes, type ContractRoute } from './fixtures/contract'
import { LiveShoppingPage } from './pages/LiveShoppingPage'

const snapshots = loadContractSnapshots('livestream-shopping', { nullable: ['endedAt', 'pinnedProductId', 'media', 'quota', 'remaining', 'livePriceVnd', 'liveRemaining'] })
const IMGS_DIR = path.resolve(process.cwd(), '..', '.dream', 'specs', 'livestream-shopping', 'imgs')

const SESSION_ID = '11111111-1111-1111-1111-111111111111'
const PRODUCT_ID = 'aaaaaaaa-0000-0000-0000-00000000000a'
const VARIANT_ID = 'aaaaaaaa-0000-0000-0000-0000000000a1'
const TOKEN = 'mock-jwt-customer-token'
const MOCK_USER = { id: '33333333-3333-3333-3333-333333333333', email: 'lan@auraphone.vn', role: 'customer', createdAt: '2026-10-01T00:00:00Z' }

function envelope(message: string, data: unknown) {
  return { success: true, message, data, error: null, meta: { timestamp: '2026-11-13T03:00:00Z' } }
}

function snapshotBody(key: string): Record<string, unknown> {
  return structuredClone(snapshots.snapshots[key].responseBody) as Record<string, unknown>
}

/** The product detail snapshot, re-keyed to the live cart product used in the live session snapshot. */
function liveProductDetail(): Record<string, unknown> {
  const body = snapshotBody('product_detail_live_200') as { data: { id: string; variants: { id: string }[] } }
  body.data.id = PRODUCT_ID
  body.data.variants[0].id = VARIANT_ID
  return body
}

interface LiveMocks {
  authenticated: boolean
  posted: unknown[]
  addedVariants: string[]
  liveSocket: Promise<WebSocketRoute>
  heartFrames: unknown[]
}

async function setupLiveRoutes(page: Page, options: { authenticated: boolean }): Promise<LiveMocks> {
  const state = { authenticated: options.authenticated }
  const mocks: Omit<LiveMocks, 'liveSocket'> = { authenticated: options.authenticated, posted: [], addedVariants: [], heartFrames: [] }
  const unauthenticated = snapshots.snapshots.unauthenticated_401

  await page.addInitScript(
    ({ authenticated, user, token }) => {
      if (authenticated) {
        localStorage.setItem('accessToken', token)
        localStorage.setItem('authUser', JSON.stringify(user))
      } else {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('authUser')
      }
      // No media server in Mode 2: a peer connection that never connects.
      class OfflinePeerConnection {
        iceGatheringState = 'complete'
        connectionState = 'new'
        localDescription = { type: 'offer', sdp: '' }
        ontrack = null
        onconnectionstatechange = null
        addTransceiver() {}
        async createOffer() {
          return { type: 'offer', sdp: '' }
        }
        async setLocalDescription() {}
        async setRemoteDescription() {}
        addEventListener() {}
        removeEventListener() {}
        close() {}
      }
      ;(window as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = OfflinePeerConnection
    },
    { authenticated: options.authenticated, user: MOCK_USER, token: TOKEN },
  )

  // The WHEP endpoint has no publisher yet.
  await page.route('http://localhost:8889/**', (route) => route.fulfill({ status: 404, body: '' }))
  await page.routeWebSocket(/\/api\/v1\/chat\/ws/, () => {})
  const liveSocket = new Promise<WebSocketRoute>((resolve) => {
    void page.routeWebSocket(/\/api\/v1\/live\/sessions\/[^/]+\/ws/, (ws) => {
      expect(ws.url()).toContain(`token=${TOKEN}`)
      ws.onMessage((message) => {
        const frame = JSON.parse(String(message)) as { type: string }
        if (frame.type === 'live:heart') mocks.heartFrames.push(frame)
      })
      ws.send(JSON.stringify(snapshots.snapshots.ws_live_viewers.responseBody))
      ws.send(JSON.stringify(snapshots.snapshots.ws_live_signal.responseBody))
      resolve(ws)
    })
  })

  const authed = (request: { headers(): Record<string, string> }) => /^Bearer .+/.test(request.headers()['authorization'] ?? '')
  const routes: ContractRoute[] = [
    // Feature contracts (shape-locked)
    { method: 'GET', path: '/api/v1/live/current', handle: () => ({ snapshot: 'live_current_200' }) },
    { method: 'GET', path: `/api/v1/live/sessions/${SESSION_ID}`, auth: 'bearer', handle: () => ({ snapshot: 'live_session_200' }) },
    {
      method: 'POST',
      path: `/api/v1/live/sessions/${SESSION_ID}/comments`,
      auth: 'bearer',
      requestSnapshot: 'live_comment_create_201',
      handle: ({ body }) => {
        mocks.posted.push(body)
        const reply = snapshotBody('live_comment_create_201') as { data: { content: string; id: string } }
        reply.data.content = (body as { content: string }).content
        reply.data.id = '55555555-5555-5555-5555-555555555555'
        return { snapshot: 'live_comment_create_201', body: reply }
      },
    },
    { method: 'GET', path: `/api/v1/products/${PRODUCT_ID}`, handle: () => ({ snapshot: 'product_detail_live_200', body: liveProductDetail() }) },
    {
      method: 'POST',
      path: '/api/v1/cart/items',
      auth: 'bearer',
      requestSnapshot: 'cart_add_item_200',
      handle: ({ body }) => {
        mocks.addedVariants.push((body as { variantId: string }).variantId)
        return { snapshot: 'cart_add_item_200' }
      },
    },
    // Shared storefront layout, outside this feature's contracts
    {
      method: 'GET',
      path: '/api/v1/auth/me',
      stub: ({ request }) =>
        state.authenticated && authed(request)
          ? { status: 200, body: envelope('OK', MOCK_USER) }
          : { status: unauthenticated.status, body: unauthenticated.responseBody },
    },
    { method: 'POST', path: '/api/v1/auth/refresh', stub: { status: unauthenticated.status, body: unauthenticated.responseBody } },
    {
      method: 'POST',
      path: '/api/v1/auth/login',
      stub: () => {
        state.authenticated = true
        return { status: 200, body: envelope('Đăng nhập thành công', { user: MOCK_USER, accessToken: TOKEN }) }
      },
    },
    { method: 'GET', path: '/api/v1/categories', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/products/featured', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/cart', stub: { status: 200, body: snapshotBody('cart_live_200') } },
    { method: 'GET', path: '/api/v1/favorites', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: /^\/api\/v1\/chat\//, stub: { status: 200, body: envelope('OK', null) } },
    { method: 'GET', path: '/api/v1/notifications', stub: { status: 200, body: envelope('OK', { items: [], unreadCount: 0 }) } },
  ]
  await mountContractRoutes(page, snapshots, routes)
  return { ...mocks, liveSocket }
}

test.describe('Livestream shopping — Mode 2 (Shape-Locked Mock E2E)', () => {
  test('Req 3.1, 3.2: the LIVE entry leads visitors through login back to the live session', async ({ page }) => {
    const mocks = await setupLiveRoutes(page, { authenticated: false })
    await page.goto('/')

    const liveLink = page.getByRole('link', { name: /LIVE/ }).first()
    await expect(liveLink).toHaveAttribute('href', `/live/${SESSION_ID}`)
    await expect(page.getByRole('link', { name: /Xem ngay/ })).toBeVisible()

    await liveLink.click()
    await expect(page).toHaveURL(new RegExp(`/login\\?redirect=${encodeURIComponent(`/live/${SESSION_ID}`)}`))

    await page.getByPlaceholder('name@example.com').fill(MOCK_USER.email)
    await page.getByPlaceholder('••••••••').fill('Customer123456@')
    await page.getByRole('button', { name: 'Đăng nhập' }).last().click()

    await expect(page).toHaveURL(new RegExp(`/live/${SESSION_ID}$`))
    const live = new LiveShoppingPage(page)
    await live.expectLoaded()
    await mocks.liveSocket
    await expect(live.viewers).toContainText('1')
    await expect(page.getByText('Đang chờ tín hiệu')).toBeVisible()
  })

  test('Req 4.1: a comment is posted and comments from the room appear', async ({ page }) => {
    const mocks = await setupLiveRoutes(page, { authenticated: true })
    const live = new LiveShoppingPage(page)
    await live.goto(SESSION_ID)
    await live.expectLoaded()
    const socket = await mocks.liveSocket

    await live.sendComment('Còn size M không shop?')
    await expect(page.getByText('Còn size M không shop?').filter({ visible: true })).toBeVisible()
    expect(mocks.posted).toEqual([{ content: 'Còn size M không shop?' }])
    await expect(live.commentInput()).toHaveValue('')

    socket.send(JSON.stringify(snapshots.snapshots.ws_live_comment.responseBody))
    await expect(page.getByText('Chào cả nhà').filter({ visible: true })).toBeVisible()
    await expect(page.getByText('Chủ shop').filter({ visible: true }).first()).toBeVisible()

    await live.heartButton.click()
    await live.heartButton.click()
    // Taps are batched every 500ms, so two taps may arrive in one or two frames.
    const heartsSent = () => (mocks.heartFrames as { payload: { count: number } }[]).reduce((sum, f) => sum + f.payload.count, 0)
    await expect.poll(heartsSent).toBe(2)
    expect(mocks.heartFrames[0]).toMatchObject({ type: 'live:heart', payload: { count: expect.any(Number) } })
  })

  test('Req 6.1, 6.2: the live cart lists live prices and adds the chosen variant to the cart', async ({ page }) => {
    const mocks = await setupLiveRoutes(page, { authenticated: true })
    const live = new LiveShoppingPage(page)
    await live.goto(SESSION_ID)
    await live.expectLoaded()

    await live.openCart()
    const item = live.cartSheet.getByTestId(`live-cart-item-${PRODUCT_ID}`)
    await expect(item.getByText('Giá live')).toBeVisible()
    await expect(item.getByText('25.990.000', { exact: false }).first()).toBeVisible()
    await expect(item.getByRole('link', { name: 'iPhone 16 Pro' })).toHaveAttribute('target', '_blank')
    await expect(live.stage).toBeAttached()

    await live.chooseProduct(PRODUCT_ID)
    await expect(live.cartSheet.getByText('Còn 7 suất giá live')).toBeVisible()
    await live.addToCart()
    await expect(page.getByText('Đã thêm sản phẩm vào giỏ hàng')).toBeVisible()
    expect(mocks.addedVariants).toEqual([VARIANT_ID])
  })

  test('Req 3.7: phones get a full-height vertical live stage (visual)', async ({ page }) => {
    await setupLiveRoutes(page, { authenticated: true })
    fs.mkdirSync(IMGS_DIR, { recursive: true })
    const live = new LiveShoppingPage(page)

    await page.setViewportSize({ width: 390, height: 844 })
    await live.goto(SESSION_ID)
    await live.expectLoaded()
    await expect(page.getByText('Còn màu titan không shop?').filter({ visible: true })).toBeVisible()
    const box = await live.stage.boundingBox()
    expect(box?.y).toBe(0)
    expect(box?.height).toBe(844)
    expect(box?.width).toBe(390)
    // trial clicks fail when another element covers the control
    await live.heartButton.click({ trial: true })
    await live.cartButton.click({ trial: true })
    await page.screenshot({ path: path.join(IMGS_DIR, '01-live-mobile-390x844.png') })

    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.locator('aside').getByText('Còn màu titan không shop?')).toBeVisible()
    await page.screenshot({ path: path.join(IMGS_DIR, '02-live-desktop-1440x900.png') })
  })
})
