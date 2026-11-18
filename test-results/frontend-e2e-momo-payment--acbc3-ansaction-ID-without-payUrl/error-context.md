# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: frontend\e2e\momo-payment.spec.ts >> MoMo Payment Flow E2E — Mode 2 (Shape-Locked Mock E2E) >> Req 6.1 & 6.2: Admin Portal orders list and detail render payment method, status badges, paidAt, and MoMo transaction ID without payUrl
- Location: frontend\e2e\momo-payment.spec.ts:529:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:15174/orders
Call log:
  - navigating to "http://localhost:15174/orders", waiting until "load"

```

# Test source

```ts
  1  | import { expect, type Page } from '@playwright/test'
  2  | 
  3  | export async function assertLayoutInvariants(page: Page, contextLabel: string): Promise<void> {
  4  |   const noOverflow = await page.evaluate(
  5  |     () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  6  |   )
  7  |   expect(noOverflow, `Horizontal overflow detected at ${contextLabel}`).toBe(true)
  8  | 
  9  |   const brokenImages = await page.evaluate(() =>
  10 |     Array.from(document.querySelectorAll('img'))
  11 |       .filter((img) => {
  12 |         const style = window.getComputedStyle(img)
  13 |         return style.display !== 'none' && style.visibility !== 'hidden'
  14 |       })
  15 |       .filter((img) => !img.complete || img.naturalWidth === 0)
  16 |       .map((img) => img.src)
  17 |   )
  18 |   expect(brokenImages, `Broken images detected at ${contextLabel}`).toEqual([])
  19 | }
  20 | 
  21 | export class MomoCheckoutPom {
  22 |   constructor(private readonly page: Page) {}
  23 | 
  24 |   async goto(): Promise<void> {
  25 |     await this.page.goto('/checkout')
  26 |     await expect(this.page.getByRole('heading', { name: 'Thanh Toán Đơn Hàng' })).toBeVisible()
  27 |   }
  28 | 
  29 |   codRadio() {
  30 |     return this.page.locator('#payment-cod')
  31 |   }
  32 | 
  33 |   momoRadio() {
  34 |     return this.page.locator('#payment-momo')
  35 |   }
  36 | 
  37 |   submitButton() {
  38 |     return this.page.getByRole('button', { name: /Đặt hàng/i })
  39 |   }
  40 | 
  41 |   async selectMomoAndPlaceOrder(): Promise<void> {
  42 |     await expect(this.momoRadio()).toBeEnabled()
  43 |     await this.momoRadio().click()
  44 |     await expect(this.momoRadio()).toBeChecked()
  45 |     await this.submitButton().click()
  46 |   }
  47 | }
  48 | 
  49 | export class MomoReturnPom {
  50 |   constructor(private readonly page: Page) {}
  51 | 
  52 |   async gotoWithQuery(query: string): Promise<void> {
  53 |     await this.page.goto(`/momo-return${query}`)
  54 |   }
  55 | 
  56 |   retryButton() {
  57 |     return this.page.getByRole('button', { name: /Thanh toán lại qua MoMo/i })
  58 |   }
  59 | }
  60 | 
  61 | export class StorefrontOrdersPom {
  62 |   constructor(private readonly page: Page) {}
  63 | 
  64 |   async gotoList(): Promise<void> {
  65 |     await this.page.goto('/orders')
  66 |     await expect(this.page.getByRole('heading', { name: 'Lịch sử mua hàng' })).toBeVisible()
  67 |   }
  68 | 
  69 |   async gotoDetail(orderId: string): Promise<void> {
  70 |     await this.page.goto(`/orders/${orderId}`)
  71 |     await expect(this.page.getByRole('heading', { name: 'Chi tiết đơn hàng' })).toBeVisible()
  72 |   }
  73 | 
  74 |   retryButton() {
  75 |     return this.page.getByRole('button', { name: /Thanh toán lại qua MoMo/i })
  76 |   }
  77 | }
  78 | 
  79 | export class AdminOrdersPom {
  80 |   constructor(
  81 |     private readonly page: Page,
  82 |     private readonly adminBaseUrl: string
  83 |   ) {}
  84 | 
  85 |   async gotoList(): Promise<void> {
> 86 |     await this.page.goto(`${this.adminBaseUrl}/orders`)
     |                     ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:15174/orders
  87 |     await expect(this.page.getByRole('heading', { name: 'Quản lý đơn hàng' })).toBeVisible()
  88 |   }
  89 | 
  90 |   async gotoDetail(orderId: string): Promise<void> {
  91 |     await this.page.goto(`${this.adminBaseUrl}/orders/${orderId}`)
  92 |     await expect(this.page.getByRole('heading', { name: new RegExp(`Đơn hàng #${orderId}`) })).toBeVisible()
  93 |   }
  94 | }
  95 | 
```