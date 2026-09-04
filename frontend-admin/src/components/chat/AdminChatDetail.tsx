import { useState, useRef, useEffect, type UIEvent } from 'react'
import { Clock, User, Check, CheckCheck, Loader2, AlertCircle, ZoomIn } from 'lucide-react'
import type { AdminConversation, AdminChatMessage } from '@/api/chat'
import { getAuthenticatedAdminMediaUrl } from '@/api/chat'
import { formatChatTime, formatRelativeTime } from '@/lib/chatUtils'
import { AdminOrderCardMessage } from './AdminOrderCardMessage'
import { AdminImageLightbox } from './AdminImageLightbox'
import { AdminNewMessagesScrollBadge } from './AdminNewMessagesScrollBadge'
import { AdminReplyComposer } from './AdminReplyComposer'

export interface AdminChatDetailProps {
  conversation: AdminConversation
  messages: AdminChatMessage[]
  isLoadingMessages: boolean
  isErrorMessages: boolean
  errorMessage?: string
  onRetryMessages: () => void
  onSendMessage: (payload: { content?: string; attachmentIds?: string[] }) => Promise<void>
  onMarkAsRead: () => void
  token?: string | null
}

export function AdminChatDetail({
  conversation,
  messages,
  isLoadingMessages,
  isErrorMessages,
  errorMessage,
  onRetryMessages,
  onSendMessage,
  onMarkAsRead,
  token,
}: AdminChatDetailProps) {
  const [activeImage, setActiveImage] = useState<string | null>(null)
  const [unreadNewCount, setUnreadNewCount] = useState(0)

  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const isAtBottomRef = useRef(true)
  const prevMessagesLengthRef = useRef(messages.length)
  const prevConversationIdRef = useRef(conversation.id)

  const scrollToBottom = (smooth = false) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end',
      })
    }
  }

  // Mark as read when opening conversation with unread messages
  useEffect(() => {
    if (conversation.unreadCount > 0) {
      onMarkAsRead()
    }
  }, [conversation.id, conversation.unreadCount, onMarkAsRead])

  // Handle conversation change
  useEffect(() => {
    if (prevConversationIdRef.current !== conversation.id) {
      prevConversationIdRef.current = conversation.id
      setUnreadNewCount(0)
      isAtBottomRef.current = true
      prevMessagesLengthRef.current = messages.length
      setTimeout(() => scrollToBottom(false), 50)
    }
  }, [conversation.id, messages.length])

  // Handle new incoming messages
  useEffect(() => {
    const diff = messages.length - prevMessagesLengthRef.current
    prevMessagesLengthRef.current = messages.length

    if (diff > 0) {
      if (isAtBottomRef.current) {
        scrollToBottom(true)
        onMarkAsRead()
      } else {
        setUnreadNewCount((prev) => prev + diff)
      }
    }
  }, [messages.length, onMarkAsRead])

  // Scroll listener
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight
    const atBottom = distanceToBottom < 60
    isAtBottomRef.current = atBottom

    if (atBottom && unreadNewCount > 0) {
      setUnreadNewCount(0)
      onMarkAsRead()
    }
  }

  const handleBadgeClick = () => {
    scrollToBottom(true)
    setUnreadNewCount(0)
    onMarkAsRead()
  }

  return (
    <div
      data-testid="admin-chat-detail-container"
      className="flex-1 flex flex-col h-full overflow-hidden bg-white"
    >
      {/* Conversation Header */}
      <div className="h-16 border-b border-slate-200 px-6 flex items-center justify-between shrink-0 bg-white shadow-2xs z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-xs uppercase">
              {conversation.customerName
                ? conversation.customerName.slice(0, 2)
                : 'KH'}
            </div>
            <span
              data-testid="admin-chat-header-presence"
              title={conversation.isOnline ? 'Đang trực tuyến' : formatRelativeTime(conversation.customerLastActive)}
              className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
                conversation.isOnline ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {conversation.customerName || conversation.customerEmail}
            </h3>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{conversation.customerEmail}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {conversation.isOnline
                  ? 'Đang trực tuyến'
                  : formatRelativeTime(conversation.customerLastActive)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Stream Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        data-testid="admin-chat-messages-stream"
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50 relative"
      >
        {isLoadingMessages ? (
          <div
            data-testid="admin-messages-loading"
            className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2"
          >
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-xs">Đang tải tin nhắn...</span>
          </div>
        ) : isErrorMessages ? (
          <div
            data-testid="admin-messages-error"
            className="p-6 text-center text-rose-600 flex flex-col items-center gap-2"
          >
            <AlertCircle className="h-6 w-6 text-rose-500" />
            <p className="text-xs font-medium">{errorMessage || 'Không thể tải tin nhắn'}</p>
            <button
              type="button"
              onClick={onRetryMessages}
              className="mt-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
            >
              Thử lại
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div
            data-testid="admin-messages-empty"
            className="flex flex-col items-center justify-center h-48 text-center text-slate-400"
          >
            <p className="text-xs font-medium text-slate-600">
              Chưa có tin nhắn nào trong cuộc hội thoại này
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Hãy gửi tin nhắn đầu tiên để hỗ trợ khách hàng
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isAdmin = msg.senderRole === 'admin'
            return (
              <div
                key={msg.id}
                data-testid={`admin-chat-message-${msg.id}`}
                className={`flex gap-3 items-end ${isAdmin ? 'justify-end' : 'justify-start'}`}
              >
                {/* Customer Avatar on the left */}
                {!isAdmin && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 font-semibold text-xs uppercase">
                    {msg.senderName ? msg.senderName.slice(0, 2) : <User className="h-4 w-4" />}
                  </div>
                )}

                {/* Message Bubble */}
                <div className={`max-w-[75%] sm:max-w-[70%] space-y-1 ${isAdmin ? 'items-end' : 'items-start'}`}>
                  {/* Sender Name & Time */}
                  <div
                    className={`flex items-center gap-1.5 text-[10px] text-slate-400 ${
                      isAdmin ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span className="font-medium text-slate-600">{msg.senderName || (isAdmin ? 'Hỗ trợ viên' : 'Khách hàng')}</span>
                    <span>•</span>
                    <span className="tabular-nums">{formatChatTime(msg.createdAt)}</span>
                  </div>

                  {/* Attached Order Card (if any) */}
                  {msg.attachedOrder && (
                    <AdminOrderCardMessage order={msg.attachedOrder} />
                  )}

                  {/* Text Bubble */}
                  {msg.content && (
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed break-words whitespace-pre-wrap shadow-2xs ${
                        isAdmin
                          ? 'bg-blue-600 text-white rounded-br-xs'
                          : 'bg-white text-slate-900 border border-slate-200/80 rounded-bl-xs'
                      }`}
                    >
                      {msg.content}
                    </div>
                  )}

                  {/* Attachments (Images & Videos) */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {msg.attachments.map((att) => {
                        if (att.fileType === 'image') {
                          const authUrl = getAuthenticatedAdminMediaUrl(att.fileUrl, token)
                          return (
                            <button
                              type="button"
                              key={att.id}
                              data-testid={`attachment-image-${att.id}`}
                              aria-label={att.fileName || 'Xem ảnh phóng to'}
                              onClick={() => setActiveImage(authUrl)}
                              className="group relative max-h-52 max-w-xs overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 cursor-pointer shadow-xs text-left focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            >
                              <img
                                src={authUrl}
                                alt={att.fileName || 'Ảnh đính kèm'}
                                loading="lazy"
                                className="max-h-52 w-auto object-cover transition duration-150 group-hover:scale-[1.02]"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 group-hover:bg-black/20 group-hover:opacity-100 transition">
                                <ZoomIn className="h-5 w-5 text-white drop-shadow-md" />
                              </div>
                            </button>
                          )
                        }

                        if (att.fileType === 'video') {
                          const authVideoUrl = getAuthenticatedAdminMediaUrl(att.fileUrl, token)
                          return (
                            <div
                              key={att.id}
                              data-testid={`attachment-video-${att.id}`}
                              className="w-full max-w-sm overflow-hidden rounded-xl border border-slate-200/80 bg-black shadow-xs"
                            >
                              <video
                                controls
                                preload="metadata"
                                className="max-h-60 w-full object-contain"
                              >
                                <source src={authVideoUrl} type={att.mimeType || 'video/mp4'} />
                                Trình duyệt không hỗ trợ xem video trực tiếp.
                              </video>
                            </div>
                          )
                        }

                        return null
                      })}
                    </div>
                  )}

                  {/* Read / Sent Status Indicator for Admin */}
                  {isAdmin && (
                    <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 pt-0.5">
                      {msg.isRead ? (
                        <span className="inline-flex items-center gap-0.5 text-blue-600 font-medium">
                          <CheckCheck className="h-3 w-3" />
                          <span>Đã xem</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-slate-400">
                          <Check className="h-3 w-3" />
                          <span>Đã gửi</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Admin Avatar on the right */}
                {isAdmin && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-semibold text-xs uppercase">
                    AD
                  </div>
                )}
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating New Messages Badge */}
      <AdminNewMessagesScrollBadge
        count={unreadNewCount}
        onClick={handleBadgeClick}
      />

      {/* Composer */}
      <AdminReplyComposer
        conversationId={conversation.id}
        onSendMessage={onSendMessage}
        disabled={isLoadingMessages || isErrorMessages}
      />

      {/* Fullscreen Lightbox Modal */}
      <AdminImageLightbox
        src={activeImage || ''}
        isOpen={Boolean(activeImage)}
        onClose={() => setActiveImage(null)}
      />
    </div>
  )
}
