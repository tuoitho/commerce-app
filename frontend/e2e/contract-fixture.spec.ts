import { test, expect, type Page } from '@playwright/test'
import {
  assertMatchesContractShape,
  mountContractRoutes,
  type ContractRoute,
  type ContractSnapshotDocument,
} from './fixtures/contract'

const meta = { timestamp: '2026-01-01T00:00:00Z' }

const snapshots: ContractSnapshotDocument = {
  feature: 'contract-fixture',
  nullable: ['parentId'],
  snapshots: {
    unauthenticated_401: {
      contractId: 'API-ITEMS@1',
      endpoint: 'GET /api/v1/items',
      status: 401,
      responseBody: {
        success: false,
        message: 'Chưa đăng nhập',
        data: null,
        error: { code: 'unauthenticated', message: 'Chưa đăng nhập' },
        meta,
      },
    },
    list_items_200: {
      contractId: 'API-ITEMS@1',
      endpoint: 'GET /api/v1/items',
      status: 200,
      responseBody: {
        success: true,
        message: 'OK',
        data: { items: [{ id: 'item-1', name: 'Mẫu', parentId: null }] },
        error: null,
        meta,
      },
    },
    create_item_201: {
      contractId: 'API-ITEMS@1',
      endpoint: 'POST /api/v1/items',
      status: 201,
      requestBody: { name: 'Mẫu', parentId: null },
      responseBody: {
        success: true,
        message: 'Đã tạo',
        data: { id: 'item-1', name: 'Mẫu', parentId: null },
        error: null,
        meta,
      },
    },
  },
}

const createItemRoute: ContractRoute = {
  method: 'POST',
  path: '/api/v1/items',
  auth: 'bearer',
  requestSnapshot: 'create_item_201',
  handle: ({ body }) => {
    const template = snapshots.snapshots.create_item_201.responseBody
    const sent = body as { name: string }
    return {
      snapshot: 'create_item_201',
      body: { ...template, data: { id: 'item-2', name: sent.name, parentId: 'item-1' } },
    }
  },
}

async function openBlankPage(page: Page): Promise<void> {
  await page.route('**/blank.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' })
  )
  await page.goto('/blank.html')
}

interface ApiResult {
  status: number
  body: any
}

// status 0 means the request never received a response.
async function callApi(
  page: Page,
  method: string,
  path: string,
  init: { token?: string; body?: unknown } = {}
): Promise<ApiResult> {
  return page.evaluate(
    async ({ method, path, token, body }) => {
      try {
        const response = await fetch(path, {
          method,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        })
        return { status: response.status, body: await response.json() }
      } catch {
        return { status: 0, body: null }
      }
    },
    { method, path, token: init.token, body: init.body }
  )
}

