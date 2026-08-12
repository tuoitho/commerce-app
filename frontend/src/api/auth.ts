import { api } from './client'

export interface User {
  id: string
  email: string
}

export interface Session {
  user: User
  accessToken: string
}

export async function register(email: string, password: string): Promise<Session> {
  return api.post<Session>('/auth/register', { email, password })
}

export async function login(email: string, password: string): Promise<Session> {
  return api.post<Session>('/auth/login', { email, password })
}

export async function logout(): Promise<void> {
  await api.post<void>('/auth/logout')
}

export async function fetchMe(): Promise<User> {
  const body = await api.get<{ user: User }>('/auth/me')
  return body.user
}

export async function refresh(): Promise<Session> {
  return api.post<Session>('/auth/refresh')
}