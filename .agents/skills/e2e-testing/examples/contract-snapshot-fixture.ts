// Reference implementation for Playwright Mode 2 (Contract-Verified Mock E2E).
// Place in e2e/fixtures/contract.ts to load backend-verified golden snapshots from
// .dream/specs/<feature>/contract-snapshots.json and enforce 1:1 key/type parity.
import fs from 'node:fs'
import path from 'node:path'
import { type Route, expect } from '@playwright/test'

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext?: boolean
  hasPrev?: boolean
}

export interface ApiErrorDetail {
  code: string
  message: string
  fields?: Record<string, string>
}

export interface ApiEnvelope<T = unknown> {
  success: boolean
  message: string
  data: T | null
  error: ApiErrorDetail | null
  meta: {
    timestamp: string
    pagination?: PaginationMeta
  }
}

export interface ContractSnapshotEntry<T = unknown> {
  contractId: string
  endpoint: string
  status: number
  body: ApiEnvelope<T>
}

export type ContractSnapshotMap = Record<string, ContractSnapshotEntry>

export function loadContractSnapshots(feature: string): ContractSnapshotMap {
  const snapshotPath = path.resolve(
    process.cwd(),
    `../.dream/specs/${feature}/contract-snapshots.json`
  )
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(
      `Missing backend-verified contract snapshot file at ${snapshotPath}. ` +
        `Run the backend handler test suite first to generate contract-snapshots.json.`
    )
  }
  return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as ContractSnapshotMap
}

export function assertMatchesContractShape(
  actual: unknown,
  golden: unknown,
  options?: { optionalKeys?: string[]; path?: string }
): void {
  const currentPath = options?.path || '$'
  const optionalSet = new Set(options?.optionalKeys || [])

  if (golden === null || actual === null) {
    if (golden !== null && actual !== null) {
      expect(typeof actual, `Type mismatch at ${currentPath}`).toBe(typeof golden)
    }
    return
  }

  if (Array.isArray(golden)) {
    expect(Array.isArray(actual), `Expected array at ${currentPath}`).toBe(true)
    const actualArr = actual as unknown[]
    if (golden.length > 0 && actualArr.length > 0) {
      for (let i = 0; i < actualArr.length; i++) {
        assertMatchesContractShape(actualArr[i], golden[0], {
          optionalKeys: options?.optionalKeys,
          path: `${currentPath}[${i}]`,
        })
      }
    }
    return
  }

  if (typeof golden === 'object') {
    expect(
      typeof actual === 'object' && !Array.isArray(actual),
      `Expected object at ${currentPath}`
    ).toBe(true)

    const goldenObj = golden as Record<string, unknown>
    const actualObj = actual as Record<string, unknown>

    for (const key of Object.keys(goldenObj)) {
      if (!optionalSet.has(key)) {
        expect(
          Object.prototype.hasOwnProperty.call(actualObj, key),
          `Missing required Backend Contract key "${key}" at ${currentPath}`
        ).toBe(true)
      }
    }

    for (const key of Object.keys(actualObj)) {
      const allowed = Object.prototype.hasOwnProperty.call(goldenObj, key) || optionalSet.has(key)
      expect(
        allowed,
        `Invented key "${key}" at ${currentPath} does not exist in Backend contract snapshot`
      ).toBe(true)

      if (Object.prototype.hasOwnProperty.call(goldenObj, key) && actualObj[key] !== undefined) {
        assertMatchesContractShape(actualObj[key], goldenObj[key], {
          optionalKeys: options?.optionalKeys,
          path: `${currentPath}.${key}`,
        })
      }
    }
    return
  }

  expect(typeof actual, `Primitive type mismatch at ${currentPath}`).toBe(typeof golden)
}

export async function fulfillContractEnvelope<T>(
  route: Route,
  status: number,
  envelope: ApiEnvelope<T>,
  options?: { forbiddenKeys?: string[] }
): Promise<void> {
  expect(typeof envelope.message).toBe('string')
  expect(envelope.message.length).toBeGreaterThan(0)
  expect(typeof envelope.meta?.timestamp).toBe('string')

  if (status >= 200 && status < 300) {
    expect(envelope.success).toBe(true)
    expect(envelope.error).toBeNull()
  } else {
    expect(envelope.success).toBe(false)
    expect(envelope.data).toBeNull()
    expect(envelope.error?.code).toBeTruthy()
    expect(envelope.error?.message).toBeTruthy()
  }

  const serialized = JSON.stringify(envelope)
  if (options?.forbiddenKeys?.length) {
    for (const forbidden of options.forbiddenKeys) {
      expect(serialized).not.toContain(`"${forbidden}":`)
    }
  }

  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: serialized,
  })
}

export async function fulfillFromContractSnapshot<T>(
  route: Route,
  snapshot: ContractSnapshotEntry<T>,
  overrides?: {
    data?: T
    pagination?: PaginationMeta
    optionalKeys?: string[]
    forbiddenKeys?: string[]
  }
): Promise<void> {
  expect(snapshot, 'Contract snapshot entry must be defined').toBeDefined()

  const dataToUse = overrides && 'data' in overrides ? (overrides.data as T) : snapshot.body.data
  if (snapshot.body.data !== null && dataToUse !== null) {
    assertMatchesContractShape(dataToUse, snapshot.body.data, {
      optionalKeys: overrides?.optionalKeys,
      path: `${snapshot.contractId}(${snapshot.endpoint}).data`,
    })
  }

  const paginationToUse = overrides?.pagination ?? snapshot.body.meta.pagination
  if (snapshot.body.meta.pagination && paginationToUse) {
    assertMatchesContractShape(paginationToUse, snapshot.body.meta.pagination, {
      path: `${snapshot.contractId}(${snapshot.endpoint}).meta.pagination`,
    })
  }

  const envelope: ApiEnvelope<T> = {
    success: snapshot.body.success,
    message: snapshot.body.message,
    data: dataToUse,
    error: snapshot.body.error,
    meta: {
      timestamp: new Date().toISOString(),
      ...(paginationToUse ? { pagination: paginationToUse } : {}),
    },
  }

  await fulfillContractEnvelope(route, snapshot.status, envelope, {
    forbiddenKeys: overrides?.forbiddenKeys,
  })
}
