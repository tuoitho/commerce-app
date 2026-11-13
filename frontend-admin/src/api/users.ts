import { apiClient, apiClientWithMeta } from './client'
import type { ApiResponseWithMeta } from './client'
import type { OrderStatus } from './types'

export type UserRole = 'customer' | 'admin'
export type UserStatus = 'active' | 'locked'

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Khách hàng',
  admin: 'Quản trị viên',
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Hoạt động',
  locked: 'Đã khóa',
}

export interface AdminUserSummary {
  id: string
  email: string
  role: UserRole
  status: UserStatus
  orderCount: number
  createdAt: string
}

export interface AdminUserRecentOrder {
  id: string
  status: OrderStatus
  totalVnd: string
  createdAt: string
}

export interface AdminUserDetail {
  id: string
  email: string
  role: UserRole
  status: UserStatus
  createdAt: string
  lockedAt: string | null
  lockReason: string | null
  orderSummary: {
    totalOrders: number
    deliveredOrders: number
    deliveredTotalVnd: string
    lastOrderAt: string | null
  }
  recentOrders: AdminUserRecentOrder[]
}

export interface ListAdminUsersParams {
  search?: string
  role?: UserRole
  status?: UserStatus
  page?: number
  limit?: number
}

export const listAdminUsers = async (
  params: ListAdminUsersParams = {}
): Promise<ApiResponseWithMeta<AdminUserSummary[]>> => {
  const query = new URLSearchParams()
  if (params.search) query.append('search', params.search)
  if (params.role) query.append('role', params.role)
  if (params.status) query.append('status', params.status)
  if (params.page) query.append('page', String(params.page))
  if (params.limit) query.append('limit', String(params.limit))
  const qs = query.toString()
  return apiClientWithMeta<AdminUserSummary[]>(`/admin/users${qs ? '?' + qs : ''}`)
}

export const getAdminUser = async (id: string): Promise<AdminUserDetail> => {
  return apiClient<AdminUserDetail>(`/admin/users/${id}`)
}

export const lockAdminUser = async (id: string, reason: string): Promise<AdminUserDetail> => {
  return apiClient<AdminUserDetail>(`/admin/users/${id}/lock`, {
    method: 'POST',
    body: { reason: reason || null },
  })
}

export const unlockAdminUser = async (id: string): Promise<AdminUserDetail> => {
  return apiClient<AdminUserDetail>(`/admin/users/${id}/unlock`, { method: 'POST' })
}
