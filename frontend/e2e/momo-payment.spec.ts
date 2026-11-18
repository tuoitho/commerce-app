// Contracts: API-ORDER-MOMO@1 (verifier); TYPE-ORDER-PAYMENT@1 (verifier)
// _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2_
import * as fs from 'node:fs'
import * as path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import {
  loadContractSnapshots,
  mountContractRoutes,
  type ContractRoute,
} from './fixtures/contract'
import {
  AdminOrdersPom,
  MomoCheckoutPom,
  MomoReturnPom,
  StorefrontOrdersPom,
  assertLayoutInvariants,
} from './pages/MomoPaymentPage'

const snapshots = loadContractSnapshots('momo-payment')

const imgsDir = fs.existsSync(path.resolve(process.cwd(), '.dream'))
  ? path.resolve(process.cwd(), '.dream', 'specs', 'momo-payment', 'imgs')
  : path.resolve(process.cwd(), '..', '.dream', 'specs', 'momo-payment', 'imgs')

const ADMIN_BASE = process.env.ADMIN_BASE_URL || 'http://localhost:15174'
const VALID_ORDER_ID = '44444444-4444-4444-4444-444444444444'
const PAID_ORDER_ID = '55555555-5555-5555-5555-555555555555'
const USER_ID = '11111111-1111-1111-1111-111111111111'
const ADDR_ID = '22222222-2222-2222-2222-222222222222'
const VARIANT_ID = '33333333-3333-3333-3333-333333333333'
const PRODUCT_ID = '66666666-6666-6666-6666-666666666666'

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="16" fill="#fce7f3"/>
  <rect x="28" y="14" width="40" height="68" rx="8" fill="#ae2070"/>
