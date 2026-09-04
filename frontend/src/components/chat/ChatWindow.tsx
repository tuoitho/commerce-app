import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Package, X, MessageCircle, Check, CheckCheck, Loader2, Paperclip } from 'lucide-react'
import { useChatSocket } from '@/hooks/useChatSocket'
import {
  getMessages,
  sendMessage,
  uploadMedia,
  markConversationRead,
  type ChatMessage,
  type AttachedOrderCard,
} from '@/api/chat'
import { OrderPickerModal } from './OrderPickerModal'
import { OrderCardMessage } from './OrderCardMessage'
import { formatChatTime, getOrderStatusInfo } from '@/lib/chatUtils'
import { formatVND, formatDateTime } from '@/lib/utils'
import { ApiError } from '@/api/client'
import { NewMessagesScrollBadge } from './NewMessagesScrollBadge'
import {
  PendingMediaPreview,
  MessageAttachments,
  validateMediaFile,
  type PendingMedia,
} from './MediaAttachmentPreview'

export interface ChatWindowProps {
  preAttachedOrder?: AttachedOrderCard | null
  onClearPreAttachedOrder?: () => void
  incomingMessage?: ChatMessage | null
  messagesReadPayload?: {
    conversationId?: string
    readerRole: 'customer' | 'admin'
    readAt?: string
  } | null
  token?: string | null
}

const MAX_CHAR_COUNT = 2000

