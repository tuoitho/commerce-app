// Reference Mode 2 (Contract-Verified Mock E2E) spec using Golden Contract Snapshots.
// Contracts: API-ADMIN-REVIEWS@1 (verifier); API-PUBLIC-REVIEWS@1 (verifier)
// _Requirements: 1.1, 1.4, 2.1, 2.2, 2.3, 2.5, 3.1, 3.4, 3.5_
import path from 'node:path'
import { test, expect, type BrowserContext } from '@playwright/test'
import {
  loadContractSnapshots,
  fulfillFromContractSnapshot,
} from './contract-snapshot-fixture'

const FEATURE = 'admin-review-reply'
const IMGS_DIR = path.resolve(process.cwd(), `../.dream/specs/${FEATURE}/imgs`)
const ADMIN_TOKEN = 'e2e-contract-admin-jwt'

export async function mountReviewContractRoutes(context: BrowserContext) {
  // Rule 1: Load backend-verified golden responses from .dream/specs/<feature>/contract-snapshots.json
  const snapshots = loadContractSnapshots(FEATURE)
  const seedList = structuredClone(
    snapshots['list_reviews_200'].body.data as Array<Record<string, any>>
  )

  // Rule 4: Mutable in-memory state store across GET / PUT / DELETE transitions
  const store = seedList

  await context.route('**/api/v1/admin/reviews**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const authHeader = req.headers()['authorization'] || ''

    // Rule 2: Inbound Auth & Role Boundary Verification
    if (!authHeader.startsWith('Bearer ')) {
      return fulfillFromContractSnapshot(route, snapshots['unauthenticated_401'])
    }
    if (authHeader !== `Bearer ${ADMIN_TOKEN}`) {
      return fulfillFromContractSnapshot(route, snapshots['forbidden_customer_403'])
    }

    if (req.method() === 'GET' && url.pathname === '/api/v1/admin/reviews') {
      const page = Number(url.searchParams.get('page') || '1')
      const limit = Number(url.searchParams.get('limit') || '10')
      const rating = Number(url.searchParams.get('rating') || '0')
      const hasReply = url.searchParams.get('has_reply') || ''

      const filtered = store
        .filter((r) => (rating > 0 ? r.rating === rating : true))
        .filter((r) =>
          hasReply === 'yes' ? !!r.adminReply : hasReply === 'no' ? !r.adminReply : true
        )

      const total = filtered.length
      const totalPages = Math.max(1, Math.ceil(total / limit))
      const slice = filtered.slice((page - 1) * limit, page * limit)

      return fulfillFromContractSnapshot(route, snapshots['list_reviews_200'], {
        data: slice,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        optionalKeys: ['adminReply', 'adminRepliedAt', 'reviewerEmail'],
      })
    }

    const replyMatch = url.pathname.match(/^\/api\/v1\/admin\/reviews\/([^/]+)\/reply$/)
    if (replyMatch && req.method() === 'PUT') {
      const reviewId = replyMatch[1]
      const body = req.postDataJSON() as { reply?: string }
      const trimmed = (body?.reply ?? '').trim()

      // Rule 2: Inbound Payload Validation
      if (!trimmed || [...trimmed].length > 1000) {
        return fulfillFromContractSnapshot(route, snapshots['update_reply_validation_400'])
      }

      const target = store.find((r) => r.id === reviewId)
      if (target) {
        target.adminReply = trimmed
        target.adminRepliedAt = new Date().toISOString()
      }

      const templateData = structuredClone(
        snapshots['update_reply_200'].body.data as Record<string, any>
      )
      return fulfillFromContractSnapshot(route, snapshots['update_reply_200'], {
        data: {
          ...templateData,
          id: reviewId,
          adminReply: trimmed,
        },
      })
    }

    if (replyMatch && req.method() === 'DELETE') {
      const reviewId = replyMatch[1]
      const target = store.find((r) => r.id === reviewId)
      if (target) {
        delete target.adminReply
        delete target.adminRepliedAt
      }

      const templateData = structuredClone(
        snapshots['delete_reply_200'].body.data as Record<string, any>
      )
      return fulfillFromContractSnapshot(route, snapshots['delete_reply_200'], {
        data: {
          ...templateData,
          id: reviewId,
        },
        forbiddenKeys: ['adminReply', 'adminRepliedAt'],
      })
    }

    await route.fallback()
  })
}

test.describe('Sample Mode 2 Contract-Verified E2E', () => {
  test('mounts contract-verified routes and captures visual evidence', async ({ context, page }) => {
    await mountReviewContractRoutes(context)
    await page.addInitScript((token) => {
      window.localStorage.setItem('accessToken', token)
    }, ADMIN_TOKEN)

    await page.goto('/reviews')
    await expect(page.locator('[data-testid="reviews-table"]')).toBeVisible()
    await page.screenshot({ path: path.join(IMGS_DIR, '01-reviews-list.png'), fullPage: true })
  })
})
