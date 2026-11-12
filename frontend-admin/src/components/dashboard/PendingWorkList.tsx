import React from 'react'
import { Link } from 'react-router-dom'
import type { DashboardPendingWork } from '@/api/dashboard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Clock,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  MessageSquare,
  MessageCircle,
  ChevronRight,
} from 'lucide-react'

interface PendingWorkListProps {
  pendingWork: DashboardPendingWork
}

interface PendingWorkItemConfig {
  id: string
  title: string
  count: number
  target: string
  icon: React.ElementType
}

export const PendingWorkList: React.FC<PendingWorkListProps> = ({ pendingWork }) => {
  const items: PendingWorkItemConfig[] = [
    {
      id: 'pending-confirmation',
      title: 'Đơn chờ xác nhận',
      count: pendingWork.pendingConfirmationOrders,
      target: '/orders?status=pending_confirmation',
      icon: Clock,
    },
    {
      id: 'cancel-requested',
      title: 'Yêu cầu hủy đơn',
      count: pendingWork.cancelRequestedOrders,
      target: '/orders?status=cancel_requested',
      icon: AlertTriangle,
    },
    {
      id: 'pending-approval-returns',
      title: 'Đổi trả chờ duyệt',
      count: pendingWork.pendingApprovalReturns,
      target: '/returns?status=pending_approval',
      icon: RotateCcw,
    },
    {
      id: 'received-returns',
      title: 'Đổi trả chờ hoàn tiền',
      count: pendingWork.receivedReturns,
      target: '/returns?status=received',
      icon: CheckCircle,
    },
    {
      id: 'unreplied-reviews',
      title: 'Đánh giá chưa phản hồi',
      count: pendingWork.unrepliedReviews,
      target: '/reviews?has_reply=no',
      icon: MessageSquare,
    },
    {
      id: 'unread-conversations',
      title: 'Hội thoại chưa đọc',
      count: pendingWork.unreadConversations,
      target: '/chat?filter=unread',
      icon: MessageCircle,
    },
  ]

  return (
    <Card className="border-slate-200/80 shadow-xs">
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg font-semibold text-slate-900">
          Việc cần xử lý
        </CardTitle>
        <CardDescription className="text-xs text-slate-500 mt-0.5">
          Các tác vụ khách hàng đang chờ quản trị viên phản hồi hoặc phê duyệt
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => {
            const Icon = item.icon
            const isHighlighted = item.count > 0

            return (
              <Link
                key={item.id}
                to={item.target}
                data-testid={`pending-work-${item.id}`}
                data-highlighted={isHighlighted ? 'true' : 'false'}
                className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 select-none ${
                  isHighlighted
                    ? 'border-amber-200/90 bg-amber-50/30 hover:bg-amber-50/70 hover:border-amber-300'
                    : 'border-slate-200/70 bg-white hover:bg-slate-50/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`p-2 rounded-lg ${
                      isHighlighted ? 'bg-amber-100/80 text-amber-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs sm:text-sm font-medium truncate ${
                      isHighlighted ? 'text-slate-900 font-semibold' : 'text-slate-700'
                    }`}>
                      {item.title}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={isHighlighted ? 'default' : 'outline'}
                    className={
                      isHighlighted
                        ? 'bg-amber-600 hover:bg-amber-700 text-white font-bold px-2 py-0.5 text-xs'
                        : 'text-slate-400 font-normal px-2 py-0.5 text-xs'
                    }
                  >
                    {item.count}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
