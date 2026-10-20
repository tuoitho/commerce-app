import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect, type Route } from '@playwright/test'

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
}

export function loadContractSnapshots(featureSlug: string): ContractSnapshotDocument {
  const snapshotPath = path.resolve(
    process.cwd(),
    '..',
    '.dream',
    'specs',
    featureSlug,
    'contract-snapshots.json'
  )

  if (!fs.existsSync(snapshotPath)) {
    throw new Error(
      `Missing golden contract snapshot file at ${snapshotPath}. ` +
        `Generate it from backend handler tests before running Mode 2 E2E.`
    )
  }

  return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as ContractSnapshotDocument
}

export function assertMatchesContractShape(
  actual: unknown,
  expected: unknown,
  currentPath = '$'
): void {
  if (expected === null || actual === null) {
    expect(
      actual === null || typeof actual === typeof expected,
      `Type mismatch at ${currentPath}`
    ).toBe(true)
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
            assertMatchesContractShape(actualArr[i], candidate, `${currentPath}[${i}]`)
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
      assertMatchesContractShape(actualObj[key], expectedObj[key], `${currentPath}.${key}`)
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

  assertMatchesContractShape(body, entry.responseBody, `snapshot(${snapshotKey}).responseBody`)

  await route.fulfill({
    status: entry.status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}
