import { useState, useRef, useLayoutEffect } from 'react'
import { ArrowDown, Loader2, MessageCircle } from 'lucide-react'
import type { ChatMessage } from '@/api/chat'
import { OrderMessageCard } from './OrderMessageCard'

export interface ChatMessageListProps {
  messages: ChatMessage[]
  hasMore?: boolean
  isLoadingOlder?: boolean
  onLoadOlder?: () => Promise<void> | void
  currentUserId?: string
  linkPrefix?: string
}

export function ChatMessageList({
  messages,
  hasMore = false,
  isLoadingOlder = false,
  onLoadOlder,
  currentUserId,
  linkPrefix = '/orders/',
}: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [newMessagesCount, setNewMessagesCount] = useState(0)

  // Track if user was near bottom before state updates
  const isNearBottomRef = useRef(true)
  const prevMessagesRef = useRef<ChatMessage[]>([])
  const scrollBeforeLoadRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)

  const handleScroll = () => {
    const container = containerRef.current
    if (!container) return

    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    const nearBottom = distanceFromBottom <= 100
    isNearBottomRef.current = nearBottom

    if (nearBottom && newMessagesCount > 0) {
      setNewMessagesCount(0)
    }

    // Near top: trigger load older
    if (scrollTop <= 30 && hasMore && !isLoadingOlder && onLoadOlder) {
      scrollBeforeLoadRef.current = {
        scrollHeight: container.scrollHeight,
        scrollTop: container.scrollTop,
      }
      onLoadOlder()
    }
  }

  // Handle message updates: preserving scroll on prepend or auto-scroll / badge on append
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const prevMessages = prevMessagesRef.current
    prevMessagesRef.current = messages

    if (prevMessages.length === 0) {
      // First load: scroll to bottom
      container.scrollTop = container.scrollHeight
      isNearBottomRef.current = true
      return
    }

    // Check if messages were prepended at top
    const wasPrepended =
      messages.length > prevMessages.length &&
      messages[messages.length - 1]?.id === prevMessages[prevMessages.length - 1]?.id

    if (wasPrepended && scrollBeforeLoadRef.current) {
      const { scrollHeight: oldScrollHeight, scrollTop: oldScrollTop } = scrollBeforeLoadRef.current
      const newScrollHeight = container.scrollHeight
      const heightDiff = newScrollHeight - oldScrollHeight
      container.scrollTop = oldScrollTop + heightDiff
      scrollBeforeLoadRef.current = null
      return
    }

    // Check if new message was appended at bottom
    const wasAppended =
      messages.length > prevMessages.length &&
      messages[0]?.id === prevMessages[0]?.id

    if (wasAppended) {
      if (isNearBottomRef.current) {
        container.scrollTo?.({ top: container.scrollHeight, behavior: 'smooth' })
        // Fallback for jsdom
        container.scrollTop = container.scrollHeight
        setNewMessagesCount(0)
      } else {
        const addedCount = messages.length - prevMessages.length
        setNewMessagesCount((prev) => prev + addedCount)
      }
    }
  }, [messages])

  const scrollToBottom = () => {
    const container = containerRef.current
    if (container) {
      container.scrollTo?.({ top: container.scrollHeight, behavior: 'smooth' })
      container.scrollTop = container.scrollHeight
    }
    setNewMessagesCount(0)
    isNearBottomRef.current = true
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        data-testid="chat-message-list-container"
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50"
      >
        {/* Loading older messages indicator */}
        {isLoadingOlder && (
          <div
            data-testid="loading-older-indicator"
            className="flex items-center justify-center py-2 text-xs text-slate-500 gap-1.5"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
            <span>Đang tải tin nhắn cũ...</span>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-xs text-slate-400 px-6">
            <MessageCircle className="h-10 w-10 text-slate-300 mb-2" />
            <p className="font-medium text-slate-600">Bắt đầu cuộc trò chuyện</p>
            <p className="mt-1">
              Đặt câu hỏi về đơn hàng, kích thước hoặc tư vấn kỹ thuật trực tiếp với cửa hàng.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = currentUserId
              ? msg.senderId === currentUserId
              : msg.senderRole === 'customer'

            return (
              <div
                key={msg.id}
                data-testid={`chat-message-${msg.id}`}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm ${
                    isMe
                      ? 'bg-emerald-600 text-white rounded-br-none'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                  }`}
                >
                  {/* Order Context Attachment Card */}
                  {msg.messageType === 'order' && msg.orderSummary && (
                    <div className="mb-2">
                      <OrderMessageCard orderSummary={msg.orderSummary} linkPrefix={linkPrefix} />
                    </div>
                  )}

                  {/* Text Content */}
                  {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}

                  {/* Media Attachments */}
                  {msg.media && msg.media.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {msg.media.map((m) => (
                        <div key={m.id} className="overflow-hidden rounded-lg border border-black/10">
                          {m.mediaType === 'image' ? (
                            <img
                              src={m.url}
                              alt={m.fileName}
                              className="max-h-48 w-full object-cover cursor-pointer hover:opacity-95"
                              onClick={() => window.open(m.url, '_blank')}
                            />
                          ) : (
                            <video
                              src={m.url}
                              controls
                              preload="metadata"
                              className="max-h-48 w-full rounded-lg"
                            >
                              Trình duyệt không hỗ trợ phát video.
                            </video>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <span className="mt-1 text-[10px] text-slate-400 px-1">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* Floating Jump-to-Bottom New Message Notification Pill */}
      {newMessagesCount > 0 && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Tin nhắn mới, cuộn xuống dưới cùng"
          data-testid="jump-to-bottom-button"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg transition-all hover:bg-emerald-700 hover:scale-105 animate-bounce z-10"
        >
          <span>Có {newMessagesCount} tin mới</span>
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
