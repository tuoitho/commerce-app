import { apiClient } from './client'
import type { SessionResponse, User } from './types'

export interface UpdateProfilePayload {
  displayName: string | null
  phone: string | null
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

export const accountApi = {
  async getProfile(): Promise<User> {
    return apiClient<User>('/account/profile')
  },

  async updateProfile(payload: UpdateProfilePayload): Promise<User> {
    return apiClient<User>('/account/profile', {
      method: 'PUT',
      body: payload,
    })
  },

  async uploadAvatar(file: File): Promise<User> {
    const formData = new FormData()
    formData.append('avatar', file)
    return apiClient<User>('/account/avatar', {
      method: 'POST',
      body: formData,
    })
  },

  async deleteAvatar(): Promise<User> {
    return apiClient<User>('/account/avatar', {
      method: 'DELETE',
    })
  },

  async changePassword(payload: ChangePasswordPayload): Promise<SessionResponse> {
    return apiClient<SessionResponse>('/account/password', {
      method: 'PUT',
      body: payload,
    })
  },
}
