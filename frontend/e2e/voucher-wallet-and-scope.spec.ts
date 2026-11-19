// Contracts: API-VOUCHER-ADMIN@1 (verifier); API-VOUCHER-CUSTOMER@1 (verifier); API-CHECKOUT-QUOTE-ORDER@1 (verifier)
// _Requirements: 1.5, 1.6, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 4.2, 4.6, 4.7_
import { test, expect, type Page } from '@playwright/test'
import {
  loadContractSnapshots,
  mountContractRoutes,
  type ContractRoute,
} from './fixtures/contract'
import {
  AdminVoucherScopePage,
  StorefrontVoucherWalletPage,
  voucherScreenshotPath,
} from './pages/VoucherWalletScopePage'

const snapshots = loadContractSnapshots('voucher-wallet-and-scope', {
  nullable: ['maxDiscountVnd', 'usageLimit', 'claimedAt', 'voucherCode', 'voucherType'],
})

const TS = '2026-11-18T12:00:00Z'

const ADMIN_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@auraphone.vn',
  role: 'admin',
  displayName: 'Quản trị viên',
  phone: '0900000001',
  avatarUrl: null,
  createdAt: TS,
}

const CUSTOMER_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'buyer@auraphone.vn',
  role: 'customer',
  displayName: 'Nguyễn Minh Anh',
  phone: '0987654321',
  avatarUrl: null,
  createdAt: TS,
}

const CAT_PHONE = { id: '22222222-2222-2222-2222-222222222221', name: 'Điện thoại' }
const CAT_LAPTOP = { id: '22222222-2222-2222-2222-222222222222', name: 'Laptop' }
const PROD_PHONE = '33333333-3333-3333-3333-333333333331'
const PROD_LAPTOP = '33333333-3333-3333-3333-333333333332'
const PROD_TABLET = '33333333-3333-3333-3333-333333333333'
const ADDRESS_HN_ID = '22222222-2222-2222-2222-222222222222'

function envelope<T>(message: string, data: T, metaExtra: Record<string, unknown> = {}) {
  return {
    success: true,
    message,
    data,
    error: null,
    meta: { timestamp: TS, ...metaExtra },
  }
}

async function seedAuth(page: Page, user: typeof CUSTOMER_USER | typeof ADMIN_USER, token: string) {
  await page.addInitScript(
    ({ u, t }) => {
      localStorage.setItem('accessToken', t)
      localStorage.setItem('authUser', JSON.stringify(u))
    },
    { u: user, t: token }
  )
}

function commonStorefrontStubs(): ContractRoute[] {
  return [
    { method: 'GET', path: '/api/v1/auth/me', stub: { status: 200, body: envelope('OK', CUSTOMER_USER) } },
    { method: 'GET', path: '/api/v1/categories', stub: { status: 200, body: envelope('OK', [CAT_PHONE, CAT_LAPTOP]) } },
    { method: 'GET', path: '/api/v1/favorites', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/favorites/ids', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/live/active', stub: { status: 200, body: envelope('OK', null) } },
    { method: 'GET', path: '/api/v1/live/current', stub: { status: 200, body: envelope('OK', null) } },
    {
      method: 'GET',
      path: '/api/v1/notifications',
      stub: { status: 200, body: envelope('OK', [], { pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false } }) },
    },
    { method: 'GET', path: '/api/v1/notifications/unread-count', stub: { status: 200, body: envelope('OK', { unreadCount: 0 }) } },
    { method: 'GET', path: '/api/v1/chat/unread-count', stub: { status: 200, body: envelope('OK', { unreadCount: 0 }) } },
    { method: 'GET', path: '/api/v1/chat/conversation', stub: { status: 200, body: envelope('OK', null) } },
    {
      method: 'GET',
      path: '/api/v1/provinces',
      stub: { status: 200, body: envelope('OK', [{ code: 1, name: 'Thành phố Hà Nội' }]) },
    },
    {
      method: 'GET',
      path: '/api/v1/cart',
      stub: {
        status: 200,
        body: envelope('OK', {
          items: [
            {
              id: 'ci-1',
              variantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
              productId: PROD_PHONE,
              categoryId: CAT_PHONE.id,
              brandName: 'Apple',
              productName: 'iPhone 16 Pro',
              model: 'A3294',
              imageUrl: '',
              options: [{ groupLabel: 'Dung lượng', valueLabel: '256GB' }],
              unitPriceVnd: '10000000',
              lineTotalVnd: '10000000',
              stockQuantity: 10,
              quantity: 1,
              selected: true,
              availability: 'available',
              isLivePrice: false,
              isFlashSalePrice: false,
            },
            {
              id: 'ci-2',
              variantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
              productId: PROD_LAPTOP,
              categoryId: CAT_LAPTOP.id,
              brandName: 'Dell',
              productName: 'Dell XPS 15',
              model: 'XPS9530',
              imageUrl: '',
              options: [{ groupLabel: 'RAM', valueLabel: '32GB' }],
              unitPriceVnd: '20000000',
              lineTotalVnd: '20000000',
              stockQuantity: 5,
              quantity: 1,
              selected: true,
              availability: 'available',
              isLivePrice: false,
              isFlashSalePrice: false,
            },
          ],
          totalUnits: 2,
          selectedLineCount: 2,
          selectedTotalVnd: '30000000',
          shippingFeeVnd: '0',
        }),
      },
    },
  ]
}