export function ChatWindow({
  preAttachedOrder,
  onClearPreAttachedOrder,
  incomingMessage,
  messagesReadPayload,
  token,
}: ChatWindowProps) {

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [attachedOrder, setAttachedOrder] = useState<AttachedOrderCard | null>(
    preAttachedOrder || null
  )
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([])
  const [unreadNewCount, setUnreadNewCount] = useState(0)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isAtBottomRef = useRef(true)
  const seenMessageIdsRef = useRef<Set<string>>(new Set())
  const pendingMediaRef = useRef(pendingMedia)
  pendingMediaRef.current = pendingMedia

  // Clean up object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      pendingMediaRef.current.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl)
        }
      })
    }
  }, [])

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
    }
  }, [])

  // Sync preAttachedOrder prop when it changes
  useEffect(() => {
    if (preAttachedOrder) {
      setAttachedOrder(preAttachedOrder)
    }
  }, [preAttachedOrder])

  // Initial fetch of message stream
  useEffect(() => {
    let isMounted = true
    async function loadMessages() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await getMessages(50, 0)
        if (isMounted) {
          data?.forEach((m) => seenMessageIdsRef.current.add(m.id))
          setMessages(data || [])
          setTimeout(() => scrollToBottom(false), 50)
        }
      } catch {
        if (isMounted) {
          setError('Không thể tải tin nhắn. Vui lòng thử lại.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadMessages()
    return () => {
      isMounted = false
    }
  }, [scrollToBottom])

  // Internal scroll handler for scroll badge and bottom detection
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    isAtBottomRef.current = isBottom
    if (isBottom) {
      if (unreadNewCount > 0) {
        markConversationRead().catch(() => {})
        setUnreadNewCount(0)
      }
    }
  }, [unreadNewCount])

  // Internal message handler for realtime incoming messages
  const handleIncomingMessage = useCallback(
    (msg: ChatMessage) => {
      if (seenMessageIdsRef.current.has(msg.id)) {
        return
      }
      seenMessageIdsRef.current.add(msg.id)

      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      )

      if (msg.senderRole === 'admin') {
        if (isAtBottomRef.current) {
          markConversationRead().catch(() => {})
          setTimeout(() => scrollToBottom(true), 50)
        } else {
          setUnreadNewCount((prev) => prev + 1)
        }
      } else {
        setTimeout(() => scrollToBottom(true), 50)
      }
    },
    [scrollToBottom]
  )

  // Internal read receipt handler
  const handleMessagesRead = useCallback(
    (payload: { readerRole: 'customer' | 'admin' }) => {
      if (payload.readerRole === 'admin') {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.senderRole === 'customer' ? { ...msg, isRead: true } : msg
          )
        )
      }
    },
    []
  )

  // Standalone socket fallback if external socket props are not provided
  const hasExternalSocket = incomingMessage !== undefined || messagesReadPayload !== undefined
  useChatSocket({
    token,
    enabled: !hasExternalSocket,
    onNewMessage: handleIncomingMessage,
    onMessagesRead: handleMessagesRead,
  })

  // Sync incomingMessage from prop if provided
  useEffect(() => {
    if (incomingMessage) {
      handleIncomingMessage(incomingMessage)
    }
  }, [incomingMessage, handleIncomingMessage])

  // Sync messagesReadPayload from prop if provided
  useEffect(() => {
    if (messagesReadPayload) {
      handleMessagesRead(messagesReadPayload)
    }
  }, [messagesReadPayload, handleMessagesRead])

  const handleRemoveAttachedOrder = () => {
    setAttachedOrder(null)
    onClearPreAttachedOrder?.()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    e.target.value = ''

    for (const file of files) {
      const validation = validateMediaFile(file)
      const tempId = Math.random().toString(36).substring(2, 9)
      const previewUrl = URL.createObjectURL(file)

      if (!validation.valid) {
        setPendingMedia((prev) => [
          ...prev,
          {
            tempId,
            file,
            previewUrl,
            fileType: validation.fileType || 'unsupported',
            isUploading: false,
            error: validation.error || 'Tệp không hợp lệ',
          },
        ])
        continue
      }

      const newPending: PendingMedia = {
        tempId,
        file,
        previewUrl,
        fileType: validation.fileType!,
        isUploading: true,
      }

      setPendingMedia((prev) => [...prev, newPending])

      try {
        const uploadedAttachment = await uploadMedia(file)
        setPendingMedia((prev) =>
          prev.map((item) =>
            item.tempId === tempId
              ? { ...item, isUploading: false, attachment: uploadedAttachment }
              : item
          )
        )
      } catch (uploadErr) {
        setPendingMedia((prev) =>
          prev.map((item) =>
            item.tempId === tempId
              ? {
                  ...item,
                  isUploading: false,
                  error:
                    uploadErr instanceof ApiError
                      ? uploadErr.message
                      : 'Không thể tải tệp lên. Vui lòng thử lại.',
                }
              : item
          )
        )
      }
    }
  }

  const handleRemovePendingMedia = (tempId: string) => {
    setPendingMedia((prev) => {
      const target = prev.find((m) => m.tempId === tempId)
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl)
      }
      return prev.filter((m) => m.tempId !== tempId)
    })
  }

  const handleSendMessage = async () => {
    const trimmed = content.trim()
    const validAttachments = pendingMedia
      .map((m) => m.attachment)
      .filter((a): a is import('@/api/chat').ChatAttachment => Boolean(a))
    const isAnyUploading = pendingMedia.some((m) => m.isUploading)

    if (!trimmed && !attachedOrder && validAttachments.length === 0) return
    if (isAnyUploading) return
    if (content.length > MAX_CHAR_COUNT) return

    setIsSending(true)
    setError(null)

    try {
      const sentMsg = await sendMessage({
        content: trimmed,
        attachedOrderId: attachedOrder ? attachedOrder.id : undefined,
        attachmentIds: validAttachments.length > 0 ? validAttachments.map((a) => a.id) : undefined,
      })

      // If backend attachedOrder or attachments were not fully joined, merge our local state
      const resolvedMsg = {
        ...sentMsg,
        attachedOrder: sentMsg.attachedOrder || (attachedOrder ? attachedOrder : null),
        attachments:
          sentMsg.attachments && sentMsg.attachments.length > 0
            ? sentMsg.attachments
            : validAttachments,
      }

      seenMessageIdsRef.current.add(resolvedMsg.id)
      setMessages((prev) =>
        prev.some((m) => m.id === resolvedMsg.id)
          ? prev.map((m) => (m.id === resolvedMsg.id ? resolvedMsg : m))
          : [...prev, resolvedMsg]
      )

      // Clean up pending media preview URLs
      pendingMedia.forEach((m) => {
        if (m.previewUrl) {
          URL.revokeObjectURL(m.previewUrl)
        }
      })
      setPendingMedia([])
      setContent('')
      setAttachedOrder(null)
      onClearPreAttachedOrder?.()
      setUnreadNewCount(0)
      isAtBottomRef.current = true
      setTimeout(() => scrollToBottom(true), 50)
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldMsg =
          err.fields?.attachmentIds || err.fields?.attachedOrderId || err.fields?.content
        setError(fieldMsg || err.message || 'Không thể gửi tin nhắn. Vui lòng thử lại.')
      } else {
        setError('Không thể gửi tin nhắn. Vui lòng thử lại.')
      }
    } finally {
      setIsSending(false)
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const hasValidAttachments = pendingMedia.some((m) => Boolean(m.attachment))
  const isAnyUploading = pendingMedia.some((m) => m.isUploading)
  const isSendDisabled =
    isSending ||
    isAnyUploading ||
    (content.trim() === '' && !attachedOrder && !hasValidAttachments) ||
    content.length > MAX_CHAR_COUNT

  return (
    <div
      data-testid="chat-window-container"
      className="flex flex-1 flex-col h-full overflow-hidden bg-slate-50/50"
    >
      {/* Messages Stream Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            <p className="text-xs">Đang tải cuộc trò chuyện...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-3 shadow-xs">
              <MessageCircle className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-900 mb-1">
              Chưa có tin nhắn nào
            </h4>
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
              Hãy bắt đầu cuộc trò chuyện với đội ngũ tư vấn! Chúng tôi sẵn sàng hỗ trợ bạn bất cứ lúc nào.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isCustomer = msg.senderRole === 'customer'
            return (
              <div
                key={msg.id}
                data-testid={`message-item-${msg.id}`}
                className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}
              >
                {/* Sender label for Support */}
                {!isCustomer && (
                  <span className="mb-1 text-[11px] font-semibold text-slate-500 px-1">
                    {msg.senderName || 'Hỗ trợ viên'}
                  </span>
                )}

                {/* Attached Order Card if present */}
                {msg.attachedOrder && (
                  <OrderCardMessage order={msg.attachedOrder} isCustomerSender={isCustomer} />
                )}

                {/* Message Bubble (if content is present) */}
                {msg.content && (
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed max-w-[85%] break-words shadow-xs ${
                      isCustomer
                        ? 'rounded-tr-xs bg-emerald-600 text-white'
                        : 'rounded-tl-xs bg-white text-slate-900 border border-slate-200/80'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                )}

                {/* Attached Media if present */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <MessageAttachments attachments={msg.attachments} token={token} />
                )}

                {/* Meta: Timestamp and Read Receipt */}
                <div
                  className={`flex items-center gap-1 mt-1 px-1 text-[10px] text-slate-400 ${
                    isCustomer ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <span>{formatChatTime(msg.createdAt)}</span>
                  {isCustomer && (
                    <span className="flex items-center gap-0.5 ml-1">
                      {msg.isRead ? (
                        <>
                          <CheckCheck className="h-3 w-3 text-emerald-600" />
                          <span className="text-emerald-700 font-medium">Đã xem</span>
                        </>
                      ) : (
                        <>
                          <Check className="h-3 w-3 text-slate-400" />
                          <span>Đã gửi</span>
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
        <NewMessagesScrollBadge
          count={unreadNewCount}
          onClick={() => {
            scrollToBottom(true)
            markConversationRead().catch(() => {})
            setUnreadNewCount(0)
            isAtBottomRef.current = true
          }}
        />
      </div>

      {/* Error alert if any */}
      {error && (
        <div className="bg-rose-50 border-t border-rose-200 px-3 py-1.5 text-[11px] text-rose-700 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Composer Section */}
      <div className="border-t border-slate-100 bg-white">
        {/* Attached Order Preview Chip */}
        {attachedOrder && (
          <div
            data-testid="attached-order-preview"
            className="flex items-center justify-between gap-2 border-b border-slate-100 bg-emerald-50/50 px-3 py-2 text-xs text-slate-800"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                <Package className="h-3.5 w-3.5" />
              </div>
              <div className="truncate">
                <span className="font-semibold text-slate-900 font-mono">
                  #{attachedOrder.id}
                </span>{' '}
                {attachedOrder.createdAt && (
                  <>
                    •{' '}
                    <span className="text-[11px] text-slate-500 font-normal">
                      {formatDateTime(attachedOrder.createdAt)}
                    </span>{' '}
                  </>
                )}
                •{' '}
                <span
                  className={`rounded px-1.5 py-0.2 text-[10px] font-medium ${
                    getOrderStatusInfo(attachedOrder.status).badgeClass
                  }`}
                >
                  {getOrderStatusInfo(attachedOrder.status).label}
                </span>{' '}
                • <span className="font-bold tabular-nums">{formatVND(attachedOrder.totalVnd)}</span>
              </div>
            </div>
            <button
              type="button"
              data-testid="remove-attached-order-btn"
              onClick={handleRemoveAttachedOrder}
              aria-label="Gỡ bỏ đính kèm đơn hàng"
              className="rounded p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Pending Media Preview */}
        <PendingMediaPreview
          pendingMedia={pendingMedia}
          onRemove={handleRemovePendingMedia}
        />

        {/* Text Input Area */}
        <div className="p-3">
          <div className="relative flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/20 transition">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập tin nhắn..."
              rows={2}
              maxLength={MAX_CHAR_COUNT}
              className="w-full resize-none bg-transparent p-2.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
            />

            {/* Controls bar: Attach order, Attach media, Character count, and Send */}
            <div className="flex items-center justify-between px-2.5 pb-2 pt-1 border-t border-slate-100/80">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="attach-order-btn"
                  onClick={() => setIsPickerOpen(true)}
                  aria-label="Đính kèm đơn hàng"
                  title="Đính kèm đơn hàng"
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition ${
                    attachedOrder
                      ? 'bg-emerald-100 text-emerald-800 font-semibold'
                      : 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-800'
                  }`}
                >
                  <Package className="h-3.5 w-3.5" />
                  <span>Đơn hàng</span>
                </button>

                {/* Hidden File Input for Media Upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="chat-file-input"
                />

                <button
                  type="button"
                  data-testid="attach-media-btn"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Đính kèm hình ảnh hoặc video"
                  title="Đính kèm hình ảnh hoặc video"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200/60 hover:text-slate-800 transition"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>Hình ảnh/Video</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] tabular-nums ${
                    content.length > MAX_CHAR_COUNT ? 'text-rose-600 font-bold' : 'text-slate-400'
                  }`}
                >
                  {content.length}/{MAX_CHAR_COUNT}
                </span>

                <button
                  type="button"
                  data-testid="send-message-btn"
                  onClick={handleSendMessage}
                  disabled={isSendDisabled}
                  aria-label="Gửi tin nhắn"
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                    isSendDisabled
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 active:scale-95'
                  }`}
                >
                  {isSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Order Picker Modal */}
      <OrderPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelectOrder={(order) => {
          setAttachedOrder(order)
          textareaRef.current?.focus()
        }}
        selectedOrderId={attachedOrder?.id}
      />
    </div>
  )
}
