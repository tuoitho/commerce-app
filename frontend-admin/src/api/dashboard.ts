import { apiClient } from './client'
import type { OrderStatus } from './types'

export type DashboardRange = 'today' | '7d' | '30d'

export interface DailyRevenueItem {
  date: string
  deliveredVnd: string
  refundedVnd: string
  netVnd: string
}

export interface DashboardRevenue {
  deliveredVnd: string
  refundedVnd: string
  netVnd: string
  deliveredOrders: number
  averageOrderVnd: string
}

export interface DashboardOrders {
  newInRange: number
  cancelledInRange: number
  byStatus: Record<OrderStatus, number>
}

export interface DashboardPendingWork {
  pendingConfirmationOrders: number
  cancelRequestedOrders: number
  pendingApprovalReturns: number
  receivedReturns: number
  unrepliedReviews: number
  unreadConversations: number
}

export interface DashboardTopProduct {
  productId: string
  name: string
  brand: string
  imageUrl: string
  active: boolean
  quantitySold: number
  revenueVnd: string
}

export interface DashboardOptionItem {
  groupLabel: string
  valueLabel: string
}

export interface DashboardLowStockItem {
  variantId: string
  productId: string
  productName: string
  options: DashboardOptionItem[]
  stockQuantity: number
}

export interface DashboardLowStock {
  threshold: number
  total: number
  items: DashboardLowStockItem[]
}

export interface DashboardData {
  range: DashboardRange
  rangeStart: string
  generatedAt: string
  revenue: DashboardRevenue
  dailyRevenue: DailyRevenueItem[]
  orders: DashboardOrders
  pendingWork: DashboardPendingWork
  topProducts: DashboardTopProduct[]
  lowStock: DashboardLowStock
}

export async function getDashboard(range?: DashboardRange): Promise<DashboardData> {
  const path = range ? `/admin/dashboard?range=${encodeURIComponent(range)}` : '/admin/dashboard'
  return apiClient<DashboardData>(path)
}
