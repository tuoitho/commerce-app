import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MessageCircle, X, ShieldCheck, LogIn } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useChatSocket } from '@/hooks/useChatSocket'
import {
  getConversation,
  markConversationRead,
  type ChatMessage,
  type AttachedOrderCard,
  type WSEventMessagesRead,
} from '@/api/chat'
import { cn } from '@/lib/utils'
import { formatUnreadCount, formatRelativeTime } from '@/lib/chatUtils'
import { ChatWindow } from './ChatWindow'

export function ChatWidget() {
  const { isAuthenticated, accessToken } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [preAttachedOrder, setPreAttachedOrder] = useState<AttachedOrderCard | null>(null)
  const [incomingMessage, setIncomingMessage] = useState<ChatMessage | null>(null)
  const [messagesReadPayload, setMessagesReadPayload] = useState<WSEventMessagesRead['payload'] | null>(null)

  const handleNewMessage = useCallback(
    (msg: ChatMessage) => {
      if (msg.senderRole === 'admin') {
        if (!isOpen) {
          setUnreadCount((prev) => prev + 1)
        } else {
          // If popup is currently open, mark read immediately
          markConversationRead().catch(() => {})
        }
      }
      setIncomingMessage(msg)
    },
    [isOpen]
  )

  const handleMessagesRead = useCallback(
    (payload: WSEventMessagesRead['payload']) => {
      if (payload.readerRole === 'customer') {
        setUnreadCount(0)
      }
      setMessagesReadPayload(payload)
    },
    []
  )

  useEffect(() => {
    const handleOpenWithOrder = (event: Event) => {
      const customEvent = event as CustomEvent<{ order?: AttachedOrderCard; orderId?: string }>
      setIsOpen(true)
      if (customEvent.detail?.order) {
        setPreAttachedOrder(customEvent.detail.order)
      }
      if (unreadCount > 0) {
        setUnreadCount(0)
        markConversationRead().catch(() => {})
      }
    }
    window.addEventListener('open-chat-with-order', handleOpenWithOrder)
    return () => window.removeEventListener('open-chat-with-order', handleOpenWithOrder)
  }, [unreadCount])

  const {
    isSupportOnline,
    supportLastActiveAt,
    setSupportOnline,
  } = useChatSocket({
    token: accessToken,
    enabled: isAuthenticated,
    onNewMessage: handleNewMessage,
    onMessagesRead: handleMessagesRead,
  })

  // Fetch initial conversation info when authenticated
  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      setUnreadCount(0)
      return
    }

    let isMounted = true
    async function loadConversation() {
      try {
        const conv = await getConversation()
        if (isMounted && conv) {
          setUnreadCount(conv.unreadCount || 0)
          setSupportOnline(conv.isOnline)
        }
      } catch {
        // Silently fail if conversation cannot be fetched yet
      }
    }

    loadConversation()
    return () => {
      isMounted = false
    }
  }, [isAuthenticated, accessToken, setSupportOnline])

  const handleToggle = () => {
    const nextState = !isOpen
    setIsOpen(nextState)

    if (nextState && isAuthenticated && unreadCount > 0) {
      setUnreadCount(0)
      markConversationRead().catch(() => {})
    }
  }

  const handleLoginRedirect = () => {
    const redirectTarget = encodeURIComponent(location.pathname + location.search)
    navigate(`/login?redirect=${redirectTarget}`)
  }

  return (
    <>
      {/* Chat Popup Window */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Cửa sổ trò chuyện hỗ trợ"
          className="fixed bottom-24 right-6 z-50 flex h-[540px] max-h-[calc(100vh-8rem)] w-[380px] max-w-[calc(100vw-2rem)] sm:w-[400px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3.5 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60 font-medium text-sm">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                </div>
                {isAuthenticated && (
                  <span
                    data-testid="presence-indicator"
                    className={cn(
                      'absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white',
                      isSupportOnline ? 'bg-emerald-500' : 'bg-slate-400'
                    )}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-slate-900">Đội ngũ hỗ trợ</h3>
                {isAuthenticated ? (
                  <p data-testid="presence-text" className="truncate text-xs text-slate-500">
                    {isSupportOnline ? 'Đang trực tuyến' : formatRelativeTime(supportLastActiveAt)}
                  </p>
                ) : (
                  <p className="truncate text-xs text-slate-500">Hỗ trợ khách hàng</p>
                )}
              </div>
            </div>

            <button
              type="button"
              data-testid="close-chat-popup"
              onClick={() => setIsOpen(false)}
              aria-label="Đóng cửa sổ trò chuyện"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          {isAuthenticated ? (
            <ChatWindow
              preAttachedOrder={preAttachedOrder}
              onClearPreAttachedOrder={() => setPreAttachedOrder(null)}
              incomingMessage={incomingMessage}
              messagesReadPayload={messagesReadPayload}
              token={accessToken}
            />
          ) : (
            /* Unauthenticated Login Prompt */
            <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-4 shadow-xs">
                <LogIn className="h-7 w-7" />
              </div>
              <h4 className="text-base font-semibold text-slate-900 mb-2">
                Đăng nhập để trò chuyện
              </h4>
              <p className="text-xs text-slate-600 max-w-xs mb-6 leading-relaxed">
                Vui lòng đăng nhập để bắt đầu trò chuyện với nhân viên hỗ trợ và theo dõi tình trạng đơn hàng của bạn.
              </p>
              <button
                type="button"
                onClick={handleLoginRedirect}
                className="w-full max-w-xs rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-emerald-700 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                Đăng nhập
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Widget Button */}
      <button
        type="button"
        onClick={handleToggle}
        aria-label={isOpen ? 'Đóng khung trò chuyện' : 'Mở khung trò chuyện hỗ trợ'}
        aria-expanded={isOpen}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-700 hover:scale-105 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2'
        )}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}

        {!isOpen && unreadCount > 0 && (
          <span
            data-testid="unread-badge"
            className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white shadow ring-2 ring-white"
          >
            {formatUnreadCount(unreadCount)}
          </span>
        )}
      </button>
    </>
  )
}