</svg>`

const CUSTOMER_USER = {
  id: USER_ID,
  email: 'buyer@auraphone.vn',
  role: 'customer',
  displayName: 'Nguyễn Văn A',
  phone: '0987654321',
  avatarUrl: null,
  createdAt: '2026-11-01T08:00:00Z',
}

const ADMIN_USER = {
  id: 'admin-1',
  email: 'admin@auraphone.vn',
  role: 'admin',
  displayName: 'Quản trị viên',
  phone: null,
  avatarUrl: null,
  createdAt: '2026-11-01T08:00:00Z',
}

function envelope(message: string, data: unknown) {
  return {
    success: true,
    message,
    data,
    error: null,
    meta: { timestamp: '2026-11-16T10:00:00Z' },
  }
}

interface StorefrontMockOptions {
  cartTotalVnd?: string
  createSnapshot?: 'create_order_momo_201' | 'create_order_momo_gateway_failed_201'
  orderDetailSnapshot?: 'get_order_momo_pending_200' | 'get_order_momo_paid_200'
  momoReturnScenario?: 'paid' | 'failed' | 'invalid_sig'
  pendingDeadlineFuture?: boolean
  onConfirmReturn?: () => void
  onRetryMomo?: () => void
  onCartRefresh?: () => void
}

async function setupStorefrontMomoRoutes(
  page: Page,
  options: StorefrontMockOptions = {}
): Promise<{ momoGatewayNavigations: string[] }> {
  const {
    cartTotalVnd = '3190000',
    createSnapshot = 'create_order_momo_201',
    orderDetailSnapshot = 'get_order_momo_pending_200',
    momoReturnScenario = 'paid',
    pendingDeadlineFuture = true,
  } = options

  const momoGatewayNavigations: string[] = []

  await page.addInitScript((user) => {
    localStorage.setItem('accessToken', 'mock-customer-jwt')
    localStorage.setItem('authUser', JSON.stringify(user))
  }, CUSTOMER_USER)

  await page.route('https://test-payment.momo.vn/**', async (route) => {
    momoGatewayNavigations.push(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<html><head><title>MoMo Sandbox</title></head><body><h1>MoMo Sandbox Gateway</h1></body></html>',
    })
  })

  await page.route(/\/media\/|example\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PLACEHOLDER_SVG })
  )
  await page.routeWebSocket(/\/api\/v1\/chat\/ws/, () => {})
  await page.routeWebSocket(/\/api\/v1\/live\/sessions\//, () => {})

  const pendingSnapshot = structuredClone(
    snapshots.snapshots.get_order_momo_pending_200.responseBody
  ) as { data: Record<string, unknown> }
  if (pendingDeadlineFuture) {
    pendingSnapshot.data.cancellableUntil = new Date(Date.now() + 14 * 60 * 1000).toISOString()
  }

  const failedReturnSnapshot = structuredClone(
    snapshots.snapshots.momo_return_failed_200.responseBody
  ) as { data: Record<string, unknown> }
  if (pendingDeadlineFuture) {
    failedReturnSnapshot.data.cancellableUntil = new Date(Date.now() + 14 * 60 * 1000).toISOString()
  }

  const listSnapshot = structuredClone(snapshots.snapshots.list_orders_200.responseBody) as {
    data: Array<Record<string, unknown>>
  }
  if (pendingDeadlineFuture && Array.isArray(listSnapshot.data) && listSnapshot.data.length > 0) {
    listSnapshot.data[0].cancellableUntil = new Date(Date.now() + 14 * 60 * 1000).toISOString()
  }

  const routes: ContractRoute[] = [
    { method: 'GET', path: '/api/v1/auth/me', stub: { status: 200, body: envelope('OK', CUSTOMER_USER) } },
    { method: 'GET', path: '/api/v1/categories', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/products/featured', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/products', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/brands', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/live/current', stub: { status: 200, body: envelope('OK', null) } },
    { method: 'GET', path: '/api/v1/favorites', stub: { status: 200, body: envelope('OK', []) } },
    {
      method: 'GET',
      path: '/api/v1/notifications',
      stub: { status: 200, body: envelope('OK', { items: [], unreadCount: 0 }) },
    },
    { method: 'GET', path: /^\/api\/v1\/chat\//, stub: { status: 200, body: envelope('OK', null) } },
    {
      method: 'GET',
      path: '/api/v1/cart',
      stub: () => {
        options.onCartRefresh?.()
        return {
          status: 200,
          body: envelope('OK', {
            items: [
              {
                id: 'cart-item-1',
                variantId: VARIANT_ID,
                productId: PRODUCT_ID,
                brandName: 'Apple',
                productName: 'iPhone 15 Pro',
                model: 'A3101',
                imageUrl: '/media/iphone.jpg',
                options: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan' }],
                unitPriceVnd: cartTotalVnd,
                lineTotalVnd: cartTotalVnd,
                stockQuantity: 10,
                quantity: 1,
                selected: true,
                availability: 'available',
              },
            ],
            totalUnits: 1,
            selectedLineCount: 1,
            selectedTotalVnd: cartTotalVnd,
            shippingFeeVnd: '0',
          }),
        }
      },
    },
    {
      method: 'GET',
      path: '/api/v1/addresses',
      stub: {
        status: 200,
        body: envelope('OK', [
          {
            id: ADDR_ID,
            recipientName: 'Nguyen Van A',
            phone: '0987654321',
            provinceCode: 1,
            provinceName: 'Hà Nội',
            wardCode: 101,
            wardName: 'Phúc Xá',
            detailAddress: '123 Cầu Giấy',
            isDefault: true,
          },
        ]),
      },
    },
    {
      method: 'GET',
      path: '/api/v1/provinces',
      stub: { status: 200, body: envelope('OK', [{ code: 1, name: 'Hà Nội' }]) },
    },
    {
      method: 'GET',
      path: '/api/v1/orders/stats',
      stub: {
        status: 200,
        body: envelope('OK', {
          pendingConfirmation: 1,
          awaitingPickup: 1,
          awaitingDelivery: 0,
          awaitingReview: 0,
        }),
      },
    },
    {
      method: 'POST',
      path: '/api/v1/orders',
      auth: 'bearer',
      requestSnapshot: createSnapshot,
      handle: () => ({ snapshot: createSnapshot }),
    },
    {
      method: 'GET',
      path: '/api/v1/orders',
      auth: 'bearer',
      handle: () => ({
        snapshot: 'list_orders_200',
        body: listSnapshot as unknown as Record<string, unknown>,
      }),
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/orders\/[^/]+$/,
      auth: 'bearer',
      handle: ({ url }) => {
        if (url.pathname.endsWith(PAID_ORDER_ID) || orderDetailSnapshot === 'get_order_momo_paid_200') {
          return { snapshot: 'get_order_momo_paid_200' }
        }
        return {
          snapshot: 'get_order_momo_pending_200',
          body: pendingSnapshot as unknown as Record<string, unknown>,
        }
      },
    },
    {
      method: 'POST',
      path: /^\/api\/v1\/orders\/[^/]+\/momo\/retry$/,
      auth: 'bearer',
      handle: () => {
        options.onRetryMomo?.()
        return { snapshot: 'retry_momo_200' }
      },
    },
    {
      method: 'POST',
      path: '/api/v1/payments/momo/return',
      auth: 'bearer',
      requestSnapshot:
        momoReturnScenario === 'paid'
          ? 'momo_return_paid_200'
          : momoReturnScenario === 'failed'
            ? 'momo_return_failed_200'
            : undefined,
      handle: () => {
        options.onConfirmReturn?.()
        if (momoReturnScenario === 'failed') {
          return {
            snapshot: 'momo_return_failed_200',
            body: failedReturnSnapshot as unknown as Record<string, unknown>,
          }
        }
        if (momoReturnScenario === 'invalid_sig') return { snapshot: 'momo_return_invalid_sig_400' }
        return { snapshot: 'momo_return_paid_200' }
      },
    },
  ]

  await mountContractRoutes(page, snapshots, routes)
  return { momoGatewayNavigations }
}

async function setupAdminMomoRoutes(page: Page): Promise<void> {
  await page.addInitScript((user) => {
    localStorage.setItem('accessToken', 'mock-admin-jwt')
    localStorage.setItem('authUser', JSON.stringify(user))
  }, ADMIN_USER)

  await page.route(/\/media\/|example\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PLACEHOLDER_SVG })
  )
  await page.routeWebSocket(/\/api\/v1\/chat\/ws/, () => {})

  const routes: ContractRoute[] = [
    { method: 'GET', path: '/api/v1/auth/me', stub: { status: 200, body: envelope('OK', ADMIN_USER) } },
    {
      method: 'GET',
      path: '/api/v1/notifications',
      stub: { status: 200, body: envelope('OK', { items: [], unreadCount: 0 }) },
    },
    {
      method: 'GET',
      path: '/api/v1/admin/chat/conversations',
      stub: { status: 200, body: envelope('OK', []) },
    },
    {
      method: 'GET',
      path: '/api/v1/admin/orders',
      auth: 'bearer',
      handle: () => ({ snapshot: 'admin_list_orders_200' }),
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/admin\/orders\/[^/]+$/,
      auth: 'bearer',
      handle: ({ url }) => {
        if (url.pathname.endsWith(VALID_ORDER_ID)) {
          return { snapshot: 'admin_order_detail_momo_pending_200' }
        }
        return { snapshot: 'admin_order_detail_momo_paid_200' }
      },
    },
  ]

  await mountContractRoutes(page, snapshots, routes)
}

test.describe('MoMo Payment Flow E2E — Mode 2 (Shape-Locked Mock E2E)', () => {
  test.beforeAll(() => {
    fs.mkdirSync(imgsDir, { recursive: true })
  })

  test('Req 5.1 & 5.2: Checkout locks MoMo above 50M VND, enables MoMo for eligible total, and redirects to payUrl or falls back when gateway fails', async ({
    page,
  }) => {
    // 1. Over-limit cart -> MoMo locked
    await page.setViewportSize({ width: 1440, height: 900 })
    await setupStorefrontMomoRoutes(page, { cartTotalVnd: '60000000' })
    const checkout = new MomoCheckoutPom(page)
    await checkout.goto()

    await expect(checkout.codRadio()).toBeChecked()
    await expect(checkout.momoRadio()).toBeDisabled()
    await expect(page.getByText(/Ví MoMo chỉ hỗ trợ đơn hàng từ 1\.000 ₫ đến 50\.000\.000 ₫/i)).toBeVisible()
    await assertLayoutInvariants(page, 'checkout-overlimit-desktop')
    await page.screenshot({ path: path.join(imgsDir, '01-checkout-momo-disabled-overlimit.png'), fullPage: true })
  })

  test('Req 5.1 & 5.2: Eligible Checkout with MoMo selected redirects to MoMo payUrl and verifies desktop/mobile layouts', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const { momoGatewayNavigations } = await setupStorefrontMomoRoutes(page, {
      cartTotalVnd: '3190000',
      createSnapshot: 'create_order_momo_201',
    })
    const checkout = new MomoCheckoutPom(page)
    await checkout.goto()

    await expect(checkout.momoRadio()).toBeEnabled()
    await checkout.momoRadio().click()
    await expect(checkout.momoRadio()).toBeChecked()
    await page.evaluate(() => window.scrollTo(0, 0))
    await assertLayoutInvariants(page, 'checkout-momo-selected-desktop')
    await page.screenshot({ path: path.join(imgsDir, '02-checkout-momo-selected-desktop.png'), fullPage: true })

    // Mobile width check
    await page.setViewportSize({ width: 375, height: 812 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await assertLayoutInvariants(page, 'checkout-momo-selected-mobile')
    await page.screenshot({ path: path.join(imgsDir, '03-checkout-momo-selected-mobile.png'), fullPage: true })

    await page.setViewportSize({ width: 1440, height: 900 })
    await checkout.submitButton().click()

    await expect.poll(() => momoGatewayNavigations.length).toBe(1)
    expect(momoGatewayNavigations[0]).toBe('https://test-payment.momo.vn/v2/gateway/pay?t=123')
  })

  test('Req 5.2: Gateway failure on Checkout creates failed order and navigates to order detail with warning toast', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await setupStorefrontMomoRoutes(page, {
      cartTotalVnd: '3190000',
      createSnapshot: 'create_order_momo_gateway_failed_201',
      orderDetailSnapshot: 'get_order_momo_pending_200',
    })
    const checkout = new MomoCheckoutPom(page)
    await checkout.goto()
    await checkout.selectMomoAndPlaceOrder()

    await expect(page).toHaveURL(new RegExp(`/orders/${VALID_ORDER_ID}$`))
    await expect(page.getByText(/Chưa thể chuyển đến cổng MoMo/i)).toBeVisible()
  })

  test('Req 5.3: /momo-return verifies callback once, refreshes cart, displays paid & failed states, and handles invalid signature 400', async ({
    page,
  }) => {
    const momoOrderId = `${VALID_ORDER_ID}_1763281800000`
    const paidQuery = `?partnerCode=MOMO&orderId=${momoOrderId}&requestId=${momoOrderId}&amount=3190000&orderInfo=Thanh+toan+don+hang&orderType=momo_wallet&transId=4088812345&resultCode=0&message=Th%C3%A0nh+c%C3%B4ng.&payType=qr&responseTime=1763281800000&extraData=&signature=mock-sig`
    const failedQuery = `?partnerCode=MOMO&orderId=${momoOrderId}&requestId=${momoOrderId}&amount=3190000&orderInfo=Thanh+toan+don+hang&orderType=momo_wallet&transId=0&resultCode=1006&message=Giao+d%E1%BB%8Bch+b%E1%BB%8B+t%E1%BB%AB+ch%E1%BB%91i.&payType=qr&responseTime=1763281800000&extraData=&signature=mock-fail-sig`

    let confirmCount = 0
    let cartFetchCount = 0
    await page.setViewportSize({ width: 1440, height: 900 })
    await setupStorefrontMomoRoutes(page, {
      momoReturnScenario: 'paid',
      onConfirmReturn: () => {
        confirmCount += 1
      },
      onCartRefresh: () => {
        cartFetchCount += 1
      },
    })

    const momoReturn = new MomoReturnPom(page)
    await momoReturn.gotoWithQuery(paidQuery)

    await expect(page.getByRole('heading', { name: 'Thanh toán MoMo thành công' })).toBeVisible()
    await expect(page.getByText('4088812345')).toBeVisible()
    await expect(page.getByText('3.190.000 ₫')).toBeVisible()
    expect(confirmCount).toBe(1)
    expect(cartFetchCount).toBeGreaterThanOrEqual(2)
    await assertLayoutInvariants(page, 'momo-return-paid-desktop')
    await page.screenshot({ path: path.join(imgsDir, '04-momo-return-paid-desktop.png'), fullPage: true })

    await page.setViewportSize({ width: 375, height: 812 })
    await assertLayoutInvariants(page, 'momo-return-paid-mobile')
    await page.screenshot({ path: path.join(imgsDir, '05-momo-return-paid-mobile.png'), fullPage: true })

    // Failed callback & Retry redirect
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    let retryCount = 0
    await page.setViewportSize({ width: 1440, height: 900 })
    const { momoGatewayNavigations } = await setupStorefrontMomoRoutes(page, {
      momoReturnScenario: 'failed',
      onRetryMomo: () => {
        retryCount += 1
      },
    })

    await momoReturn.gotoWithQuery(failedQuery)
    await expect(page.getByRole('heading', { name: 'Thanh toán MoMo chưa hoàn tất' })).toBeVisible()
    await expect(page.getByText(/Giao dịch bị từ chối/i)).toBeVisible()
    await expect(momoReturn.retryButton()).toBeVisible()
    await assertLayoutInvariants(page, 'momo-return-failed-desktop')
    await page.screenshot({ path: path.join(imgsDir, '06-momo-return-failed-desktop.png'), fullPage: true })

    await momoReturn.retryButton().click()
    await expect.poll(() => retryCount).toBe(1)
    await expect.poll(() => momoGatewayNavigations.length).toBe(1)
    expect(momoGatewayNavigations[0]).toBe('https://test-payment.momo.vn/v2/gateway/pay?t=retry')

    // Invalid signature 400 error state
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await setupStorefrontMomoRoutes(page, { momoReturnScenario: 'invalid_sig' })
    await momoReturn.gotoWithQuery(paidQuery)
    await expect(page.getByRole('heading', { name: 'Không thể xác thực thanh toán MoMo' })).toBeVisible()
    await expect(page.getByText('Dữ liệu xác thực thanh toán MoMo không hợp lệ')).toBeVisible()
  })

  test('Req 5.4 & 5.5: Storefront /orders list and /orders/:id render payment badges, transaction ID, countdown, and retry flow', async ({
    page,
  }) => {
    let retryCount = 0
    await page.setViewportSize({ width: 1440, height: 900 })
    const { momoGatewayNavigations } = await setupStorefrontMomoRoutes(page, {
      pendingDeadlineFuture: true,
      onRetryMomo: () => {
        retryCount += 1
      },
    })

    const ordersPom = new StorefrontOrdersPom(page)
    await ordersPom.gotoList()

    await expect(page.getByText('Ví MoMo', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Chờ thanh toán')).toBeVisible()
    await expect(page.getByText('Đã thanh toán')).toBeVisible()
    await expect(page.getByText(/4088812345/)).toBeVisible()
    await expect(page.getByText(/Hết hạn sau:/i)).toBeVisible()
    await assertLayoutInvariants(page, 'storefront-orders-list-desktop')
    await page.screenshot({ path: path.join(imgsDir, '07-storefront-orders-history-desktop.png'), fullPage: true })

    // Pending MoMo detail
    await ordersPom.gotoDetail(VALID_ORDER_ID)
    await expect(page.getByText('Ví điện tử MoMo', { exact: true })).toBeVisible()
    await expect(page.getByText('Chờ thanh toán')).toBeVisible()
    await expect(page.getByText(/Hạn thanh toán MoMo:/i)).toBeVisible()
    await expect(ordersPom.retryButton()).toBeVisible()
    await assertLayoutInvariants(page, 'storefront-order-detail-pending-desktop')
    await page.screenshot({
      path: path.join(imgsDir, '08-storefront-order-detail-momo-pending-desktop.png'),
      fullPage: true,
    })

    await page.setViewportSize({ width: 375, height: 812 })
    await assertLayoutInvariants(page, 'storefront-order-detail-pending-mobile')
    await page.screenshot({
      path: path.join(imgsDir, '09-storefront-order-detail-momo-pending-mobile.png'),
      fullPage: true,
    })

    // Paid MoMo detail
    await page.setViewportSize({ width: 1440, height: 900 })
    await ordersPom.gotoDetail(PAID_ORDER_ID)
    await expect(page.getByText('Đã thanh toán')).toBeVisible()
    await expect(page.getByText('4088812345')).toBeVisible()
    await expect(ordersPom.retryButton()).toHaveCount(0)
    await assertLayoutInvariants(page, 'storefront-order-detail-paid-desktop')
    await page.screenshot({
      path: path.join(imgsDir, '10-storefront-order-detail-momo-paid-desktop.png'),
      fullPage: true,
    })

    // Click retry from pending detail page
    await ordersPom.gotoDetail(VALID_ORDER_ID)
    await ordersPom.retryButton().click()
    await expect.poll(() => retryCount).toBe(1)
    await expect.poll(() => momoGatewayNavigations.length).toBe(1)
    expect(momoGatewayNavigations[0]).toBe('https://test-payment.momo.vn/v2/gateway/pay?t=retry')
  })

  test('Req 6.1 & 6.2: Admin Portal orders list and detail render payment method, status badges, paidAt, and MoMo transaction ID without payUrl', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await setupAdminMomoRoutes(page)
    const adminOrders = new AdminOrdersPom(page, ADMIN_BASE)

    await adminOrders.gotoList()
    await expect(page.getByRole('columnheader', { name: 'Thanh toán', exact: true })).toBeVisible()
    await expect(page.getByText('MoMo', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Chờ thanh toán')).toBeVisible()
    await expect(page.getByText('Đã thanh toán')).toBeVisible()
    await expect(page.getByText(/GD: 4088812345/)).toBeVisible()
    await assertLayoutInvariants(page, 'admin-orders-list-desktop')
    await page.screenshot({ path: path.join(imgsDir, '11-admin-orders-list-desktop.png'), fullPage: true })

    await adminOrders.gotoDetail(PAID_ORDER_ID)
    await expect(page.getByText('Ví điện tử MoMo')).toBeVisible()
    await expect(page.getByText('Đã thanh toán')).toBeVisible()
    await expect(page.getByText('4088812345')).toBeVisible()
    await expect(page.getByText('Thời điểm thanh toán')).toBeVisible()
    await expect(page.getByText(/payUrl|test-payment\.momo\.vn/i)).toHaveCount(0)
    await assertLayoutInvariants(page, 'admin-order-detail-paid-desktop')
    await page.screenshot({
      path: path.join(imgsDir, '12-admin-order-detail-momo-paid-desktop.png'),
      fullPage: true,
    })
  })
})
