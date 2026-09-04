/**
 * Helper utility functions for admin chat components.
 */

export function formatUnreadCount(count: number): string {
  if (count <= 0) return ''
  if (count > 99) return '99+'
  return count.toString()
}

export function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Không trực tuyến'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return 'Không trực tuyến'
    const now = Date.now()
    const diffMs = now - d.getTime()
    if (diffMs < 0) return 'Vừa mới truy cập'
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffMin < 1) {
      return 'Vừa mới truy cập'
    }
    if (diffMin < 60) {
      return `Hoạt động ${diffMin} phút trước`
    }
    if (diffHour < 24) {
      return `Hoạt động ${diffHour} giờ trước`
    }
    if (diffDay === 1) {
      return 'Hoạt động hôm qua'
    }
    if (diffDay < 7) {
      return `Hoạt động ${diffDay} ngày trước`
    }
    return 'Hoạt động gần đây'
  } catch {
    return 'Không trực tuyến'
  }
}

export interface OrderStatusInfo {
  label: string
  badgeClass: string
}

export const ORDER_STATUS_MAP: Record<string, OrderStatusInfo> = {
  pending_confirmation: {
    label: 'Chờ xác nhận',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
  },
  confirmed: {
    label: 'Đã xác nhận',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200/80',
  },
  preparing: {
    label: 'Đang chuẩn bị hàng',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
  },
  cancel_requested: {
    label: 'Chờ duyệt hủy',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200/80',
  },
  shipped: {
    label: 'Đang giao hàng',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200/80',
  },
  delivered: {
    label: 'Đã giao hàng',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  },
  cancelled: {
    label: 'Đã hủy',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200/80',
  },
  partially_returned: {
    label: 'Trả hàng một phần',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200/80',
  },
  returned: {
    label: 'Trả hàng',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200/80',
  },
}

export function getOrderStatusInfo(status: string): OrderStatusInfo {
  return (
    ORDER_STATUS_MAP[status] || {
      label: status,
      badgeClass: 'bg-slate-100 text-slate-800 border-slate-200/80',
    }
  )
}

export function formatChatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const timePart = `${hours}:${minutes}`

    const now = new Date()
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()

    if (isToday) {
      return timePart
    }

    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${timePart} ${day}/${month}`
  } catch {
    return ''
  }
}
