import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listAdminUsers, getAdminUser, lockAdminUser, unlockAdminUser } from './users'
import * as client from './client'

vi.mock('./client', () => ({
  apiClient: vi.fn(),
  apiClientWithMeta: vi.fn(),
}))

describe('admin users API service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists users with only the provided filters', async () => {
    vi.mocked(client.apiClientWithMeta).mockResolvedValue({ data: [], message: 'ok', meta: { timestamp: 't' } })

    await listAdminUsers({ search: 'khach@', role: 'customer', status: 'locked', page: 2, limit: 20 })
    expect(client.apiClientWithMeta).toHaveBeenCalledWith(
      '/admin/users?search=khach%40&role=customer&status=locked&page=2&limit=20'
    )

    await listAdminUsers({ page: 1 })
    expect(client.apiClientWithMeta).toHaveBeenLastCalledWith('/admin/users?page=1')
  })

  it('gets one user by id', async () => {
    vi.mocked(client.apiClient).mockResolvedValue({ id: 'u1' })
    const result = await getAdminUser('u1')
    expect(client.apiClient).toHaveBeenCalledWith('/admin/users/u1')
    expect(result).toEqual({ id: 'u1' })
  })

  it('locks with the reason and unlocks without a body', async () => {
    vi.mocked(client.apiClient).mockResolvedValue({ id: 'u1' })

    await lockAdminUser('u1', 'Spam')
    expect(client.apiClient).toHaveBeenCalledWith('/admin/users/u1/lock', {
      method: 'POST',
      body: { reason: 'Spam' },
    })

    await lockAdminUser('u1', '')
    expect(client.apiClient).toHaveBeenLastCalledWith('/admin/users/u1/lock', {
      method: 'POST',
      body: { reason: null },
    })

    await unlockAdminUser('u1')
    expect(client.apiClient).toHaveBeenLastCalledWith('/admin/users/u1/unlock', { method: 'POST' })
  })
})
