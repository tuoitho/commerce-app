import { apiClient } from './client'
import type { SessionResponse, User } from './types'

export const authApi = {
  async login(email: string, password: string): Promise<SessionResponse> {
    return apiClient<SessionResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    })
  },

  async refresh(): Promise<SessionResponse> {
    return apiClient<SessionResponse>('/auth/refresh', {
      method: 'POST',
      skipAuthRefresh: true,
    })
  },

  async logout(): Promise<void> {
    return apiClient<void>('/auth/logout', {
      method: 'POST',
      skipAuthRefresh: true,
    })
  },

  async getMe(): Promise<User> {
    return apiClient<User>('/auth/me')
  },
}
