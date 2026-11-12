import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect, type BrowserContext, type Page, type Request, type Route } from '@playwright/test'

export interface ContractSnapshotEntry {
  contractId: string
  endpoint: string
  status: number
  requestBody?: unknown
  responseBody: Record<string, unknown>
}

export interface ContractSnapshotDocument {
  feature: string
  snapshots: Record<string, ContractSnapshotEntry>
  // Keys the contract allows to be null in one payload and a value in another.
  nullable?: string[]
}

export function loadContractSnapshots(
  featureSlug: string,
  options: { nullable?: string[] } = {}
): ContractSnapshotDocument {
  let snapshotPath = path.resolve(
    process.cwd(),
    '..',
    '.dream',
    'specs',
    featureSlug,
    'contract-snapshots.json'
  )

  if (!fs.existsSync(snapshotPath)) {
    const alternativePath = path.resolve(
      process.cwd(),
      '.dream',
      'specs',
      featureSlug,
      'contract-snapshots.json'
    )
    if (fs.existsSync(alternativePath)) {
      snapshotPath = alternativePath
    }
  }

  if (!fs.existsSync(snapshotPath)) {
    throw new Error(
      `Missing golden contract snapshot file at ${snapshotPath}. ` +
        `Generate it from backend handler tests before running Mode 2 E2E.`
    )
  }

  const document = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as ContractSnapshotDocument
  return { ...document, nullable: options.nullable ?? [] }
}

