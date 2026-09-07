import { MessageCircle, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ChatConversation } from '@/api/chat'
import { formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface AdminConversationListProps {
  conversations: ChatConversation[]
  selectedConvId?: string
  onSelectConversation: (conv: ChatConversation) => void
  isLoading?: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
  unreadOnly: boolean
  onUnreadOnlyChange: (val: boolean) => void
  totalItems: number
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  onRefresh: () => void
}

export function AdminConversationList({
  conversations,
  selectedConvId,
  onSelectConversation,
  isLoading = false,
  searchQuery,
  onSearchChange,
  unreadOnly,
  onUnreadOnlyChange,
  totalItems,
  page,
  totalPages,
  onPageChange,
  onRefresh,
}: AdminConversationListProps) {
  return (
    <div
      data-testid="admin-conversation-list"
      className="w-full lg:w-96 border-r border-slate-200 bg-white flex flex-col shrink-0 h-full"
    >
      {/* Header & Filters */}
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-blue-600" />
            <span>Hỗ trợ tin nhắn</span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900"
            title="Làm mới"
            aria-label="Làm mới danh sách"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm kiếm khách hàng..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 font-medium select-none">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => onUnreadOnlyChange(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
            />
            <span>Chỉ tin nhắn chưa đọc</span>
          </label>

          <span className="text-[11px] text-slate-400">
            Tổng {totalItems} cuộc hội thoại
          </span>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Đang tải danh sách...</div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Không có cuộc hội thoại nào phù hợp
          </div>
        ) : (
          conversations.map((c) => {
            const isSelected = selectedConvId === c.id
            const isOnline = c.customerPresence?.status === 'online'
            const customerDisplayName =
              c.customerName || `Khách: ${c.userId ? c.userId.slice(0, 8) : ''}`

            return (
              <div
                key={c.id}
                data-testid={`conversation-item-${c.id}`}
                onClick={() => onSelectConversation(c)}
                className={`p-3.5 transition-colors cursor-pointer flex flex-col gap-1.5 ${
                  isSelected ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      data-testid={`presence-dot-${c.id}`}
                      className={`h-2.5 w-2.5 rounded-full ${
                        isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                      title={c.customerPresence?.displayText || (isOnline ? 'Đang hoạt động' : 'Ngoại tuyến')}
                    />
                    <span className="text-xs font-bold text-slate-800 truncate max-w-[160px]">
                      {customerDisplayName}
                    </span>
                  </div>
                  {c.adminUnreadCount > 0 && (
                    <span
                      data-testid={`unread-badge-${c.id}`}
                      className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm"
                    >
                      {c.adminUnreadCount} mới
                    </span>
                  )}
                </div>

                {/* Last message snippet */}
                {c.lastMessage ? (
                  <div className="text-[11px] text-slate-600 truncate">
                    {c.lastMessage.messageType === 'order' ? (
                      <span className="text-blue-600 font-medium">[Đơn hàng] </span>
                    ) : null}
                    {c.lastMessage.content ||
                      (c.lastMessage.hasMedia ? '[Hình ảnh/Video]' : '')}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 italic">Chưa có tin nhắn</div>
                )}

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                  <span data-testid={`presence-text-${c.id}`}>
                    {c.customerPresence?.displayText || (isOnline ? 'Đang hoạt động' : 'Không trực tuyến')}
                  </span>
                  <span>{c.lastMessageAt ? formatDateTime(c.lastMessageAt) : ''}</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-slate-200 flex items-center justify-between text-xs bg-slate-50">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="h-7 px-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-slate-600">
            Trang {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="h-7 px-2"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