test.describe('Voucher Wallet & Scope Mode 2 E2E [Req 1.5, 1.6, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 4.6, 4.7]', () => {
  test('Admin configures category-scoped voucher and sees scope summary in list', async ({ page }) => {
    await seedAuth(page, ADMIN_USER, 'admin-jwt-token')

    const vouchersStore: Record<string, unknown>[] = []

    await mountContractRoutes(page, snapshots, [
      { method: 'GET', path: '/api/v1/auth/me', stub: { status: 200, body: envelope('OK', ADMIN_USER) } },
      { method: 'GET', path: '/api/v1/admin/categories', stub: { status: 200, body: envelope('OK', [CAT_PHONE, CAT_LAPTOP]) } },
      { method: 'GET', path: '/api/v1/admin/products', stub: { status: 200, body: envelope('OK', []) } },
      {
        method: 'GET',
        path: '/api/v1/notifications',
        stub: { status: 200, body: envelope('OK', [], { pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false } }) },
      },
      { method: 'GET', path: '/api/v1/notifications/unread-count', stub: { status: 200, body: envelope('OK', { unreadCount: 0 }) } },
      { method: 'GET', path: '/api/v1/admin/chat/unread-count', stub: { status: 200, body: envelope('OK', { unreadCount: 0 }) } },
      { method: 'GET', path: '/api/v1/admin/chat/conversations', stub: { status: 200, body: envelope('OK', []) } },
      {
        method: 'GET',
        path: '/api/v1/admin/vouchers',
        handle: () => ({
          snapshot: 'admin_voucher_list_200',
          body: envelope('Lấy danh sách mã giảm giá thành công', vouchersStore, {
            pagination: {
              page: 1,
              limit: 20,
              total: vouchersStore.length,
              totalPages: vouchersStore.length > 0 ? 1 : 0,
              hasNext: false,
              hasPrev: false,
            },
          }),
        }),
      },
      {
        method: 'POST',
        path: '/api/v1/admin/vouchers',
        handle: ({ body }) => {
          const payload = body as Record<string, unknown>
          const created = {
            id: 'dddddddd-dddd-dddd-dddd-ddddddddddd1',
            code: String(payload.code),
            title: String(payload.title),
            description: String(payload.description ?? ''),
            voucherType: String(payload.voucherType),
            scopeType: String(payload.scopeType ?? 'all'),
            scopeCategories: payload.scopeType === 'categories' ? [CAT_PHONE] : [],
            scopeProducts: [],
            discountValue: String(payload.discountValue),
            maxDiscountVnd: (payload.maxDiscountVnd as string | null) ?? null,
            minOrderVnd: String(payload.minOrderVnd ?? '0'),
            usageLimit: (payload.usageLimit as number | null) ?? null,
            usedCount: 0,
            perUserLimit: Number(payload.perUserLimit ?? 1),
            startsAt: String(payload.startsAt),
            endsAt: String(payload.endsAt),
            active: Boolean(payload.active),
            effectiveStatus: 'active',
            createdAt: TS,
            updatedAt: TS,
          }
          vouchersStore.unshift(created)
          return {
            snapshot: 'admin_voucher_create_categories_201',
            body: envelope('Tạo mã giảm giá thành công', created),
          }
        },
      },
    ])

    const adminPage = new AdminVoucherScopePage(page)
    await adminPage.goto()
    await adminPage.openCreateDialog()
    await adminPage.createCategoryVoucher({
      code: 'CAT15',
      title: 'Giảm 15% Điện thoại',
      discountValue: '15',
      minOrderVnd: '500000',
      startsAtLocal: '2026-11-18T10:00',
      endsAtLocal: '2026-12-31T23:59',
      categoryName: 'Điện thoại',
    })

    await expect(page.getByText('CAT15', { exact: true })).toBeVisible()
    await expect(page.getByText('Danh mục: Điện thoại')).toBeVisible()
    await page.screenshot({
      path: voucherScreenshotPath('01-admin-voucher-scope-desktop.png'),
      fullPage: true,
    })
  })

  test('Customer discovers, claims into wallet, filters wallet, and applies scoped voucher in checkout', async ({
    page,
  }) => {
    await seedAuth(page, CUSTOMER_USER, 'customer-jwt-token')

    let cat15Claimed = false
    const cat15Base = {
      id: 'dddddddd-dddd-dddd-dddd-ddddddddddd1',
      code: 'CAT15',
      title: 'Giảm 15% Điện thoại',
      description: 'Chỉ áp dụng cho danh mục Điện thoại',
      voucherType: 'percent',
      scopeType: 'categories',
      scopeCategories: [CAT_PHONE],
      scopeProducts: [],
      discountValue: '15',
      maxDiscountVnd: null,
      minOrderVnd: '500000',
      usageLimit: 100,
      usedCount: 0,
      perUserLimit: 2,
      userRemainingUses: 2,
      startsAt: '2026-11-18T11:00:00Z',
      endsAt: '2026-12-31T23:59:59Z',
    }

    const tabletMismatchVoucher = {
      id: 'dddddddd-dddd-dddd-dddd-ddddddddddd2',
      code: 'ONLYTAB',
      title: 'Giảm 200K cho Máy tính bảng',
      description: 'Chỉ áp dụng cho sản phẩm Tablet',
      voucherType: 'fixed_amount',
      scopeType: 'products',
      scopeCategories: [],
      scopeProducts: [{ id: PROD_TABLET, name: 'iPad Pro M4' }],
      discountValue: '200000',
      maxDiscountVnd: null,
      minOrderVnd: '0',
      usageLimit: 50,
      usedCount: 0,
      perUserLimit: 1,
      userRemainingUses: 1,
      startsAt: '2026-11-18T11:00:00Z',
      endsAt: '2026-12-31T23:59:59Z',
      claimedAt: TS,
      walletStatus: 'available',
    }

    await mountContractRoutes(page, snapshots, [
      ...commonStorefrontStubs(),
      {
        method: 'GET',
        path: '/api/v1/addresses',
        stub: {
          status: 200,
          body: envelope('OK', [
            {
              id: ADDRESS_HN_ID,
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
            },
          ]),
        },
      },
      {
        method: 'GET',
        path: '/api/v1/vouchers/discover',
        handle: () => ({
          snapshot: 'vouchers_discover_200',
          body: envelope('Lấy danh sách mã giảm giá đang phát hành thành công', [
            {
              ...cat15Base,
              claimed: cat15Claimed,
              claimedAt: cat15Claimed ? TS : null,
            },
          ]),
        }),
      },
      {
        method: 'POST',
        path: `/api/v1/vouchers/${cat15Base.id}/claim`,
        handle: () => {
          cat15Claimed = true
          return {
            snapshot: 'vouchers_claim_200',
            body: envelope('Lưu mã giảm giá vào ví thành công', {
              ...cat15Base,
              claimedAt: TS,
              walletStatus: 'available',
            }),
          }
        },
      },
      {
        method: 'GET',
        path: '/api/v1/vouchers/wallet',
        handle: ({ url }) => {
          const status = url.searchParams.get('status')
          const list = cat15Claimed
            ? [
                {
                  ...cat15Base,
                  claimedAt: TS,
                  walletStatus: 'available',
                },
                tabletMismatchVoucher,
              ]
            : [tabletMismatchVoucher]
          const filtered =
            status === 'used_up' ? [] : status === 'unavailable' ? [] : list
          return {
            snapshot: 'vouchers_wallet_200',
            body: envelope('Lấy ví mã giảm giá thành công', filtered),
          }
        },
      },
      {
        method: 'GET',
        path: '/api/v1/vouchers/available',
        handle: () => {
          const { walletStatus: _ws, ...tabletAvailable } = tabletMismatchVoucher
          return {
            snapshot: 'vouchers_available_200',
            body: envelope(
              'Lấy danh sách mã giảm giá khả dụng thành công',
              cat15Claimed
                ? [{ ...cat15Base, claimedAt: TS }, tabletAvailable]
                : [tabletAvailable]
            ),
          }
        },
      },
      {
        method: 'POST',
        path: '/api/v1/checkout/quote',
        handle: ({ body }) => {
          const payload = body as { voucherCode?: string }
          const code = (payload.voucherCode || '').trim().toUpperCase()
          if (code === 'UNCLAIMED99') {
            return {
              snapshot: 'checkout_quote_not_claimed_409',
              body: structuredClone(snapshots.snapshots.checkout_quote_not_claimed_409.responseBody),
            }
          }
          if (code === 'CAT15') {
            return {
              snapshot: 'checkout_quote_scoped_200',
              body: envelope('Báo giá đơn hàng thành công', {
                subtotalVnd: '30000000',
                eligibleSubtotalVnd: '10000000',
                deliveryMethod: 'standard',
                expressAvailable: true,
                standardShippingFeeVnd: '0',
                expressShippingFeeVnd: '60000',
                freeShippingThresholdVnd: '5000000',
                shippingFeeVnd: '0',
                voucherCode: 'CAT15',
                voucherType: 'percent',
                discountVnd: '1500000',
                totalVnd: '28500000',
              }),
            }
          }
          return {
            snapshot: 'checkout_quote_scoped_200',
            body: envelope('Báo giá đơn hàng thành công', {
              subtotalVnd: '30000000',
              eligibleSubtotalVnd: '30000000',
              deliveryMethod: 'standard',
              expressAvailable: true,
              standardShippingFeeVnd: '0',
              expressShippingFeeVnd: '60000',
              freeShippingThresholdVnd: '5000000',
              shippingFeeVnd: '0',
              voucherCode: null,
              voucherType: null,
              discountVnd: '0',
              totalVnd: '30000000',
            }),
          }
        },
      },
    ])

    const storefront = new StorefrontVoucherWalletPage(page)

    // 1. Discover & Claim into wallet
    await storefront.gotoDiscover()
    await expect(page.getByText('CAT15', { exact: true })).toBeVisible()
    await expect(page.getByText('Danh mục: Điện thoại')).toBeVisible()
    await storefront.claimVoucherByCode('CAT15')
    await expect(page.getByText('Đã lưu vào ví')).toBeVisible()
    await page.screenshot({
      path: voucherScreenshotPath('02-customer-voucher-hub-desktop.png'),
      fullPage: true,
    })

    // 2. Switch to Wallet tab & verify mobile responsive layout
    await storefront.switchToWalletTab()
    await expect(page.getByText('CAT15')).toBeVisible()
    await expect(page.getByText('Khả dụng').first()).toBeVisible()

    await page.setViewportSize({ width: 375, height: 812 })
    await page.screenshot({
      path: voucherScreenshotPath('03-customer-voucher-wallet-mobile.png'),
      fullPage: true,
    })
    await page.setViewportSize({ width: 1440, height: 900 })

    // 3. Checkout: verify mismatched voucher disabled, unclaimed manual code rejected (409), and CAT15 scoped quote applied
    await storefront.gotoCheckout()
    await expect(page.getByText('Không có sản phẩm áp dụng trong giỏ')).toBeVisible()
    await expect(page.getByTestId('apply-voucher-ONLYTAB')).toBeDisabled()

    await storefront.applyManualCode('UNCLAIMED99')
    await expect(
      page.getByText('Bạn cần lưu mã giảm giá vào ví trước khi sử dụng')
    ).toBeVisible()

    await storefront.applyWalletVoucher('CAT15')
    await expect(page.getByText(/Tính trên 10\.000\.000/)).toBeVisible()
    await page.screenshot({
      path: voucherScreenshotPath('04-checkout-scoped-quote-desktop.png'),
      fullPage: true,
    })
  })
})
