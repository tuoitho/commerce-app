import type { Page } from '@playwright/test'

export const appleId = '11111111-1111-4111-8111-111111111111'
export const productId = '22222222-2222-4222-8222-222222222222'
export const variantId = '33333333-3333-4333-8333-333333333333'
export const itemId = '44444444-4444-4444-8444-444444444444'
const storageGroupId = '77777777-7777-4777-8777-777777777777'
const colourGroupId = '88888888-8888-4888-8888-888888888888'
const storage128Id = '99999999-9999-4999-8999-999999999999'
const storage256Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const blackId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const blueId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="320"%3E%3Crect width="100%25" height="100%25" fill="%23e5e7eb"/%3E%3C/svg%3E'

export const productSummary = {
  id: productId,
  name: 'Test Phone Pro',
  model: 'TP-1',
  brand: { id: appleId, name: 'Apple' },
  minPriceVnd: '12000000',
  maxPriceVnd: '14000000',
  primaryImageUrl: image,
  inStock: true,
}

export const productDetail = {
  ...productSummary,
  description: 'A deterministic phone fixture for browser tests.',
  imageUrls: [image],
  featured: true,
  optionGroups: [
    { id: storageGroupId, label: 'Storage', position: 1, values: [{ id: storage128Id, label: '128 GB' }, { id: storage256Id, label: '256 GB' }] },
    { id: colourGroupId, label: 'Colour', position: 2, values: [{ id: blackId, label: 'Black' }, { id: blueId, label: 'Blue' }] },
  ],
  variants: [
    { id: variantId, optionValueIds: { [storageGroupId]: storage128Id, [colourGroupId]: blackId }, priceVnd: '12000000', stockQuantity: 3 },
    { id: '55555555-5555-4555-8555-555555555555', optionValueIds: { [storageGroupId]: storage256Id, [colourGroupId]: blueId }, priceVnd: '14000000', stockQuantity: 2 },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function cart(selected = true, quantity = 1) {
  const lineTotal = String(12000000 * quantity)
  return {
    items: [{ id: itemId, variantId, productId, brandName: 'Apple', productName: productSummary.name, model: 'TP-1', imageUrl: image, options: [{ groupLabel: 'Storage', valueLabel: '128 GB' }], unitPriceVnd: '12000000', lineTotalVnd: lineTotal, stockQuantity: 3, quantity, selected, availability: 'available' }],
    totalUnits: quantity,
    selectedLineCount: selected ? 1 : 0,
    selectedTotalVnd: selected ? lineTotal : '0',
  }
}

export async function installFixtures(page: Page, fixtureErrors: string[]) {
  let loggedIn = false
  let currentCart = cart(false)

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v1', '')
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    const fail = async (message: string) => {
      fixtureErrors.push(`${request.method()} ${url.pathname}: ${message}`)
      await route.abort('failed')
    }
    const body = (): Record<string, unknown> | null => {
      try {
        const value = request.postDataJSON()
        return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
      } catch {
        return null
      }
    }

    if (path === '/auth/refresh' && request.method() === 'POST') return json(loggedIn ? { user: { id: 'user-1', email: 'buyer@example.com' }, accessToken: 'test-token' } : {})
    if (path === '/auth/me' && request.method() === 'GET') return loggedIn ? json({ user: { id: 'user-1', email: 'buyer@example.com' } }) : json({ detail: { code: 'unauthorized', message: 'Not signed in' } }, 401)
    if (path === '/auth/login' && request.method() === 'POST') {
      const loginBody = body()
      if (typeof loginBody?.email !== 'string' || typeof loginBody.password !== 'string') return fail('invalid login request shape')
      loggedIn = true
      return json({ user: { id: 'user-1', email: 'buyer@example.com' }, accessToken: 'test-token' })
    }
    if (path === '/auth/logout' && request.method() === 'POST') { loggedIn = false; return route.fulfill({ status: 204 }) }
    if (path === '/categories' && request.method() === 'GET') return json({ categories: [{ id: appleId, name: 'Apple' }, { id: '66666666-6666-4666-8666-666666666666', name: 'Xiaomi' }] })
    if (path === '/products/featured' && request.method() === 'GET') return json({ products: [productSummary] })
    if (path === '/products' && request.method() === 'GET') return json({ products: [productSummary] })
    if (path === `/products/${productId}` && request.method() === 'GET') return json(productDetail)
    if (path.startsWith('/products/') && request.method() === 'GET') return json({ detail: { code: 'product_not_found', message: 'Product not found' } }, 404)
    if (path === '/cart' && request.method() === 'GET') return loggedIn ? json({ cart: currentCart }) : json({ detail: { code: 'unauthorized', message: 'Not signed in' } }, 401)
    if (path === '/cart/items' && request.method() === 'POST') {
      if (!loggedIn) return json({ detail: { code: 'unauthorized', message: 'Not signed in' } }, 401)
      const addBody = body()
      if (addBody?.variantId !== variantId) return fail('invalid add request shape')
      currentCart = cart()
      return json({ cart: currentCart })
    }
    if (path === '/cart/selection' && request.method() === 'PUT') {
      if (!loggedIn) return json({ detail: { code: 'unauthorized', message: 'Not signed in' } }, 401)
      const selectionBody = body()
      if (typeof selectionBody?.selected !== 'boolean') return fail('invalid select-all request shape')
      currentCart = cart(selectionBody.selected)
      return json({ cart: currentCart })
    }
    if (path.startsWith('/cart/items/') && path.endsWith('/selection') && request.method() === 'PATCH') {
      if (!loggedIn) return json({ detail: { code: 'unauthorized', message: 'Not signed in' } }, 401)
      const selectionBody = body()
      if (typeof selectionBody?.selected !== 'boolean') return fail('invalid item selection request shape')
      currentCart = cart(selectionBody.selected)
      return json({ cart: currentCart })
    }
    if (path.startsWith('/cart/items/') && request.method() === 'DELETE') {
      if (!loggedIn) return json({ detail: { code: 'unauthorized', message: 'Not signed in' } }, 401)
      currentCart = { items: [], totalUnits: 0, selectedLineCount: 0, selectedTotalVnd: '0' }
      return json({ cart: currentCart })
    }
    if (path.startsWith('/cart/items/') && request.method() === 'PUT') {
      if (!loggedIn) return json({ detail: { code: 'unauthorized', message: 'Not signed in' } }, 401)
      const quantityBody = body()
      if (typeof quantityBody?.quantity !== 'number') return fail('invalid quantity request shape')
      currentCart = cart(true, quantityBody.quantity)
      return json({ cart: currentCart })
    }
    await fail('unhandled API request')
  })
}
