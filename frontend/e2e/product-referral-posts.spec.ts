// Contracts: API-POST-MEDIA@1 (verifier); API-POSTS-ADMIN@1 (verifier); API-POSTS-PUBLIC@2 (verifier); API-NOTIFICATIONS@2 (verifier); WS-NOTIFICATIONS@2 (verifier); TYPE-POST-DOMAIN@2 (verifier)
// _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3_

import * as fs from 'node:fs'
import * as path from 'node:path'
import { test, expect, type Page, type BrowserContext, type WebSocketRoute } from '@playwright/test'
import {
  loadContractSnapshots,
  fulfillFromContractSnapshot,
  assertMatchesContractShape,
} from './fixtures/contract'
import { StorefrontPostsPage } from './pages/StorefrontPostsPage'
import { AdminPostsPage } from './pages/AdminPostsPage'

const snapshots = loadContractSnapshots('product-referral-posts')
const imgsDir = fs.existsSync(path.resolve(process.cwd(), '.dream'))
  ? path.resolve(process.cwd(), '.dream', 'specs', 'product-referral-posts', 'imgs')
  : path.resolve(process.cwd(), '..', '.dream', 'specs', 'product-referral-posts', 'imgs')
const testImagePath = fs.existsSync(path.resolve(process.cwd(), 'e2e', 'fixtures', 'test-image.png'))
  ? path.resolve(process.cwd(), 'e2e', 'fixtures', 'test-image.png')
  : path.resolve(process.cwd(), 'frontend', 'e2e', 'fixtures', 'test-image.png')

const STOREFRONT_BASE = process.env.BASE_URL || 'http://localhost:15173'
const ADMIN_BASE = process.env.ADMIN_BASE_URL || 'http://localhost:15174'

interface InMemReactionSummary {
  totalCount: number
  counts: Record<string, number>
  viewerReaction: string | null
}

interface InMemComment {
  id: string
  postId: string
  authorId: string
  authorName: string
  authorRole: string
  content: string
  parentId: string | null
  replyToUserId: string | null
  replyToUserName: string | null
  reactions: InMemReactionSummary
  replies?: InMemComment[]
  createdAt: string
  updatedAt: string
}

interface InMemPost {
  id: string
  authorId: string
  authorName: string
  authorRole: string
  content: string
  media: Array<{
    id: string
    fileType: string
    fileName: string
    fileSize: number
    mimeType: string
    fileUrl: string
    position: number
  }>
  referredProducts: Array<{
    id: string
    name: string
    brand: string
    price: string
    currency: string
    imageUrl: string
    inStock: boolean
    active: boolean
  }>
  reactions: InMemReactionSummary
  commentCount: number
  comments: InMemComment[]
  createdAt: string
  updatedAt: string
}

interface InMemNotificationActor {
  id: string
  name: string
  role: string
}

interface InMemNotification {
  id: string
  category: string
  notificationType: string
  recipientId: string
  actorId: string
  actorName: string
  actorRole: string
  actorCount: number
  groupKey: string
  postId: string | null
  commentId: string | null
  reactionType: string | null
  excerpt: string
  metadata: {
    recentActors: InMemNotificationActor[]
  }
  isRead: boolean
  createdAt: string
  updatedAt: string
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth
  })
  expect(hasOverflow, 'Horizontal overflow detected on viewport').toBe(false)
}

function createInitialState() {
  const postGolden = structuredClone(snapshots.snapshots.get_post_detail_200.responseBody.data) as unknown as InMemPost
  const notifGolden = structuredClone(snapshots.snapshots.list_notifications_200.responseBody.data.items[0]) as unknown as InMemNotification

  return {
    posts: [postGolden],
    notifications: [notifGolden],
    unreadCount: 1,
    connectedSockets: [] as WebSocketRoute[],
  }
}

