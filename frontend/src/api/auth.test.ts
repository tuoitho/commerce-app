import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authApi } from './auth'
import * as client from './client'

vi.mock('./client', () => ({
  apiClient: vi.fn(),
}))

describe('authApi password recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls POST /auth/forgot-password and returns cooldownSeconds', async () => {
    vi.mocked(client.apiClient).mockResolvedValueOnce({ cooldownSeconds: 60 })

    const res = await authApi.forgotPassword('recovery@example.com')

    expect(client.apiClient).toHaveBeenCalledWith('/auth/forgot-password', {
      method: 'POST',
      body: { email: 'recovery@example.com' },
    })
    expect(res).toEqual({ cooldownSeconds: 60 })
  })

  it('calls POST /auth/reset-password and returns reset status', async () => {
    vi.mocked(client.apiClient).mockResolvedValueOnce({ reset: true })

    const res = await authApi.resetPassword({
      email: 'recovery@example.com',
      otp: '025431',
      newPassword: 'NewPassword123@',
    })

    expect(client.apiClient).toHaveBeenCalledWith('/auth/reset-password', {
      method: 'POST',
      body: {
        email: 'recovery@example.com',
        otp: '025431',
        newPassword: 'NewPassword123@',
      },
    })
    expect(res).toEqual({ reset: true })
  })
})
