// Contracts: API-ACCOUNT@1 (verifier); TYPE-USER-PUBLIC@1 (verifier); API-ADDRESSES@1 (verifier)
// _Requirements: 1.1, 1.2, 1.4, 2.3, 3.1, 3.3, 4.2, 5.4, 7.1_

import * as fs from 'node:fs'
import * as path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import {
  loadContractSnapshots,
  mountContractRoutes,
  type ContractRoute,
} from './fixtures/contract'
import { AccountPageObject } from './pages/AccountPage'

const snapshots = loadContractSnapshots('customer-account', {
  nullable: ['displayName', 'phone', 'avatarUrl'],
})

const imgsDir = fs.existsSync(path.resolve(process.cwd(), '.dream'))
  ? path.resolve(process.cwd(), '.dream', 'specs', 'customer-account', 'imgs')
  : path.resolve(process.cwd(), '..', '.dream', 'specs', 'customer-account', 'imgs')

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

const USER_ID = '11111111-1111-1111-1111-111111111111'
const INITIAL_AVATAR_KEY = '550e8400-e29b-41d4-a716-446655440000.png'
const UPLOADED_AVATAR_KEY = 'c217c8fb-51a3-474f-8616-1aa01d7300df.png'

interface InMemAddress {
  id: string
  userId: string
  recipientName: string
  phone: string
  provinceCode: number
  provinceName: string
  wardCode: number
  wardName: string
  detailAddress: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

function envelope(message: string, data: unknown) {
  return {
    success: true,
    message,
    data,
    error: null,
    meta: { timestamp: '2026-11-16T06:00:00Z' },
  }
}

function snapshotCopy<T = Record<string, unknown>>(key: string): T {
  return structuredClone(snapshots.snapshots[key].responseBody) as T
}

async function assertLayoutInvariants(page: Page): Promise<void> {
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  )
  expect(noOverflow, 'Horizontal overflow detected').toBe(true)

  const brokenImages = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img'))
      .filter((img) => {
        const s = window.getComputedStyle(img)
        return s.display !== 'none' && s.visibility !== 'hidden'
      })
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.src)
  )
  expect(brokenImages).toEqual([])
}

interface MockState {
  authenticated: boolean
  tokenCounter: number
  currentToken: string
  user: {
    id: string
    email: string
    role: string
    displayName: string | null
    phone: string | null
    avatarUrl: string | null
  }
  addresses: InMemAddress[]
  nextAddrNum: number
  cartItems: unknown[]
  apiCalls: string[]
}