test.describe('Product Referral Posts E2E Verification (Mode 2: Contract-Verified Mock E2E)', () => {
  test.beforeAll(() => {
    fs.mkdirSync(imgsDir, { recursive: true })
  })

  test('Complete Lifecycle across Admin Portal (:15174) & Storefront (:15173) [Req 1.1–8.3]', async ({
    browser,
  }) => {
    const state = createInitialState()

    const adminContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    const storefrontContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
    })

    const adminPage = await adminContext.newPage()
    const storefrontPage = await storefrontContext.newPage()

    // -------------------------------------------------------------------------
    // Setup Mock Authentication & Common Routes for Admin (:15174)
    // -------------------------------------------------------------------------
    await adminPage.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-jwt-admin-token')
      localStorage.setItem(
        'authUser',
        JSON.stringify({
          id: '11111111-1111-1111-1111-111111111111',
          email: 'admin@auraphone.vn',
          role: 'admin',
          createdAt: '2026-01-01T00:00:00Z',
        })
      )
    })

    // Setup Admin Network Mocking
    await adminPage.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Lấy thông tin người dùng thành công',
          data: {
            id: '11111111-1111-1111-1111-111111111111',
            email: 'admin@auraphone.vn',
            role: 'admin',
            createdAt: '2026-01-01T00:00:00Z',
          },
          error: null,
          meta: { timestamp: new Date().toISOString() },
        }),
      })
    })

    await adminPage.route('**/api/v1/admin/chat/conversations*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], error: null, meta: { timestamp: new Date().toISOString() } }),
      })
    })

    await adminPage.route('**/api/v1/admin/products*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Lấy danh sách sản phẩm thành công',
          data: [
            {
              id: '77777777-7777-7777-7777-777777777777',
              name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên',
              brand: 'Apple',
              price: 29990000,
              currency: 'VND',
              primaryImageUrl: 'https://example.com/products/iphone15.jpg',
              inStock: true,
              active: true,
            },
          ],
          error: null,
          meta: { timestamp: new Date().toISOString() },
        }),
      })
    })

    // -------------------------------------------------------------------------
    // Setup Mock Authentication & Common Routes for Storefront (:15173)
    // -------------------------------------------------------------------------
    await storefrontPage.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-jwt-customer-token')
      localStorage.setItem(
        'authUser',
        JSON.stringify({
          id: '22222222-2222-2222-2222-222222222222',
          email: 'khachhang@auraphone.vn',
          role: 'customer',
          createdAt: '2026-01-01T00:00:00Z',
        })
      )
    })

    await storefrontPage.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Lấy thông tin người dùng thành công',
          data: {
            id: '22222222-2222-2222-2222-222222222222',
            email: 'khachhang@auraphone.vn',
            role: 'customer',
            createdAt: '2026-01-01T00:00:00Z',
          },
          error: null,
          meta: { timestamp: new Date().toISOString() },
        }),
      })
    })

    await storefrontPage.route('**/api/v1/categories', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Lấy danh mục thành công',
          data: [{ id: 'cat-apple', name: 'Apple iPhone' }],
          error: null,
          meta: { timestamp: new Date().toISOString() },
        }),
      })
    })

    await storefrontPage.route('**/api/v1/cart', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Thành công',
          data: { items: [], total: 0 },
          error: null,
          meta: { timestamp: new Date().toISOString() },
        }),
      })
    })

    await storefrontPage.route('**/api/v1/chat/conversations*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], error: null, meta: { timestamp: new Date().toISOString() } }),
      })
    })

    await storefrontPage.route('**/api/v1/products/77777777-7777-7777-7777-777777777777/reviews*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Lấy danh sách đánh giá thành công',
          data: {
            summary: {
              totalReviews: 1,
              averageRating: '5.0',
              ratingCounts: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 1 },
            },
            reviews: [
              {
                id: 'rev-1',
                rating: 5,
                comment: 'Máy chính hãng VNA rất đẹp, camera chụp siêu nét và giao hàng nhanh.',
                reviewer: { maskedEmail: 'kh***@auraphone.vn' },
                purchase: {
                  model: 'A3106',
                  options: [{ groupLabel: 'Dung lượng', valueLabel: '256GB' }],
                },
                media: [],
                createdAt: '2026-10-20T09:00:00Z',
                helpfulness: { helpfulCount: 3, unhelpfulCount: 0, viewerVote: null },
              },
            ],
          },
          error: null,
          meta: {
            timestamp: new Date().toISOString(),
            pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1 },
          },
        }),
      })
    })

    await storefrontPage.route('**/api/v1/favorites*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Thành công',
          data: { isFavorite: false, items: [] },
          error: null,
          meta: { timestamp: new Date().toISOString() },
        }),
      })
    })

    await storefrontPage.route('**/api/v1/products/77777777-7777-7777-7777-777777777777', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Lấy chi tiết sản phẩm thành công',
          data: {
            id: '77777777-7777-7777-7777-777777777777',
            name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên',
            model: 'A3106',
            brand: 'Apple',
            category: { id: 'cat-1', name: 'Điện thoại' },
            minPriceVnd: '29990000',
            maxPriceVnd: '29990000',
            price: '29990000',
            currency: 'VND',
            stockQuantity: 15,
            inStock: true,
            featured: true,
            description: 'Siêu phẩm flagship từ Apple với khung viền Titanium cấp 5 và chip A17 Pro mạnh mẽ.',
            imageUrls: ['/api/v1/posts/media/66666666-6666-6666-6666-666666666666'],
            optionGroups: [
              {
                id: 'opt-storage',
                label: 'Dung lượng',
                position: 0,
                values: [{ id: 'val-256', label: '256GB' }],
              },
            ],
            variants: [
              {
                id: 'var-1',
                optionValueIds: { 'opt-storage': 'val-256' },
                priceVnd: '29990000',
                stockQuantity: 15,
                active: true,
              },
            ],
            createdAt: '2026-10-20T08:00:00Z',
            updatedAt: '2026-10-20T08:00:00Z',
          },
          error: null,
          meta: { timestamp: new Date().toISOString() },
        }),
      })
    })

    // -------------------------------------------------------------------------
    // Shared Stateful Handler for Post & Notification Routes across both pages
    // -------------------------------------------------------------------------
    const registerPostAndNotificationRoutes = async (page: Page) => {
      // WebSocket handler for notifications
      await page.routeWebSocket('**/api/v1/chat/ws*', (ws) => {
        state.connectedSockets.push(ws)
        ws.onClose(() => {
          const idx = state.connectedSockets.indexOf(ws)
          if (idx !== -1) state.connectedSockets.splice(idx, 1)
        })
      })

      // Image placeholder for media
      await page.route(/\/api\/v1\/posts\/media\/[^/]+$/, async (route) => {
        if (fs.existsSync(testImagePath)) {
          const buf = fs.readFileSync(testImagePath)
          await route.fulfill({ status: 200, contentType: 'image/png', body: buf })
        } else {
          await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('') })
        }
      })

      // Upload media
      await page.route(/\/api\/v1\/admin\/posts\/media$/, async (route) => {
        expect(route.request().method()).toBe('POST')
        expect(route.request().headers()['authorization']).toMatch(/^Bearer .+/)
        await fulfillFromContractSnapshot(route, snapshots, 'upload_media_201')
      })

      // Single notification mark read
      await page.route(/\/api\/v1\/notifications\/[^/]+\/read$/, async (route) => {
        expect(route.request().method()).toBe('POST')
        expect(route.request().headers()['authorization']).toMatch(/^Bearer .+/)
        const url = route.request().url()
        const idMatch = url.match(/\/notifications\/([^/]+)\/read/)
        const notifId = idMatch ? idMatch[1] : ''

        const target = state.notifications.find((n) => n.id === notifId)
        if (target && !target.isRead) {
          target.isRead = true
          state.unreadCount = Math.max(0, state.unreadCount - 1)
        }

        const body = structuredClone(snapshots.snapshots.mark_notification_read_200.responseBody)
        body.data.id = notifId
        body.data.isRead = true
        body.data.unreadCount = state.unreadCount
        await fulfillFromContractSnapshot(route, snapshots, 'mark_notification_read_200', body)
      })

      // Notifications mark all read
      await page.route(/\/api\/v1\/notifications\/read-all$/, async (route) => {
        expect(route.request().method()).toBe('POST')
        expect(route.request().headers()['authorization']).toMatch(/^Bearer .+/)
        for (const n of state.notifications) {
          n.isRead = true
        }
        state.unreadCount = 0
        const body = structuredClone(snapshots.snapshots.mark_all_notifications_read_200.responseBody)
        body.data.unreadCount = 0
        await fulfillFromContractSnapshot(route, snapshots, 'mark_all_notifications_read_200', body)
      })

      // Notifications List
      await page.route(/\/api\/v1\/notifications(?:\?.*)?$/, async (route) => {
        if (route.request().method() === 'GET') {
          expect(route.request().headers()['authorization']).toMatch(/^Bearer .+/)
          const body = structuredClone(snapshots.snapshots.list_notifications_200.responseBody)
          body.data.items = state.notifications as any
          body.data.unreadCount = state.unreadCount
          await fulfillFromContractSnapshot(route, snapshots, 'list_notifications_200', body)
        }
      })

      // Comment reaction
      await page.route(/\/api\/v1\/post-comments\/[^/]+\/reactions$/, async (route) => {
        expect(route.request().method()).toBe('PUT')
        expect(route.request().headers()['authorization']).toMatch(/^Bearer .+/)
        const reqData = route.request().postDataJSON() as { reaction: string | null }
        const reaction = reqData.reaction

        const url = route.request().url()
        const match = url.match(/\/post-comments\/([^/]+)\/reactions/)
        const commentId = match ? match[1] : ''

        let foundComment: InMemComment | undefined
        for (const p of state.posts) {
          for (const c of p.comments) {
            if (c.id === commentId) {
              foundComment = c
              break
            }
            if (c.replies) {
              for (const r of c.replies) {
                if (r.id === commentId) {
                  foundComment = r
                  break
                }
              }
            }
            if (foundComment) break
          }
          if (foundComment) break
        }

        if (foundComment) {
          const prev = foundComment.reactions.viewerReaction
          if (prev && foundComment.reactions.counts[prev] !== undefined) {
            foundComment.reactions.counts[prev] = Math.max(0, foundComment.reactions.counts[prev] - 1)
            foundComment.reactions.totalCount = Math.max(0, foundComment.reactions.totalCount - 1)
          }
          if (reaction) {
            foundComment.reactions.counts[reaction] = (foundComment.reactions.counts[reaction] || 0) + 1
            foundComment.reactions.totalCount += 1
          }
          foundComment.reactions.viewerReaction = reaction
        }

        const body = structuredClone(snapshots.snapshots.set_comment_reaction_200.responseBody)
        body.data = (foundComment ? foundComment.reactions : body.data) as any
        await fulfillFromContractSnapshot(route, snapshots, 'set_comment_reaction_200', body)
      })

      // Post reaction
      await page.route(/\/api\/v1\/posts\/[^/]+\/reactions$/, async (route) => {
        expect(route.request().method()).toBe('PUT')
        expect(route.request().headers()['authorization']).toMatch(/^Bearer .+/)
        const reqData = route.request().postDataJSON() as { reaction: string | null }
        const reaction = reqData.reaction

        const validReactions = ['like', 'love', 'haha', 'wow', 'sad', 'angry', null]
        if (!validReactions.includes(reaction)) {
          await fulfillFromContractSnapshot(route, snapshots, 'post_reaction_validation_400')
          return
        }

        const url = route.request().url()
        const match = url.match(/\/posts\/([^/]+)\/reactions/)
        const postId = match ? match[1] : ''
        const post = state.posts.find((p) => p.id === postId)

        if (post) {
          const prevReaction = post.reactions.viewerReaction
          if (prevReaction && post.reactions.counts[prevReaction] !== undefined) {
            post.reactions.counts[prevReaction] = Math.max(0, post.reactions.counts[prevReaction] - 1)
            post.reactions.totalCount = Math.max(0, post.reactions.totalCount - 1)
          }
          if (reaction) {
            post.reactions.counts[reaction] = (post.reactions.counts[reaction] || 0) + 1
            post.reactions.totalCount += 1
          }
          post.reactions.viewerReaction = reaction
        }

        const body = structuredClone(snapshots.snapshots.set_post_reaction_200.responseBody)
        body.data = (post ? post.reactions : body.data) as any
        await fulfillFromContractSnapshot(route, snapshots, 'set_post_reaction_200', body)
      })

      // Comments create and delete
      await page.route(/\/api\/v1\/posts\/[^/]+\/comments(?:\/[^/?]+)?$/, async (route) => {
        const method = route.request().method()
        const url = route.request().url()
        const match = url.match(/\/posts\/([^/]+)\/comments(?:\/([^?]+))?/)
        const postId = match ? match[1] : ''
        const commentId = match && match[2] ? match[2] : ''

        const post = state.posts.find((p) => p.id === postId)

        if (method === 'POST') {
          expect(route.request().headers()['authorization']).toMatch(/^Bearer .+/)
          const reqData = route.request().postDataJSON() as {
            content: string
            parentCommentId?: string | null
          }

          if (!reqData.content || reqData.content.trim().length === 0 || reqData.content.length > 1000) {
            await fulfillFromContractSnapshot(route, snapshots, 'comment_validation_400')
            return
          }

          const newId = `comment-${Date.now()}`
          let parentId: string | null = null
          let replyToUserId: string | null = null
          let replyToUserName: string | null = null

          if (reqData.parentCommentId && post) {
            for (const root of post.comments) {
              if (root.id === reqData.parentCommentId) {
                parentId = root.id
                replyToUserId = root.authorId
                replyToUserName = root.authorName
                break
              }
              if (root.replies) {
                for (const rep of root.replies) {
                  if (rep.id === reqData.parentCommentId) {
                    parentId = root.id
                    replyToUserId = rep.authorId
                    replyToUserName = rep.authorName
                    break
                  }
                }
              }
            }
          }

          const newComment: InMemComment = {
            id: newId,
            postId,
            authorId: '22222222-2222-2222-2222-222222222222',
            authorName: 'Nguyễn Văn A',
            authorRole: 'customer',
            content: reqData.content.trim(),
            parentId,
            replyToUserId,
            replyToUserName,
            reactions: { totalCount: 0, counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }, viewerReaction: null },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

          if (post) {
            post.commentCount += 1
            if (!parentId) {
              newComment.replies = []
              post.comments.push(newComment)
            } else {
              const rootThread = post.comments.find((c) => c.id === parentId)
              if (rootThread) {
                if (!rootThread.replies) rootThread.replies = []
                rootThread.replies.push(newComment)
              }
            }
          }

          const body = structuredClone(snapshots.snapshots.create_comment_201.responseBody)
          const commentResponse = { ...newComment }
          delete (commentResponse as any).replies
          body.data = commentResponse as any
          await fulfillFromContractSnapshot(route, snapshots, 'create_comment_201', body)
          return
        }

        if (method === 'DELETE') {
          expect(route.request().headers()['authorization']).toMatch(/^Bearer .+/)
          if (post && commentId) {
            const rootIdx = post.comments.findIndex((c) => c.id === commentId)
            if (rootIdx !== -1) {
              const repliesCount = post.comments[rootIdx].replies ? post.comments[rootIdx].replies!.length : 0
              post.comments.splice(rootIdx, 1)
              post.commentCount = Math.max(0, post.commentCount - (1 + repliesCount))
            } else {
              for (const root of post.comments) {
                if (root.replies) {
                  const repIdx = root.replies.findIndex((r) => r.id === commentId)
                  if (repIdx !== -1) {
                    root.replies.splice(repIdx, 1)
                    post.commentCount = Math.max(0, post.commentCount - 1)
                    break
                  }
                }
              }
            }
          }

          const body = structuredClone(snapshots.snapshots.delete_comment_200.responseBody)
          body.data.deletedCommentId = commentId
          body.data.commentCount = post ? post.commentCount : 0
          await fulfillFromContractSnapshot(route, snapshots, 'delete_comment_200', body)
          return
        }
      })

      // Admin Post Update, Delete by ID, and Media upload
      await page.route(/\/api\/v1\/admin\/posts\/[^/?]+$/, async (route) => {
        const method = route.request().method()
        const url = route.request().url()

        if (url.endsWith('/media') || url.includes('/admin/posts/media')) {
          if (method === 'POST') {
            expect(route.request().headers()['authorization']).toMatch(/^Bearer .+/)
            await fulfillFromContractSnapshot(route, snapshots, 'upload_media_201')
            return
          }
        }

        const match = url.match(/\/admin\/posts\/([^/?]+)/)
        const postId = match && match[1] ? match[1] : ''

        if (method === 'PUT') {
          expect(route.request().headers()['authorization']).toMatch(/^Bearer .+/)
          const reqData = route.request().postDataJSON() as {
            content: string
            mediaIds?: string[]
            referredProductIds?: string[]
          }

          const post = state.posts.find((p) => p.id === postId)
          if (!post) {
            await fulfillFromContractSnapshot(route, snapshots, 'admin_post_not_found_404')
            return
          }

          post.content = reqData.content.trim()
          post.updatedAt = new Date().toISOString()

          const body = structuredClone(snapshots.snapshots.update_post_200.responseBody)
          body.data = post as any
          await fulfillFromContractSnapshot(route, snapshots, 'update_post_200', body)
          return
        }

        if (method === 'DELETE') {
          expect(route.request().headers()['authorization']).toMatch(/^Bearer .+/)
          const idx = state.posts.findIndex((p) => p.id === postId)
          if (idx !== -1) {
            state.posts.splice(idx, 1)
          }
          const body = structuredClone(snapshots.snapshots.delete_post_200.responseBody)
          body.data.id = postId
          await fulfillFromContractSnapshot(route, snapshots, 'delete_post_200', body)
          return
        }

        await route.fallback()
      })

      // Admin Post Create
      await page.route(/\/api\/v1\/admin\/posts(?:\?.*)?$/, async (route) => {
        const method = route.request().method()
        if (method === 'POST') {
          expect(route.request().headers()['authorization']).toMatch(/^Bearer .+/)
          const reqData = route.request().postDataJSON() as {
            content: string
            mediaIds?: string[]
            referredProductIds?: string[]
          }

          if (!reqData.content || reqData.content.trim().length === 0 || !reqData.referredProductIds || reqData.referredProductIds.length === 0) {
            await fulfillFromContractSnapshot(route, snapshots, 'admin_post_validation_400')
            return
          }

          const createdId = `post-${Date.now()}`
          const createdPost: InMemPost = {
            id: createdId,
            authorId: '11111111-1111-1111-1111-111111111111',
            authorName: 'Quản trị viên',
            authorRole: 'admin',
            content: reqData.content.trim(),
            media: (reqData.mediaIds || []).map((mId, idx) => ({
              id: mId,
              fileType: 'image',
              fileName: 'iphone15-banner.jpg',
              fileSize: 102400,
              mimeType: 'image/jpeg',
              fileUrl: `/api/v1/posts/media/${mId}`,
              position: idx,
            })),
            referredProducts: [
              {
                id: '77777777-7777-7777-7777-777777777777',
                name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên',
                brand: 'Apple',
                price: '29990000',
                currency: 'VND',
                imageUrl: 'https://example.com/products/iphone15.jpg',
                inStock: true,
                active: true,
              },
            ],
            reactions: { totalCount: 0, counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }, viewerReaction: null },
            commentCount: 0,
            comments: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

          state.posts.unshift(createdPost)

          const body = structuredClone(snapshots.snapshots.create_post_201.responseBody)
          body.data = createdPost as any
          await fulfillFromContractSnapshot(route, snapshots, 'create_post_201', body)
          return
        }
      })

      // Public Post Detail
      await page.route(/\/api\/v1\/posts\/[^/?]+$/, async (route) => {
        const url = route.request().url()
        const match = url.match(/\/posts\/([^/?]+)/)
        const postId = match ? match[1] : ''

        const post = state.posts.find((p) => p.id === postId)
        if (!post) {
          await fulfillFromContractSnapshot(route, snapshots, 'post_not_found_404')
          return
        }

        const body = structuredClone(snapshots.snapshots.get_post_detail_200.responseBody)
        body.data = post as any
        await fulfillFromContractSnapshot(route, snapshots, 'get_post_detail_200', body)
      })

      // Public Posts List
      await page.route(/\/api\/v1\/posts(?:\?.*)?$/, async (route) => {
        if (route.request().method() === 'GET') {
          const body = structuredClone(snapshots.snapshots.list_posts_200.responseBody)
          body.data = state.posts.map((p) => {
            const copy = { ...p }
            delete (copy as any).comments
            return copy
          }) as any
          body.meta.pagination = {
            total: state.posts.length,
            page: 1,
            limit: 10,
            totalPages: Math.max(1, Math.ceil(state.posts.length / 10)),
            hasNext: false,
            hasPrev: false,
          }
          await fulfillFromContractSnapshot(route, snapshots, 'list_posts_200', body)
        }
      })
    }

    await registerPostAndNotificationRoutes(adminPage)
    await registerPostAndNotificationRoutes(storefrontPage)

    const adminPostsPage = new AdminPostsPage(adminPage)
    const storefrontPostsPage = new StorefrontPostsPage(storefrontPage)

    // Helper to send server push notification
    const pushNotificationToClients = (notif: InMemNotification) => {
      const existingIdx = state.notifications.findIndex((n) => n.id === notif.id)
      if (existingIdx !== -1) {
        const existing = state.notifications[existingIdx]
        state.notifications.splice(existingIdx, 1)
        state.notifications.unshift(notif)
        if (existing.isRead && !notif.isRead) {
          state.unreadCount += 1
        }
      } else {
        state.notifications.unshift(notif)
        if (!notif.isRead) {
          state.unreadCount += 1
        }
      }

      const frameObj = {
        type: 'notification:new',
        payload: notif,
      }

      assertMatchesContractShape(
        frameObj,
        snapshots.snapshots.ws_notification_new.responseBody,
        'ws_notification_new'
      )

      const frame = JSON.stringify(frameObj)

      for (const ws of state.connectedSockets) {
        try {
          ws.send(frame)
        } catch {
          // Socket might have closed
        }
      }
    }

    try {
      // =========================================================================
      // SCENARIO 1: Empty State on Admin & Storefront (Req 2.6)
      // =========================================================================
      state.posts = []
      await adminPostsPage.gotoAdminPosts(ADMIN_BASE)
      await adminPostsPage.expectPostsListLoaded()
      await expect(adminPage.getByRole('heading', { name: 'Chưa có bài viết nào' })).toBeVisible()
      await adminPage.screenshot({
        path: path.join(imgsDir, '01-admin-posts-list-empty.png'),
        fullPage: true,
      })

      // =========================================================================
      // SCENARIO 2: Admin Creates Post with Uploaded Media & Referral (Req 1.1–1.3)
      // =========================================================================
      await adminPostsPage.openCreatePostModal()
      await adminPostsPage.fillPostContent(
        'Đánh giá chi tiết siêu phẩm iPhone 15 Pro Max mới về hàng tại shop AuraPhone với khung viền Titan và camera tiềm vọng 5x đỉnh cao!'
      )

      await adminPostsPage.uploadMediaAttachment(testImagePath)
      await expect(adminPage.getByText('iphone15-banner.jpg')).toBeVisible()

      await adminPostsPage.searchAndSelectProduct('iPhone', 'iPhone 15 Pro Max 256GB Titan Tự Nhiên')
      await expect(adminPage.getByText('Đã chọn 1/10')).toBeVisible()

      await adminPage.screenshot({
        path: path.join(imgsDir, '02-admin-create-post-modal.png'),
        fullPage: false,
      })

      await adminPostsPage.submitPostForm()
      expect(state.posts.length).toBe(1)
      const createdPostId = state.posts[0].id

      await expect(adminPage.getByText('Tạo bài viết thành công')).toBeVisible()
      await expect(adminPage.getByText(state.posts[0].content)).toBeVisible()
      await adminPage.screenshot({
        path: path.join(imgsDir, '03-admin-posts-list-populated.png'),
        fullPage: true,
      })

      // =========================================================================
      // SCENARIO 3: Admin Edits Post (Req 1.4)
      // =========================================================================
      await adminPostsPage.openEditPostModal(state.posts[0].content)
      await adminPostsPage.fillPostContent(
        'Đánh giá chi tiết siêu phẩm iPhone 15 Pro Max mới về hàng tại shop AuraPhone với khung viền Titan Tự Nhiên và camera tiềm vọng 5x đỉnh cao! [Đã cập nhật ưu đãi]'
      )

      await adminPage.screenshot({
        path: path.join(imgsDir, '04-admin-edit-post-modal.png'),
        fullPage: false,
      })

      await adminPostsPage.submitPostForm()
      await expect(adminPage.getByText('Cập nhật bài viết thành công')).toBeVisible()
      await expect(adminPage.getByText('[Đã cập nhật ưu đãi]')).toBeVisible()

      // =========================================================================
      // SCENARIO 4: Admin Views Post Detail on Frontend-Admin (Req 2.1, 2.3)
      // =========================================================================
      await adminPostsPage.gotoAdminPostDetail(ADMIN_BASE, createdPostId)
      await adminPostsPage.expectAdminPostDetailLoaded(createdPostId)
      await expect(adminPage.getByText('[Đã cập nhật ưu đãi]')).toBeVisible()
      await expect(adminPage.getByText('iPhone 15 Pro Max 256GB Titan Tự Nhiên')).toBeVisible()
      await adminPage.screenshot({
        path: path.join(imgsDir, '05-admin-post-detail.png'),
        fullPage: true,
      })

      // =========================================================================
      // SCENARIO 5: Customer Browses Storefront Feed (Desktop & Mobile) (Req 2.1, 8.3)
      // =========================================================================
      await storefrontPostsPage.gotoFeed()
      await storefrontPostsPage.expectFeedLoaded()
      const postCard = await storefrontPostsPage.getPostCard(createdPostId)
      await expect(postCard).toBeVisible()
      await assertNoHorizontalOverflow(storefrontPage)
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '07-storefront-posts-feed-desktop.png'),
        fullPage: true,
      })

      // Mobile viewport check
      await storefrontPage.setViewportSize({ width: 375, height: 812 })
      await assertNoHorizontalOverflow(storefrontPage)
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '08-storefront-posts-feed-mobile.png'),
        fullPage: true,
      })
      await storefrontPage.setViewportSize({ width: 1440, height: 900 })

      // =========================================================================
      // SCENARIO 6: Share Button Copies URL & Shows Vietnamese Toast (Req 2.5)
      // =========================================================================
      await storefrontPostsPage.clickShare(createdPostId)
      await expect(storefrontPage.getByText('Đã sao chép liên kết bài viết')).toBeVisible()
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '09-storefront-share-toast.png'),
        fullPage: false,
      })

      // =========================================================================
      // SCENARIO 7: Click Referred Product Card -> Navigates to /products/:id (Req 2.4)
      // =========================================================================
      const referredProductLink = postCard.locator('a[href^="/products/"]').first()
      await referredProductLink.click()
      await expect(storefrontPage).toHaveURL(/\/products\/77777777-7777-7777-7777-777777777777/)
      await expect(storefrontPage.getByRole('heading', { name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên' })).toBeVisible()
      await expect(storefrontPage.getByText('Máy chính hãng VNA rất đẹp, camera chụp siêu nét và giao hàng nhanh.')).toBeVisible()
      await storefrontPage.evaluate(() => window.scrollTo(0, 0))
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '10-storefront-referred-product-navigation.png'),
        fullPage: true,
      })

      // =========================================================================
      // SCENARIO 8: Storefront Post Detail & 6-Emotion Reactions (Req 2.1, 3.1–3.4)
      // =========================================================================
      await storefrontPostsPage.gotoPostDetail(createdPostId)
      await storefrontPostsPage.expectPostDetailLoaded(createdPostId)
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '11-storefront-post-detail-view.png'),
        fullPage: true,
      })

      // Hover 6-emotion picker
      await storefrontPostsPage.hoverReactionButton(createdPostId)
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '12-storefront-post-reaction-picker.png'),
        fullPage: false,
      })

      // Select 'love'
      await storefrontPostsPage.selectPostReaction(createdPostId, 'love')
      await expect(storefrontPage.locator('[data-testid="reaction-trigger-button"]')).toContainText('Yêu thích')
      expect(state.posts[0].reactions.viewerReaction).toBe('love')
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '13-storefront-post-reacted-love.png'),
        fullPage: false,
      })

      // Change reaction to 'like'
      await storefrontPostsPage.selectPostReaction(createdPostId, 'like')
      await expect(storefrontPage.locator('[data-testid="reaction-trigger-button"]')).toContainText('Thích')
      expect(state.posts[0].reactions.viewerReaction).toBe('like')
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '14-storefront-post-reaction-changed-like.png'),
        fullPage: false,
      })

      // Remove reaction by clicking active button
      await storefrontPostsPage.clickPostReactionTrigger(createdPostId)
      expect(state.posts[0].reactions.viewerReaction).toBeNull()

      // =========================================================================
      // SCENARIO 9: Hierarchical 2-Level Comments & Replies (Req 4.1–4.3)
      // =========================================================================
      // Create root comment (Level 1)
      await storefrontPostsPage.createRootComment('Thiết kế Titan tự nhiên nhìn rất sang trọng và đẳng cấp!')
      await expect(storefrontPage.getByText('Thiết kế Titan tự nhiên nhìn rất sang trọng và đẳng cấp!')).toBeVisible()
      expect(state.posts[0].comments.length).toBe(1)
      const rootCommentId = state.posts[0].comments[0].id
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '15-storefront-root-comment-created.png'),
        fullPage: false,
      })

      // Create level 2 reply to root comment
      await storefrontPostsPage.replyToComment(
        rootCommentId,
        rootCommentId,
        'Cảm ơn bạn đã quan tâm, shop luôn sẵn hàng để trải nghiệm trực tiếp nhé!'
      )
      await expect(
        storefrontPage.getByText('Cảm ơn bạn đã quan tâm, shop luôn sẵn hàng để trải nghiệm trực tiếp nhé!')
      ).toBeVisible()
      expect(state.posts[0].comments[0].replies?.length).toBe(1)
      const level2ReplyId = state.posts[0].comments[0].replies![0].id
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '16-storefront-level2-reply-created.png'),
        fullPage: false,
      })

      // Reply to level-2 reply -> Flattened into level 2 with @username mention (Req 4.3)
      await storefrontPostsPage.replyToComment(
        level2ReplyId,
        rootCommentId,
        'Tuyệt vời, cuối tuần mình sẽ ghé chi nhánh xem máy!'
      )
      await expect(storefrontPage.getByText('Tuyệt vời, cuối tuần mình sẽ ghé chi nhánh xem máy!')).toBeVisible()
      expect(state.posts[0].comments[0].replies?.length).toBe(2)
      const flattenedReplyId = state.posts[0].comments[0].replies![1].id
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '17-storefront-reply-to-reply-flattened.png'),
        fullPage: false,
      })

      // =========================================================================
      // SCENARIO 10: 6-Emotion Reactions on Comments (Req 5.1–5.2)
      // =========================================================================
      await storefrontPostsPage.selectCommentReaction(rootCommentId, 'love')
      await expect(storefrontPage.locator(`[data-testid="comment-reactions-summary-${rootCommentId}"]`)).toBeVisible()
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '18-storefront-comment-reaction.png'),
        fullPage: false,
      })

      // =========================================================================
      // SCENARIO 11: Realtime WebSocket Notification to Admin & Deep-Link (Req 6.1, 6.5, 6.6, 7.1, 7.2)
      // =========================================================================
      await adminPostsPage.gotoAdminPosts(ADMIN_BASE)
      await adminPostsPage.expectPostsListLoaded()
      await adminPage.waitForTimeout(600)

      // Server pushes initial real-time notification to Admin via WebSocket (1 actor)
      const adminNotifId = `notif-post-${Date.now()}`
      const adminNotifCreatedAt = new Date().toISOString()
      pushNotificationToClients({
        id: adminNotifId,
        category: 'post',
        notificationType: 'post_reaction',
        recipientId: '11111111-1111-1111-1111-111111111111',
        actorId: '22222222-2222-2222-2222-222222222222',
        actorName: 'Nguyễn Văn A',
        actorRole: 'customer',
        actorCount: 1,
        groupKey: `post_reaction:${createdPostId}`,
        postId: createdPostId,
        commentId: null,
        reactionType: 'love',
        excerpt: state.posts[0].content,
        metadata: {
          recentActors: [
            {
              id: '22222222-2222-2222-2222-222222222222',
              name: 'Nguyễn Văn A',
              role: 'customer',
            },
          ],
        },
        isRead: false,
        createdAt: adminNotifCreatedAt,
        updatedAt: adminNotifCreatedAt,
      })

      const expectedAdminUnreadAfterFirst = state.unreadCount
      await adminPostsPage.expectAdminUnreadNotificationCount(expectedAdminUnreadAfterFirst)

      // Second distinct actor reacts on the same post -> rolled up into same unread notification id
      pushNotificationToClients({
        id: adminNotifId,
        category: 'post',
        notificationType: 'post_reaction',
        recipientId: '11111111-1111-1111-1111-111111111111',
        actorId: '88888888-8888-8888-8888-888888888888',
        actorName: 'Trần Thị B',
        actorRole: 'customer',
        actorCount: 2,
        groupKey: `post_reaction:${createdPostId}`,
        postId: createdPostId,
        commentId: null,
        reactionType: 'love',
        excerpt: state.posts[0].content,
        metadata: {
          recentActors: [
            {
              id: '88888888-8888-8888-8888-888888888888',
              name: 'Trần Thị B',
              role: 'customer',
            },
            {
              id: '22222222-2222-2222-2222-222222222222',
              name: 'Nguyễn Văn A',
              role: 'customer',
            },
          ],
        },
        isRead: false,
        createdAt: adminNotifCreatedAt,
        updatedAt: new Date().toISOString(),
      })

      // Unread badge does not double-increment for rolled-up notification
      expect(state.unreadCount).toBe(expectedAdminUnreadAfterFirst)
      await adminPostsPage.expectAdminUnreadNotificationCount(expectedAdminUnreadAfterFirst)
      await adminPage.screenshot({
        path: path.join(imgsDir, '19-realtime-ws-notification-admin-badge.png'),
        fullPage: false,
      })

      // Open notification dropdown and verify 2-actor grouped label
      await adminPostsPage.clickAdminNotificationBell()
      await expect(adminPostsPage.notificationDropdown).toBeVisible()
      await expect(adminPage.locator(`[data-testid="notification-item-${adminNotifId}"]`)).toContainText(
        'Trần Thị B và Nguyễn Văn A'
      )

      // Third distinct actor reacts on the same post -> rolled up to 3 actors ("A, B và 1 người khác")
      pushNotificationToClients({
        id: adminNotifId,
        category: 'post',
        notificationType: 'post_reaction',
        recipientId: '11111111-1111-1111-1111-111111111111',
        actorId: '99999999-9999-9999-9999-999999999999',
        actorName: 'Lê Văn C',
        actorRole: 'customer',
        actorCount: 3,
        groupKey: `post_reaction:${createdPostId}`,
        postId: createdPostId,
        commentId: null,
        reactionType: 'love',
        excerpt: state.posts[0].content,
        metadata: {
          recentActors: [
            {
              id: '99999999-9999-9999-9999-999999999999',
              name: 'Lê Văn C',
              role: 'customer',
            },
            {
              id: '88888888-8888-8888-8888-888888888888',
              name: 'Trần Thị B',
              role: 'customer',
            },
          ],
        },
        isRead: false,
        createdAt: adminNotifCreatedAt,
        updatedAt: new Date().toISOString(),
      })

      expect(state.unreadCount).toBe(expectedAdminUnreadAfterFirst)
      await adminPostsPage.expectAdminUnreadNotificationCount(expectedAdminUnreadAfterFirst)
      await expect(adminPage.locator(`[data-testid="notification-item-${adminNotifId}"]`)).toContainText(
        'Lê Văn C, Trần Thị B và 1 người khác'
      )
      await adminPage.screenshot({
        path: path.join(imgsDir, '20-admin-notification-dropdown.png'),
        fullPage: false,
      })

      // Click notification -> Deep link to post detail, smooth scroll & highlight post
      await adminPostsPage.clickAdminNotificationItem(adminNotifId)
      await adminPostsPage.expectAdminPostDetailLoaded(createdPostId)
      await adminPostsPage.expectAdminPostHighlighted(createdPostId)
      await adminPage.screenshot({
        path: path.join(imgsDir, '21-admin-deep-link-post-highlight.png'),
        fullPage: true,
      })

      // =========================================================================
      // SCENARIO 12: Realtime WebSocket Notification to Customer & Comment Deep-Link (Req 6.2, 6.5, 6.6, 7.3)
      // =========================================================================
      await storefrontPostsPage.gotoFeed()
      await storefrontPostsPage.expectFeedLoaded()
      await storefrontPage.waitForTimeout(600)

      const customerNotifId = `notif-reply-${Date.now()}`
      const customerNotifCreatedAt = new Date().toISOString()
      pushNotificationToClients({
        id: customerNotifId,
        category: 'post',
        notificationType: 'comment_reply',
        recipientId: '22222222-2222-2222-2222-222222222222',
        actorId: '11111111-1111-1111-1111-111111111111',
        actorName: 'Quản trị viên',
        actorRole: 'admin',
        actorCount: 1,
        groupKey: `comment_reply:${rootCommentId}`,
        postId: createdPostId,
        commentId: flattenedReplyId,
        reactionType: null,
        excerpt: 'Cảm ơn bạn đã quan tâm, shop luôn sẵn hàng...',
        metadata: {
          recentActors: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              name: 'Quản trị viên',
              role: 'admin',
            },
          ],
        },
        isRead: false,
        createdAt: customerNotifCreatedAt,
        updatedAt: customerNotifCreatedAt,
      })

      const expectedCustomerUnreadAfterFirst = state.unreadCount
      await storefrontPostsPage.expectUnreadNotificationCount(expectedCustomerUnreadAfterFirst)

      // Second & third distinct actors reply in the same thread -> rolled up into same unread notification id
      pushNotificationToClients({
        id: customerNotifId,
        category: 'post',
        notificationType: 'comment_reply',
        recipientId: '22222222-2222-2222-2222-222222222222',
        actorId: '88888888-8888-8888-8888-888888888888',
        actorName: 'Trần Thị B',
        actorRole: 'customer',
        actorCount: 2,
        groupKey: `comment_reply:${rootCommentId}`,
        postId: createdPostId,
        commentId: flattenedReplyId,
        reactionType: null,
        excerpt: 'Mình cũng vừa ghé trải nghiệm, máy rất mượt!',
        metadata: {
          recentActors: [
            {
              id: '88888888-8888-8888-8888-888888888888',
              name: 'Trần Thị B',
              role: 'customer',
            },
            {
              id: '11111111-1111-1111-1111-111111111111',
              name: 'Quản trị viên',
              role: 'admin',
            },
          ],
        },
        isRead: false,
        createdAt: customerNotifCreatedAt,
        updatedAt: new Date().toISOString(),
      })

      expect(state.unreadCount).toBe(expectedCustomerUnreadAfterFirst)
      await storefrontPostsPage.expectUnreadNotificationCount(expectedCustomerUnreadAfterFirst)
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '22-storefront-ws-notification-customer-badge.png'),
        fullPage: false,
      })

      // Open customer notification dropdown and verify 2-actor grouped label
      await storefrontPostsPage.clickNotificationBell()
      await expect(storefrontPostsPage.notificationDropdown).toBeVisible()
      await expect(storefrontPage.locator(`[data-testid="notification-item-${customerNotifId}"]`)).toContainText(
        'Trần Thị B và Quản trị viên'
      )

      // Third distinct actor replies in the same thread -> rolled up to 3 actors ("A, B và 1 người khác")
      pushNotificationToClients({
        id: customerNotifId,
        category: 'post',
        notificationType: 'comment_reply',
        recipientId: '22222222-2222-2222-2222-222222222222',
        actorId: '99999999-9999-9999-9999-999999999999',
        actorName: 'Lê Văn C',
        actorRole: 'customer',
        actorCount: 3,
        groupKey: `comment_reply:${rootCommentId}`,
        postId: createdPostId,
        commentId: flattenedReplyId,
        reactionType: null,
        excerpt: 'Tuyệt vời, cuối tuần mình sẽ ghé chi nhánh xem máy!',
        metadata: {
          recentActors: [
            {
              id: '99999999-9999-9999-9999-999999999999',
              name: 'Lê Văn C',
              role: 'customer',
            },
            {
              id: '88888888-8888-8888-8888-888888888888',
              name: 'Trần Thị B',
              role: 'customer',
            },
          ],
        },
        isRead: false,
        createdAt: customerNotifCreatedAt,
        updatedAt: new Date().toISOString(),
      })

      expect(state.unreadCount).toBe(expectedCustomerUnreadAfterFirst)
      await storefrontPostsPage.expectUnreadNotificationCount(expectedCustomerUnreadAfterFirst)
      await expect(storefrontPage.locator(`[data-testid="notification-item-${customerNotifId}"]`)).toContainText(
        'Lê Văn C, Trần Thị B và 1 người khác'
      )
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '23-customer-notification-dropdown.png'),
        fullPage: false,
      })

      // Click comment notification -> Deep link, auto-expand replies, scroll & highlight comment
      await storefrontPostsPage.clickNotificationItem(customerNotifId)
      await storefrontPostsPage.expectPostDetailLoaded(createdPostId)
      await storefrontPostsPage.expectCommentHighlighted(flattenedReplyId)
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '24-customer-deep-link-comment-highlight.png'),
        fullPage: true,
      })

      // =========================================================================
      // SCENARIO 13: Target Comment Not Found Alert (Req 7.5)
      // =========================================================================
      await storefrontPostsPage.gotoPostDetail(createdPostId, `commentId=non-existent-comment-id&focusTs=${Date.now()}`)
      await storefrontPostsPage.expectCommentNotFoundAlert()
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '25-comment-not-found-alert.png'),
        fullPage: false,
      })

      // Mobile Responsive view of detail page (Req 8.3)
      await storefrontPage.setViewportSize({ width: 375, height: 812 })
      await assertNoHorizontalOverflow(storefrontPage)
      await storefrontPage.screenshot({
        path: path.join(imgsDir, '26-storefront-mobile-responsive.png'),
        fullPage: true,
      })
      await storefrontPage.setViewportSize({ width: 1440, height: 900 })

      // =========================================================================
      // SCENARIO 14: Admin Deletes Post (Req 1.5)
      // =========================================================================
      await adminPostsPage.gotoAdminPosts(ADMIN_BASE)
      await adminPostsPage.expectPostsListLoaded()
      const postSnippet = state.posts[0].content.slice(0, 30)

      // Click delete button and show confirmation dialog
      const articleToDel = adminPostsPage.postCards.filter({ hasText: postSnippet }).first()
      await articleToDel.locator('button', { hasText: 'Xóa' }).click()
      await expect(adminPostsPage.deleteDialog).toBeVisible()
      await adminPage.screenshot({
        path: path.join(imgsDir, '06-admin-delete-post-dialog.png'),
        fullPage: false,
      })

      // Confirm deletion
      await adminPostsPage.confirmDeleteBtn.click()
      expect(state.posts.length).toBe(0)
      await expect(adminPage.getByRole('heading', { name: 'Chưa có bài viết nào' })).toBeVisible()
    } finally {
      await adminContext.close()
      await storefrontContext.close()
    }
  })
})