export function assertMatchesContractShape(
  actual: unknown,
  expected: unknown,
  currentPath = '$',
  nullableKeys: readonly string[] = []
): void {
  if (expected === null || actual === null) {
    expect(actual === null, `Null mismatch at ${currentPath}`).toBe(expected === null)
    return
  }

  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${currentPath} must be an array`).toBe(true)
    const actualArr = actual as unknown[]
    if (expected.length > 0 && actualArr.length > 0) {
      for (let i = 0; i < actualArr.length; i++) {
        let lastError: unknown = null
        const candidates =
          i < expected.length
            ? [expected[i], ...expected.filter((_, idx) => idx !== i)]
            : expected
        let matched = false
        for (const candidate of candidates) {
          try {
            assertMatchesContractShape(
              actualArr[i],
              candidate,
              `${currentPath}[${i}]`,
              nullableKeys
            )
            matched = true
            break
          } catch (err) {
            lastError = err
          }
        }
        if (!matched && lastError) {
          throw lastError
        }
      }
    }
    return
  }

  if (expected && typeof expected === 'object') {
    expect(
      actual !== null && typeof actual === 'object' && !Array.isArray(actual),
      `${currentPath} must be an object`
    ).toBe(true)

    const expectedObj = expected as Record<string, unknown>
    const actualObj = actual as Record<string, unknown>

    const expectedKeys = Object.keys(expectedObj).sort()
    const actualKeys = Object.keys(actualObj).sort()

    expect(
      actualKeys,
      `Contract drift at ${currentPath}: key set mismatch between mock payload and backend golden snapshot`
    ).toEqual(expectedKeys)

    for (const key of expectedKeys) {
      const nullDiffers = (actualObj[key] === null) !== (expectedObj[key] === null)
      // One snapshot shows a nullable key in a single state, so its other state has no shape to compare.
      if (nullDiffers && nullableKeys.includes(key)) {
        continue
      }
      assertMatchesContractShape(
        actualObj[key],
        expectedObj[key],
        `${currentPath}.${key}`,
        nullableKeys
      )
    }
    return
  }

  expect(typeof actual, `Primitive type mismatch at ${currentPath}`).toBe(typeof expected)
}

export async function fulfillFromContractSnapshot(
  route: Route,
  snapshots: ContractSnapshotDocument,
  snapshotKey: string,
  overrideResponseBody?: Record<string, unknown>
): Promise<void> {
  const entry = snapshots.snapshots[snapshotKey]
  expect(entry, `Unknown contract snapshot key "${snapshotKey}"`).toBeDefined()

  const body = overrideResponseBody ?? structuredClone(entry.responseBody)

  assertMatchesContractShape(
    body,
    entry.responseBody,
    `snapshot(${snapshotKey}).responseBody`,
    snapshots.nullable
  )

  await route.fulfill({
    status: entry.status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const API_PATTERN = '**/api/v1/**'
const UNAUTHENTICATED_SNAPSHOT = 'unauthenticated_401'

export interface ContractRouteRequest {
  request: Request
  url: URL
  // Parsed JSON body, or null when the request has none or it is not JSON.
  body: unknown
}

export interface ContractRouteReply {
  snapshot: string
  // Replaces the recorded response body after passing the shape check.
  body?: Record<string, unknown>
}

interface ContractRouteMatch {
  method: string
  // Compared with the URL pathname, without the query string.
  path: string | RegExp
}

export interface ShapeLockedRoute extends ContractRouteMatch {
  // A request without a bearer token is answered from the unauthenticated snapshot.
  auth?: 'bearer'
  // Snapshot key whose recorded requestBody the sent body is checked against.
  requestSnapshot?: string
  handle: (request: ContractRouteRequest) => ContractRouteReply | Promise<ContractRouteReply>
}

export interface StubReply {
  status: number
  body: unknown
}

// An endpoint outside the feature's contracts: served as written, with no shape lock.
export interface StubRoute extends ContractRouteMatch {
  stub: StubReply | ((request: ContractRouteRequest) => StubReply | Promise<StubReply>)
}

export type ContractRoute = ShapeLockedRoute | StubRoute

function failRunningTest(violation: string): void {
  expect.soft(violation, 'Shape-locked mock violation').toBeUndefined()
}

function parseJsonBody(request: Request): unknown {
  try {
    return request.postDataJSON()
  } catch {
    return null
  }
}

// One recorded request cannot tell an optional key from a required one, so only
// keys the frontend sends are checked: each must exist in the recording with the same type.
function assertRequestMatchesRecorded(sent: unknown, recorded: unknown, currentPath: string): void {
  if (sent === null || recorded === null) {
    return
  }

  if (Array.isArray(recorded)) {
    expect(Array.isArray(sent), `${currentPath} must be an array`).toBe(true)
    if (recorded.length > 0) {
      for (const [index, item] of (sent as unknown[]).entries()) {
        assertRequestMatchesRecorded(item, recorded[0], `${currentPath}[${index}]`)
      }
    }
    return
  }

  if (typeof recorded === 'object') {
    expect(
      typeof sent === 'object' && !Array.isArray(sent),
      `${currentPath} must be an object`
    ).toBe(true)

    const recordedObj = recorded as Record<string, unknown>
    for (const [key, value] of Object.entries(sent as Record<string, unknown>)) {
      expect(
        key in recordedObj,
        `Request key "${key}" at ${currentPath} is not in the recorded backend request`
      ).toBe(true)
      assertRequestMatchesRecorded(value, recordedObj[key], `${currentPath}.${key}`)
    }
    return
  }

  expect(typeof sent, `Request type mismatch at ${currentPath}`).toBe(typeof recorded)
}

// The single entry point for mocked API routes. Every /api/v1 request must match
// a declared route; anything else is a violation, which fails the running test
// unless the caller collects violations through `report`.
export async function mountContractRoutes(
  target: Page | BrowserContext,
  snapshots: ContractSnapshotDocument,
  routes: ContractRoute[],
  report: (violation: string) => void = failRunningTest
): Promise<void> {
  await target.route(API_PATTERN, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const label = `${request.method()} ${url.pathname}`

    const declared = routes.find(
      (candidate) =>
        candidate.method === request.method() &&
        (typeof candidate.path === 'string'
          ? candidate.path === url.pathname
          : candidate.path.test(url.pathname))
    )

    if (!declared) {
      report(`Unmocked API request: ${label}`)
      await route.abort()
      return
    }

    try {
      const body = parseJsonBody(request)

      if ('stub' in declared) {
        const reply =
          typeof declared.stub === 'function'
            ? await declared.stub({ request, url, body })
            : declared.stub
        await route.fulfill({
          status: reply.status,
          contentType: 'application/json',
          body: JSON.stringify(reply.body),
        })
        return
      }

      const authorization = request.headers()['authorization'] ?? ''
      if (declared.auth === 'bearer' && !/^Bearer .+/.test(authorization)) {
        await fulfillFromContractSnapshot(route, snapshots, UNAUTHENTICATED_SNAPSHOT)
        return
      }

      if (declared.requestSnapshot) {
        const recorded = snapshots.snapshots[declared.requestSnapshot]
        expect(
          recorded?.requestBody,
          `Snapshot "${declared.requestSnapshot}" has no recorded requestBody`
        ).toBeDefined()
        assertRequestMatchesRecorded(body, recorded.requestBody, 'requestBody')
      }

      const reply = await declared.handle({ request, url, body })
      await fulfillFromContractSnapshot(route, snapshots, reply.snapshot, reply.body)
    } catch (error) {
      report(`${label}: ${error instanceof Error ? error.message : String(error)}`)
      await route.abort()
    }
  })
}