async function setupAccountE2E(
  page: Page,
  options: {
    authenticated: boolean
    displayName?: string | null
    phone?: string | null
    avatarUrl?: string | null
    initialAddresses?: InMemAddress[]
    withCartItem?: boolean
  }
): Promise<MockState> {
  const state: MockState = {
    authenticated: options.authenticated,
    tokenCounter: 1,
    currentToken: 'jwt-customer-1',
    user: {
      id: USER_ID,
      email: 'khach@example.com',
      role: 'customer',
      displayName: options.displayName ?? 'Nguyễn Minh Anh',
      phone: options.phone ?? '0912345678',
      avatarUrl: options.avatarUrl ?? null,
    },
    addresses: options.initialAddresses ? structuredClone(options.initialAddresses) : [],
    nextAddrNum: 100,
    cartItems: options.withCartItem
      ? [
          {
            id: 'ci-1',
            variantId: 'var-1',
            productId: 'prod-1',
            brandName: 'Apple',
            productName: 'iPhone 16 Pro Max',
            model: '256GB',
            imageUrl: '/media/avatars/' + INITIAL_AVATAR_KEY,
            options: [{ groupLabel: 'Màu', valueLabel: 'Titan' }],
            unitPriceVnd: '29990000',
            lineTotalVnd: '29990000',
            stockQuantity: 10,
            quantity: 1,
            selected: true,
            availability: 'available',
          },
        ]
      : [],
    apiCalls: [],
  }

  await page.addInitScript(
    ({ authenticated, token, user }) => {
      if (authenticated) {
        localStorage.setItem('accessToken', token)
        localStorage.setItem('authUser', JSON.stringify(user))
      } else {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('authUser')
      }
    },
    {
      authenticated: options.authenticated,
      token: state.currentToken,
      user: state.user,
    }
  )

  await page.routeWebSocket(/\/api\/v1\/chat\/ws/, () => {})

  await page.route('**/media/avatars/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: TINY_PNG,
    })
  })

  const makeAuthBody = (key: string) => {
    const body = snapshotCopy<{ data: { user: unknown; accessToken: string } }>(key)
    body.data.user = structuredClone(state.user)
    body.data.accessToken = state.currentToken
    return body as unknown as Record<string, unknown>
  }

  const makeMeBody = () => {
    const body = snapshotCopy<{ data: unknown }>('auth_me_200')
    body.data = structuredClone(state.user)
    return body as unknown as Record<string, unknown>
  }

  const makeUserEnvelope = (key: string) => {
    const body = snapshotCopy<{ data: unknown }>(key)
    body.data = structuredClone(state.user)
    return body as unknown as Record<string, unknown>
  }

  const routes: ContractRoute[] = [
    {
      method: 'POST',
      path: '/api/v1/auth/login',
      requestSnapshot: 'auth_login_200',
      handle: () => {
        state.apiCalls.push('POST /api/v1/auth/login')
        state.authenticated = true
        return { snapshot: 'auth_login_200', body: makeAuthBody('auth_login_200') }
      },
    },
    {
      method: 'POST',
      path: '/api/v1/auth/refresh',
      handle: () => {
        state.apiCalls.push('POST /api/v1/auth/refresh')
        return { snapshot: 'auth_refresh_200', body: makeAuthBody('auth_refresh_200') }
      },
    },
    {
      method: 'GET',
      path: '/api/v1/auth/me',
      auth: 'bearer',
      handle: () => {
        state.apiCalls.push('GET /api/v1/auth/me')
        return { snapshot: 'auth_me_200', body: makeMeBody() }
      },
    },
    {
      method: 'GET',
      path: '/api/v1/account/profile',
      auth: 'bearer',
      handle: () => {
        state.apiCalls.push('GET /api/v1/account/profile')
        return { snapshot: 'get_profile_200', body: makeUserEnvelope('get_profile_200') }
      },
    },
    {
      method: 'PUT',
      path: '/api/v1/account/profile',
      auth: 'bearer',
      requestSnapshot: 'update_profile_200',
      handle: ({ body }) => {
        state.apiCalls.push('PUT /api/v1/account/profile')
        const payload = body as { displayName: string | null; phone: string | null }
        state.user = {
          ...state.user,
          displayName: payload.displayName,
          phone: payload.phone,
        }
        return { snapshot: 'update_profile_200', body: makeUserEnvelope('update_profile_200') }
      },
    },
    {
      method: 'POST',
      path: '/api/v1/account/avatar',
      auth: 'bearer',
      handle: () => {
        state.apiCalls.push('POST /api/v1/account/avatar')
        state.user = {
          ...state.user,
          avatarUrl: `/media/avatars/${UPLOADED_AVATAR_KEY}`,
        }
        return { snapshot: 'upload_avatar_200', body: makeUserEnvelope('upload_avatar_200') }
      },
    },
    {
      method: 'DELETE',
      path: '/api/v1/account/avatar',
      auth: 'bearer',
      handle: () => {
        state.apiCalls.push('DELETE /api/v1/account/avatar')
        state.user = {
          ...state.user,
          avatarUrl: null,
        }
        return { snapshot: 'delete_avatar_200', body: makeUserEnvelope('delete_avatar_200') }
      },
    },
    {
      method: 'PUT',
      path: '/api/v1/account/password',
      auth: 'bearer',
      requestSnapshot: 'change_password_200',
      handle: () => {
        state.apiCalls.push('PUT /api/v1/account/password')
        state.tokenCounter += 1
        state.currentToken = `jwt-customer-${state.tokenCounter}`
        return { snapshot: 'change_password_200', body: makeAuthBody('change_password_200') }
      },
    },
    {
      method: 'GET',
      path: '/api/v1/provinces',
      handle: () => ({ snapshot: 'provinces_list_200' }),
    },
    {
      method: 'GET',
      path: /^\/api\/v1\/provinces\/\d+\/wards$/,
      handle: () => ({ snapshot: 'wards_list_200' }),
    },
    {
      method: 'GET',
      path: '/api/v1/addresses',
      auth: 'bearer',
      handle: () => {
        state.apiCalls.push('GET /api/v1/addresses')
        const body = snapshotCopy<{ data: InMemAddress[] }>('addresses_list_200')
        body.data = structuredClone(state.addresses)
        return { snapshot: 'addresses_list_200', body: body as unknown as Record<string, unknown> }
      },
    },
    {
      method: 'POST',
      path: '/api/v1/addresses',
      auth: 'bearer',
      requestSnapshot: 'address_create_201',
      handle: ({ body }) => {
        state.apiCalls.push('POST /api/v1/addresses')
        const input = body as {
          recipientName: string
          phone: string
          provinceCode: number
          wardCode: number
          detailAddress: string
          isDefault?: boolean
        }
        const becomeDefault = Boolean(input.isDefault) || state.addresses.length === 0
        if (becomeDefault) {
          state.addresses = state.addresses.map((a) => ({ ...a, isDefault: false }))
        }
        state.nextAddrNum += 1
        const created: InMemAddress = {
          id: `addr-${state.nextAddrNum}`,
          userId: USER_ID,
          recipientName: input.recipientName,
          phone: input.phone,
          provinceCode: input.provinceCode,
          provinceName: 'Thành phố Hà Nội',
          wardCode: input.wardCode,
          wardName: 'Phường Ba Đình',
          detailAddress: input.detailAddress,
          isDefault: becomeDefault,
          createdAt: '2026-11-16T06:00:00Z',
          updatedAt: '2026-11-16T06:00:00Z',
        }
        state.addresses.unshift(created)
        const reply = snapshotCopy<{ data: InMemAddress }>('address_create_201')
        reply.data = structuredClone(created)
        return { snapshot: 'address_create_201', body: reply as unknown as Record<string, unknown> }
      },
    },
    {
      method: 'PUT',
      path: /^\/api\/v1\/addresses\/[^/]+$/,
      auth: 'bearer',
      requestSnapshot: 'address_update_200',
      handle: ({ url, body }) => {
        const id = url.pathname.split('/').pop() || ''
        const input = body as {
          recipientName: string
          phone: string
          provinceCode: number
          wardCode: number
          detailAddress: string
          isDefault?: boolean
        }
        if (input.isDefault) {
          state.addresses = state.addresses.map((a) => ({ ...a, isDefault: false }))
        }
        let updatedAddr: InMemAddress | undefined
        state.addresses = state.addresses.map((a) => {
          if (a.id !== id) return a
          updatedAddr = {
            ...a,
            recipientName: input.recipientName,
            phone: input.phone,
            provinceCode: input.provinceCode,
            wardCode: input.wardCode,
            detailAddress: input.detailAddress,
            isDefault: Boolean(input.isDefault),
            updatedAt: '2026-11-16T06:05:00Z',
          }
          return updatedAddr
        })
        const reply = snapshotCopy<{ data: InMemAddress }>('address_update_200')
        reply.data = structuredClone(updatedAddr!)
        return { snapshot: 'address_update_200', body: reply as unknown as Record<string, unknown> }
      },
    },
    {
      method: 'PATCH',
      path: /^\/api\/v1\/addresses\/[^/]+\/default$/,
      auth: 'bearer',
      handle: ({ url }) => {
        const parts = url.pathname.split('/')
        const id = parts[parts.length - 2]
        let chosen: InMemAddress | undefined
        state.addresses = state.addresses.map((a) => {
          const next = { ...a, isDefault: a.id === id }
          if (next.isDefault) chosen = next
          return next
        })
        const reply = snapshotCopy<{ data: InMemAddress }>('address_set_default_200')
        reply.data = structuredClone(chosen!)
        return { snapshot: 'address_set_default_200', body: reply as unknown as Record<string, unknown> }
      },
    },
    {
      method: 'DELETE',
      path: /^\/api\/v1\/addresses\/[^/]+$/,
      auth: 'bearer',
      handle: ({ url }) => {
        const id = url.pathname.split('/').pop() || ''
        state.addresses = state.addresses.filter((a) => a.id !== id)
        return { snapshot: 'address_delete_200' }
      },
    },
    // Ambient Storefront routes outside customer-account contracts
    { method: 'GET', path: '/api/v1/categories', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/products/featured', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/products', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/brands', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: '/api/v1/live/current', stub: { status: 200, body: envelope('OK', null) } },
    {
      method: 'GET',
      path: '/api/v1/cart',
      stub: () => ({
        status: 200,
        body: envelope('OK', {
          items: state.cartItems,
          totalUnits: state.cartItems.length,
          selectedLineCount: state.cartItems.length,
          selectedTotalVnd: state.cartItems.length > 0 ? '29990000' : '0',
          shippingFeeVnd: '0',
        }),
      }),
    },
    { method: 'GET', path: '/api/v1/favorites', stub: { status: 200, body: envelope('OK', []) } },
    { method: 'GET', path: /^\/api\/v1\/chat\//, stub: { status: 200, body: envelope('OK', null) } },
    {
      method: 'GET',
      path: '/api/v1/notifications',
      stub: { status: 200, body: envelope('OK', { items: [], unreadCount: 0 }) },
    },
  ]

  await mountContractRoutes(page, snapshots, routes)
  return state
}

test.describe('Customer Account Center — Mode 2 (Shape-Locked Mock E2E)', () => {
  test.beforeAll(() => {
    fs.mkdirSync(imgsDir, { recursive: true })
  })

  test('Req 1.2: redirects unauthenticated /account?tab=addresses through /login and lands back on target tab', async ({
    page,
  }) => {
    await setupAccountE2E(page, { authenticated: false })

    await page.goto('/account?tab=addresses')
    await expect(page).toHaveURL(/\/login\?redirect=%2Faccount%3Ftab%3Daddresses/)

    await page.getByPlaceholder('name@example.com').fill('khach@example.com')
    await page.getByPlaceholder('••••••••').fill('password123')
    await page.getByRole('main').getByRole('button', { name: /Đăng nhập/i }).click()

    await expect(page).toHaveURL(/\/account\?tab=addresses/)
    await expect(page.getByRole('tab', { name: /Sổ địa chỉ/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  test('Req 1.1, 1.4, 2.3, 3.1, 3.3, 7.1: Header renders without extra profile fetch, updates live on profile/avatar edit, and fits 1440px/375px', async ({
    page,
  }) => {
    const state = await setupAccountE2E(page, {
      authenticated: true,
      displayName: 'Nguyễn Minh Anh',
      phone: '0912345678',
      avatarUrl: null,
    })
    const ui = new AccountPageObject(page)

    await page.goto('/')
    await expect(ui.headerAccountLink).toBeVisible()
    await expect(ui.headerAccountLink).toContainText('Nguyễn Minh Anh')
    expect(state.apiCalls).not.toContain('GET /api/v1/account/profile')

    await ui.headerAccountLink.click()
    await expect(page).toHaveURL(/\/account/)
    await expect(ui.emailInput).toHaveValue('khach@example.com')

    // Switch tab -> reload keeps tab via ?tab=
    await ui.passwordTab.click()
    await expect(page).toHaveURL(/\/account\?tab=password/)
    await page.reload()
    await expect(ui.passwordTab).toHaveAttribute('aria-selected', 'true')

    // Update profile -> Header updates immediately
    await ui.profileTab.click()
    await ui.displayNameInput.fill('Trần Bảo Ngọc')
    await ui.phoneInput.fill('0987654321')
    await ui.saveProfileButton.click()

    await expect(ui.headerAccountLink).toContainText('Trần Bảo Ngọc')

    // Upload avatar -> visible image loads in AccountPage and Header
    await ui.avatarFileInput.setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    })
    await expect(ui.headerAccountLink.locator('img')).toHaveAttribute(
      'src',
      `/media/avatars/${UPLOADED_AVATAR_KEY}`
    )

    await page.setViewportSize({ width: 1440, height: 900 })
    await assertLayoutInvariants(page)
    await page.screenshot({ path: path.join(imgsDir, 'account-profile-desktop.png'), fullPage: true })

    await page.setViewportSize({ width: 375, height: 812 })
    await assertLayoutInvariants(page)
    await page.screenshot({ path: path.join(imgsDir, 'account-profile-mobile.png'), fullPage: true })

    // Delete avatar -> fallback initial restored
    await page.setViewportSize({ width: 1440, height: 900 })
    await ui.deleteAvatarButton.click()
    await expect(ui.headerAccountLink.locator('img')).toHaveCount(0)
  })

  test('Req 4.2, 7.1: changing password rotates session and keeps user signed in across reload', async ({
    page,
  }) => {
    await setupAccountE2E(page, { authenticated: true })
    const ui = new AccountPageObject(page)

    await ui.goto('password')
    await expect(ui.passwordTab).toHaveAttribute('aria-selected', 'true')

    await page.setViewportSize({ width: 1440, height: 900 })
    await assertLayoutInvariants(page)
    await page.screenshot({ path: path.join(imgsDir, 'account-password-desktop.png'), fullPage: true })

    await page.setViewportSize({ width: 375, height: 812 })
    await assertLayoutInvariants(page)
    await page.screenshot({ path: path.join(imgsDir, 'account-password-mobile.png'), fullPage: true })

    await page.setViewportSize({ width: 1440, height: 900 })
    await ui.currentPasswordInput.fill('oldpassword1')
    await ui.newPasswordInput.fill('newpassword123')
    await ui.confirmNewPasswordInput.fill('newpassword123')
    await ui.changePasswordButton.click()

    await expect(ui.currentPasswordInput).toHaveValue('')
    await expect(ui.newPasswordInput).toHaveValue('')

    const rotatedToken = await page.evaluate(() => localStorage.getItem('accessToken'))
    expect(rotatedToken).toBe('jwt-customer-2')

    await page.reload()
    await expect(ui.passwordTab).toHaveAttribute('aria-selected', 'true')
  })

  test('Req 5.4, 7.1: manages addresses in /account?tab=addresses and reflects default address in /checkout', async ({
    page,
  }) => {
    await setupAccountE2E(page, {
      authenticated: true,
      withCartItem: true,
      initialAddresses: [
        {
          id: 'addr-1',
          userId: USER_ID,
          recipientName: 'Nguyễn Văn Cũ',
          phone: '0901112222',
          provinceCode: 1,
          provinceName: 'Thành phố Hà Nội',
          wardCode: 4,
          wardName: 'Phường Ba Đình',
          detailAddress: 'Số 10 Kim Mã',
          isDefault: true,
          createdAt: '2026-11-15T00:00:00Z',
          updatedAt: '2026-11-15T00:00:00Z',
        },
      ],
    })
    const ui = new AccountPageObject(page)

    await ui.goto('addresses')
    await expect(ui.addressCard('addr-1')).toBeVisible()

    // Add second address & set as default
    await ui.addAddressButton.click()
    await page.getByLabel(/Họ và tên người nhận/i).fill('Nguyễn Minh Anh')
    await page.getByLabel(/Số điện thoại/i).fill('0987654321')
    await page.getByLabel(/Tỉnh \/ Thành phố/i).selectOption('1')
    await page.getByLabel(/Phường \/ Xã/i).selectOption('4')
    await page.getByLabel(/Địa chỉ chi tiết/i).fill('Số 88 Tràng Tiền')
    await page.getByRole('button', { name: 'Lưu địa chỉ' }).click()

    await expect(page.getByText('Số 88 Tràng Tiền')).toBeVisible()

    // Edit newly created address (addr-101)
    await page.getByLabel('Sửa địa chỉ Nguyễn Minh Anh').click()
    await page.getByLabel(/Địa chỉ chi tiết/i).fill('Số 99 Tràng Tiền')
    await page.getByRole('button', { name: 'Cập nhật địa chỉ' }).click()
    await expect(page.getByText(/Số 99 Tràng Tiền/)).toBeVisible()

    // Promote addr-101 to default
    await ui.addressCard('addr-101').getByRole('button', { name: 'Đặt mặc định' }).click()
    await expect(ui.addressCard('addr-101')).toContainText('Mặc định')

    // Delete old addr-1 via confirmation dialog
    await page.getByLabel('Xóa địa chỉ Nguyễn Văn Cũ').click()
    await ui.confirmDeleteButton.click()
    await expect(ui.addressCard('addr-1')).toHaveCount(0)

    await page.setViewportSize({ width: 1440, height: 900 })
    await assertLayoutInvariants(page)
    await page.screenshot({ path: path.join(imgsDir, 'account-addresses-desktop.png'), fullPage: true })

    await page.setViewportSize({ width: 375, height: 812 })
    await assertLayoutInvariants(page)
    await page.screenshot({ path: path.join(imgsDir, 'account-addresses-mobile.png'), fullPage: true })

    // Navigate to /checkout and verify default address synced
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/checkout')
    await expect(page.getByText(/Số 99 Tràng Tiền/).first()).toBeVisible()
  })
})
