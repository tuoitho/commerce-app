import { describe, it, expect, vi, beforeEach } from 'vitest'
import { accountApi } from './account'
import { apiClient } from './client'

vi.mock('./client', () => ({
  apiClient: vi.fn(),
}))

describe('accountApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls GET /account/profile', async () => {
    const profile = { id: '1', email: 'khach@example.com', displayName: 'Minh Anh', phone: '0912345678', avatarUrl: null }
    vi.mocked(apiClient).mockResolvedValueOnce(profile)

    const res = await accountApi.getProfile()
    expect(apiClient).toHaveBeenCalledWith('/account/profile')
    expect(res).toEqual(profile)
  })

  it('calls PUT /account/profile with trimmed or nullable fields', async () => {
    const payload = { displayName: 'Nguyễn Minh Anh', phone: null }
    vi.mocked(apiClient).mockResolvedValueOnce({ id: '1', email: 'khach@example.com', ...payload })

    await accountApi.updateProfile(payload)
    expect(apiClient).toHaveBeenCalledWith('/account/profile', {
      method: 'PUT',
      body: payload,
    })
  })

  it('uploads avatar via POST /account/avatar with FormData key "avatar"', async () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'avatar.png', { type: 'image/png' })
    vi.mocked(apiClient).mockResolvedValueOnce({ id: '1', email: 'khach@example.com', avatarUrl: '/media/avatars/x.png' })

    await accountApi.uploadAvatar(file)
    expect(apiClient).toHaveBeenCalledTimes(1)
    const [path, opts] = vi.mocked(apiClient).mock.calls[0]
    expect(path).toBe('/account/avatar')
    expect(opts?.method).toBe('POST')
    const sentBody = opts?.body
    expect(sentBody).toBeInstanceOf(FormData)
    expect((sentBody as FormData).get('avatar')).toBe(file)
  })

  it('calls DELETE /account/avatar', async () => {
    vi.mocked(apiClient).mockResolvedValueOnce({ id: '1', email: 'khach@example.com', avatarUrl: null })

    await accountApi.deleteAvatar()
    expect(apiClient).toHaveBeenCalledWith('/account/avatar', { method: 'DELETE' })
  })

  it('calls PUT /account/password', async () => {
    const session = { user: { id: '1', email: 'khach@example.com' }, accessToken: 'new-jwt' }
    vi.mocked(apiClient).mockResolvedValueOnce(session)

    const res = await accountApi.changePassword({ currentPassword: 'old12345', newPassword: 'new12345' })
    expect(apiClient).toHaveBeenCalledWith('/account/password', {
      method: 'PUT',
      body: { currentPassword: 'old12345', newPassword: 'new12345' },
    })
    expect(res).toEqual(session)
  })
})
