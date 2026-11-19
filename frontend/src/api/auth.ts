import { apiClient } from './client'
import type {
  ForgotPasswordResponse,
  ResetPasswordInput,
  ResetPasswordResponse,
  SessionResponse,
  User,
} from './types'

export const authApi = {
  async register(email: string, password: string): Promise<SessionResponse> {
    return apiClient<SessionResponse>('/auth/register', {
      method: 'POST',
      body: { email, password },
    })
  },

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

  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    return apiClient<ForgotPasswordResponse>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    })
  },

  async resetPassword(input: ResetPasswordInput): Promise<ResetPasswordResponse> {
    return apiClient<ResetPasswordResponse>('/auth/reset-password', {
      method: 'POST',
      body: input,
    })
  },
}