test.describe('mountContractRoutes', () => {
  test('reports an API request that no route declares', async ({ page }) => {
    const violations: string[] = []
    await mountContractRoutes(page, snapshots, [], (violation) => violations.push(violation))
    await openBlankPage(page)

    const result = await callApi(page, 'GET', '/api/v1/unknown?page=1')

    expect(result.status).toBe(0)
    expect(violations).toEqual(['Unmocked API request: GET /api/v1/unknown'])
  })

  test('fails the running test when a violation is not collected by the caller', async ({ page }) => {
    test.fail()
    await mountContractRoutes(page, snapshots, [])
    await openBlankPage(page)

    await callApi(page, 'GET', '/api/v1/unknown')
  })

  test('answers a bearer route without a token from the unauthenticated snapshot', async ({ page }) => {
    const violations: string[] = []
    let handled = false
    await mountContractRoutes(
      page,
      snapshots,
      [
        {
          method: 'GET',
          path: '/api/v1/items',
          auth: 'bearer',
          handle: () => {
            handled = true
            return { snapshot: 'list_items_200' }
          },
        },
      ],
      (violation) => violations.push(violation)
    )
    await openBlankPage(page)

    const anonymous = await callApi(page, 'GET', '/api/v1/items')
    expect(anonymous.status).toBe(401)
    expect(anonymous.body.error.code).toBe('unauthenticated')
    expect(handled).toBe(false)

    const authenticated = await callApi(page, 'GET', '/api/v1/items', { token: 'customer-token' })
    expect(authenticated.status).toBe(200)
    expect(authenticated.body.data.items).toHaveLength(1)
    expect(violations).toEqual([])
  })

  test('rejects a request body key the recorded request does not have', async ({ page }) => {
    const violations: string[] = []
    await mountContractRoutes(page, snapshots, [createItemRoute], (violation) =>
      violations.push(violation)
    )
    await openBlankPage(page)

    const result = await callApi(page, 'POST', '/api/v1/items', {
      token: 'customer-token',
      body: { title: 'Sai tên trường' },
    })

    expect(result.status).toBe(0)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('POST /api/v1/items')
    expect(violations[0]).toContain('"title"')
  })

  test('accepts a request body that omits recorded keys and returns the handler reply', async ({
    page,
  }) => {
    const violations: string[] = []
    await mountContractRoutes(page, snapshots, [createItemRoute], (violation) =>
      violations.push(violation)
    )
    await openBlankPage(page)

    const result = await callApi(page, 'POST', '/api/v1/items', {
      token: 'customer-token',
      body: { name: 'Mục mới' },
    })

    expect(result.status).toBe(201)
    expect(result.body.data).toEqual({ id: 'item-2', name: 'Mục mới', parentId: 'item-1' })
    expect(violations).toEqual([])
  })

  test('rejects a reply whose shape drifts from the snapshot', async ({ page }) => {
    const violations: string[] = []
    await mountContractRoutes(
      page,
      snapshots,
      [
        {
          method: 'GET',
          path: /^\/api\/v1\/items\/[^/]+$/,
          handle: () => ({
            snapshot: 'create_item_201',
            body: {
              ...snapshots.snapshots.create_item_201.responseBody,
              data: { id: 'item-1', name: 'Mẫu', parentId: null, invented: true },
            },
          }),
        },
      ],
      (violation) => violations.push(violation)
    )
    await openBlankPage(page)

    const result = await callApi(page, 'GET', '/api/v1/items/item-1')

    expect(result.status).toBe(0)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('GET /api/v1/items/item-1')
    expect(violations[0]).toContain('key set mismatch')
  })

  test('serves a declared stub as written', async ({ page }) => {
    const violations: string[] = []
    await mountContractRoutes(
      page,
      snapshots,
      [{ method: 'GET', path: '/api/v1/categories', stub: { status: 200, body: { data: [] } } }],
      (violation) => violations.push(violation)
    )
    await openBlankPage(page)

    const result = await callApi(page, 'GET', '/api/v1/categories')

    expect(result).toEqual({ status: 200, body: { data: [] } })
    expect(violations).toEqual([])
  })

  test('serves a stub computed from the request', async ({ page }) => {
    const violations: string[] = []
    await mountContractRoutes(
      page,
      snapshots,
      [
        {
          method: 'GET',
          path: /^\/api\/v1\/orders\/[^/]+$/,
          stub: ({ url }) => ({ status: 200, body: { id: url.pathname.split('/').pop() } }),
        },
      ],
      (violation) => violations.push(violation)
    )
    await openBlankPage(page)

    const result = await callApi(page, 'GET', '/api/v1/orders/order-7')

    expect(result).toEqual({ status: 200, body: { id: 'order-7' } })
    expect(violations).toEqual([])
  })
})

test.describe('assertMatchesContractShape', () => {
  test('rejects null where the snapshot holds a value, and a value where it holds null', () => {
    expect(() => assertMatchesContractShape({ name: null }, { name: 'Mẫu' })).toThrow(/name/)
    expect(() => assertMatchesContractShape({ name: 'Mẫu' }, { name: null })).toThrow(/name/)
  })

  test('accepts a null difference on a key declared nullable', () => {
    expect(() =>
      assertMatchesContractShape({ parentId: 'item-1' }, { parentId: null }, '$', ['parentId'])
    ).not.toThrow()
    expect(() =>
      assertMatchesContractShape({ parentId: null }, { parentId: 'item-1' }, '$', ['parentId'])
    ).not.toThrow()
  })

  test('accepts null on both sides without a declaration', () => {
    expect(() => assertMatchesContractShape({ error: null }, { error: null })).not.toThrow()
  })
})
